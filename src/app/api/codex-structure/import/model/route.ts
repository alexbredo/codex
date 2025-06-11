
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import type { ExportedModelBundle, Model, Property, DataObject, WorkflowWithDetails, WorkflowState, ValidationRuleset, StructuralChangeDetail, ChangelogEventData } from '@/lib/types';
import { z } from 'zod';

// Schema for basic validation of the imported bundle
const exportedModelBundleSchema = z.object({
  model: z.object({
    id: z.string().uuid("Model ID must be a valid UUID."),
    name: z.string().min(1, "Model name cannot be empty."),
    description: z.string().optional().nullable(),
    namespace: z.string().min(1, "Model namespace cannot be empty."),
    displayPropertyNames: z.array(z.string()).optional().nullable(),
    workflowId: z.string().uuid().optional().nullable(),
    properties: z.array(z.object({ // Basic property structure
      id: z.string().uuid("Property ID must be a valid UUID."),
      name: z.string().min(1),
      type: z.string(), // Further validation would be too complex here, rely on good export
      orderIndex: z.number().int(),
      // other property fields are assumed to be present as per Property type
    })).min(1, "Model must have at least one property."),
  }),
  dataObjects: z.array(z.object({ // Basic data object structure
    id: z.string().uuid("Data Object ID must be a valid UUID."),
    // data blob content varies, rely on good export
  })),
});


export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized. Administrator role required for import.' }, { status: 403 });
  }

  const db = await getDb();
  
  try {
    const body = await request.json();
    const fileContent = body.fileContent;

    if (!fileContent || typeof fileContent !== 'string') {
      return NextResponse.json({ error: 'File content is missing or not a string.' }, { status: 400 });
    }

    let parsedJson: ExportedModelBundle;
    try {
      parsedJson = JSON.parse(fileContent);
    } catch (error) {
      console.error("API Import Error: Invalid JSON format.", error);
      return NextResponse.json({ error: 'Invalid JSON format in the uploaded file.' }, { status: 400 });
    }

    // Validate the parsed JSON against the Zod schema
    const validationResult = exportedModelBundleSchema.safeParse(parsedJson);
    if (!validationResult.success) {
      console.error("API Import Error: JSON structure validation failed.", validationResult.error.flatten());
      return NextResponse.json({ error: 'JSON structure validation failed.', details: validationResult.error.flatten().fieldErrors }, { status: 400 });
    }
    
    const { model: importedModelData, dataObjects: importedDataObjects } = validationResult.data;
    const currentTimestamp = new Date().toISOString();
    const warnings: string[] = [];

    // --- Start Transaction ---
    await db.run('BEGIN TRANSACTION');

    // 1. Check for Model ID and Name conflicts
    const existingModelById = await db.get('SELECT id FROM models WHERE id = ?', importedModelData.id);
    if (existingModelById) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: `Model import failed: A model with ID ${importedModelData.id} already exists in the target system.` }, { status: 409 });
    }
    const existingModelByName = await db.get('SELECT id FROM models WHERE name = ?', importedModelData.name);
    if (existingModelByName) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: `Model import failed: A model with name "${importedModelData.name}" already exists (ID: ${existingModelByName.id}). Please rename the model in the import file or the existing model.` }, { status: 409 });
    }

    // 2. Validate Workflow ID
    let finalWorkflowId = importedModelData.workflowId || null;
    if (finalWorkflowId) {
      const workflowExists = await db.get('SELECT id FROM workflows WHERE id = ?', finalWorkflowId);
      if (!workflowExists) {
        warnings.push(`Workflow ID "${finalWorkflowId}" specified for model "${importedModelData.name}" was not found in the target system. Workflow association has been removed.`);
        finalWorkflowId = null;
      }
    }
    
    // 3. Insert Model
    await db.run(
      'INSERT INTO models (id, name, description, namespace, displayPropertyNames, workflowId) VALUES (?, ?, ?, ?, ?, ?)',
      importedModelData.id,
      importedModelData.name,
      importedModelData.description || null,
      importedModelData.namespace || 'Default',
      JSON.stringify(importedModelData.displayPropertyNames || []),
      finalWorkflowId
    );

    // 4. Process and Insert Properties
    const importedProperties: Property[] = [];
    for (const prop of importedModelData.properties) {
      const newPropertyId = crypto.randomUUID(); // Generate new ID for property

      // Validate relatedModelId if type is 'relationship'
      let finalRelatedModelId = (prop as any).relatedModelId || null;
      if ((prop as any).type === 'relationship' && finalRelatedModelId) {
        const relatedModelExists = await db.get('SELECT id FROM models WHERE id = ?', finalRelatedModelId);
        if (!relatedModelExists) {
          await db.run('ROLLBACK');
          return NextResponse.json({ error: `Import failed: Property "${prop.name}" in model "${importedModelData.name}" refers to a relatedModelId "${finalRelatedModelId}" that does not exist in the target system.` }, { status: 400 });
        }
      } else if ((prop as any).type !== 'relationship') {
        finalRelatedModelId = null; // Ensure it's null if not a relationship
      }

      // Validate validationRulesetId if type is 'string'
      let finalValidationRulesetId = (prop as any).validationRulesetId || null;
      if ((prop as any).type === 'string' && finalValidationRulesetId) {
        const rulesetExists = await db.get('SELECT id FROM validation_rulesets WHERE id = ?', finalValidationRulesetId);
        if (!rulesetExists) {
          warnings.push(`ValidationRuleset ID "${finalValidationRulesetId}" for property "${prop.name}" in model "${importedModelData.name}" not found. Rule not applied.`);
          finalValidationRulesetId = null;
        }
      } else if ((prop as any).type !== 'string') {
        finalValidationRulesetId = null;
      }
      
      const fullPropData: Property = {
        id: newPropertyId,
        model_id: importedModelData.id,
        name: prop.name,
        type: (prop as any).type as Property['type'],
        relatedModelId: finalRelatedModelId,
        required: !!(prop as any).required,
        relationshipType: (prop as any).relationshipType || ((prop as any).type === 'relationship' ? 'one' : undefined),
        unit: (prop as any).unit || null,
        precision: (prop as any).precision !== undefined ? Number((prop as any).precision) : null,
        autoSetOnCreate: !!(prop as any).autoSetOnCreate,
        autoSetOnUpdate: !!(prop as any).autoSetOnUpdate,
        isUnique: !!(prop as any).isUnique,
        orderIndex: prop.orderIndex,
        defaultValue: (prop as any).defaultValue || null,
        validationRulesetId: finalValidationRulesetId,
        minValue: (prop as any).minValue !== undefined ? Number((prop as any).minValue) : null,
        maxValue: (prop as any).maxValue !== undefined ? Number((prop as any).maxValue) : null,
      };

      await db.run(
        'INSERT INTO properties (id, model_id, name, type, relatedModelId, required, relationshipType, unit, precision, autoSetOnCreate, autoSetOnUpdate, isUnique, orderIndex, defaultValue, validationRulesetId, minValue, maxValue) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        fullPropData.id, fullPropData.model_id, fullPropData.name, fullPropData.type, fullPropData.relatedModelId,
        fullPropData.required ? 1 : 0, fullPropData.relationshipType, fullPropData.unit, fullPropData.precision,
        fullPropData.autoSetOnCreate ? 1 : 0, fullPropData.autoSetOnUpdate ? 1 : 0,
        fullPropData.isUnique ? 1 : 0, fullPropData.orderIndex, fullPropData.defaultValue,
        fullPropData.validationRulesetId, fullPropData.minValue, fullPropData.maxValue
      );
      importedProperties.push(fullPropData);
    }
    
    // Log Model Creation
    const modelChangelogId = crypto.randomUUID();
    const createdModelSnapshot = {
        ...importedModelData, // Use original ID for the snapshot
        properties: importedProperties.map(p => ({ ...p, id: crypto.randomUUID() })), // Log with *new* property IDs if needed for consistency, or original if preferred
        workflowId: finalWorkflowId, // Use validated workflowId
    };
    await db.run(
      'INSERT INTO structural_changelog (id, timestamp, userId, entityType, entityId, entityName, action, changes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      modelChangelogId, currentTimestamp, currentUser.id, 'Model', importedModelData.id, importedModelData.name, 'CREATE', JSON.stringify(createdModelSnapshot)
    );

    // 5. Process and Insert Data Objects
    let importedObjectCount = 0;
    for (const obj of importedDataObjects) {
      const newObjectId = crypto.randomUUID(); // Generate new ID for data object
      const { id: _originalObjId, createdAt, updatedAt, ownerId, currentStateId, ...dataPayload } = obj as any;

      let finalOwnerId = ownerId || null;
      if (finalOwnerId) {
        const ownerExists = await db.get('SELECT id FROM users WHERE id = ?', finalOwnerId);
        if (!ownerExists) {
          warnings.push(`Owner ID "${finalOwnerId}" for imported object (original ID ${_originalObjId}) not found. Owner set to null.`);
          finalOwnerId = null;
        }
      }
      
      let finalCurrentStateId = currentStateId || null;
      if (finalCurrentStateId && finalWorkflowId) { // Only validate state if workflow is assigned
        const stateExistsInWorkflow = await db.get('SELECT id FROM workflow_states WHERE id = ? AND workflowId = ?', finalCurrentStateId, finalWorkflowId);
        if (!stateExistsInWorkflow) {
          warnings.push(`State ID "${finalCurrentStateId}" for imported object (original ID ${_originalObjId}) not found in workflow "${finalWorkflowId}". Attempting to set to initial state.`);
          const initialWfState = await db.get('SELECT id FROM workflow_states WHERE workflowId = ? AND isInitial = 1', finalWorkflowId);
          finalCurrentStateId = initialWfState?.id || null;
          if (!initialWfState) warnings.push(`No initial state found for workflow "${finalWorkflowId}". State set to null for object (original ID ${_originalObjId}).`);
        }
      } else if (finalCurrentStateId && !finalWorkflowId) { // State ID provided but no workflow on model
        warnings.push(`State ID "${finalCurrentStateId}" provided for object (original ID ${_originalObjId}), but model "${importedModelData.name}" has no workflow. State set to null.`);
        finalCurrentStateId = null;
      }
      
      const objectDataToStore = {
        ...dataPayload,
        createdAt: createdAt || currentTimestamp, // Preserve if exists, else use current
        updatedAt: updatedAt || currentTimestamp, // Preserve if exists, else use current
      };

      await db.run(
        'INSERT INTO data_objects (id, model_id, data, currentStateId, ownerId, isDeleted, deletedAt) VALUES (?, ?, ?, ?, ?, 0, NULL)',
        newObjectId, importedModelData.id, JSON.stringify(objectDataToStore), finalCurrentStateId, finalOwnerId
      );
      
      // Log Data Object Creation
      const dataObjectChangelogId = crypto.randomUUID();
      const objectCreationChangelogEvent: ChangelogEventData = {
        type: 'CREATE',
        initialData: { ...objectDataToStore } 
      };
      delete objectCreationChangelogEvent.initialData?.createdAt;
      delete objectCreationChangelogEvent.initialData?.updatedAt;

      await db.run(
        'INSERT INTO data_object_changelog (id, dataObjectId, modelId, changedAt, changedByUserId, changeType, changes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        dataObjectChangelogId, newObjectId, importedModelData.id, currentTimestamp, currentUser.id, 'CREATE', JSON.stringify(objectCreationChangelogEvent)
      );
      importedObjectCount++;
    }

    // --- Commit Transaction ---
    await db.run('COMMIT');

    let message = `Successfully imported model "${importedModelData.name}" (ID: ${importedModelData.id}) with ${importedObjectCount} data object(s).`;
    if (warnings.length > 0) {
      message += ` Warnings: ${warnings.join('; ')}`;
    }

    return NextResponse.json({ message, modelName: importedModelData.name, modelId: importedModelData.id, objectCount: importedObjectCount, warnings }, { status: 201 });

  } catch (error: any) {
    await db.run('ROLLBACK');
    console.error('API Import - Unhandled Error during import process:', error);
    return NextResponse.json({ error: 'Failed to process model import due to an unexpected server error.', details: error.message }, { status: 500 });
  }
}
    