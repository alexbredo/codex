

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Model, Property, WorkflowWithDetails, WorkflowState, StructuralChangeDetail } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth';

interface Params {
  params: { modelId: string };
}

// GET a single model by ID
export async function GET(request: Request, { params }: Params) {
  try {
    const db = await getDb();
    const modelRow = await db.get('SELECT * FROM models WHERE id = ?', params.modelId);

    if (!modelRow) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    const propertiesFromDb = await db.all('SELECT * FROM properties WHERE model_id = ? ORDER BY orderIndex ASC', params.modelId);

    let parsedDisplayPropertyNames: string[] = [];
    if (modelRow.displayPropertyNames && typeof modelRow.displayPropertyNames === 'string') {
        try {
            const tempParsed = JSON.parse(modelRow.displayPropertyNames);
            if (Array.isArray(tempParsed)) {
                parsedDisplayPropertyNames = tempParsed.filter(name => typeof name === 'string');
            }
        } catch (parseError: any) {
            console.warn(`API (GET /models/[modelId]): Could not parse displayPropertyNames for model ${modelRow.id}: '${modelRow.displayPropertyNames}'. Error: ${parseError.message}`);
        }
    }

    const model: Model = {
      id: modelRow.id,
      name: modelRow.name,
      description: modelRow.description,
      modelGroupId: modelRow.model_group_id,
      displayPropertyNames: parsedDisplayPropertyNames,
      properties: propertiesFromDb.map(p_row => {
        if (!p_row || typeof p_row.type === 'undefined') {
            console.warn(`API (GET /models/[modelId]): Malformed property data for model ${modelRow.id}, property id ${p_row?.id}:`, p_row);
            return {
                id: p_row?.id || `unknown_prop_${Date.now()}`,
                model_id: modelRow.id,
                name: p_row?.name || 'Unknown Property',
                type: p_row?.type || 'string',
                relatedModelId: p_row?.relatedModelId,
                required: p_row?.required === 1,
                relationshipType: p_row?.relationshipType,
                unit: p_row?.unit,
                precision: p_row?.precision,
                autoSetOnCreate: p_row?.autoSetOnCreate === 1,
                autoSetOnUpdate: p_row?.autoSetOnUpdate === 1,
                isUnique: p_row?.isUnique === 1,
                orderIndex: p_row?.orderIndex ?? 0,
                defaultValue: p_row?.defaultValue,
                validationRulesetId: p_row?.validationRulesetId ?? null,
                minValue: p_row?.minValue ?? null,
                maxValue: p_row?.maxValue ?? null,
            } as Property;
        }
        return {
            id: p_row.id,
            model_id: p_row.model_id,
            name: p_row.name,
            type: p_row.type,
            relatedModelId: p_row.relatedModelId,
            required: p_row.required === 1,
            relationshipType: p_row.relationshipType,
            unit: p_row.unit,
            precision: p_row.precision,
            autoSetOnCreate: p_row.autoSetOnCreate === 1,
            autoSetOnUpdate: p_row.autoSetOnUpdate === 1,
            isUnique: p_row.isUnique === 1,
            orderIndex: p_row.orderIndex,
            defaultValue: p_row.defaultValue,
            validationRulesetId: p_row.validationRulesetId ?? null,
            minValue: p_row.minValue ?? null,
            maxValue: p_row.maxValue ?? null,
        } as Property;
      }),
      workflowId: modelRow.workflowId === undefined ? null : modelRow.workflowId,
    };
    return NextResponse.json(model);
  } catch (error: any) {
    const errorMessage = error.message || `An unknown server error occurred while fetching model ${params.modelId}.`;
    const errorStack = error.stack || 'No stack trace available.';
    console.error(`API Error (GET /models/[modelId]) - Failed to fetch model ${params.modelId}. Message: ${errorMessage}, Stack: ${errorStack}`, error);
    return NextResponse.json({ error: 'Failed to fetch model', details: errorMessage }, { status: 500 });
  }
}

// PUT (update) a model
export async function PUT(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const db = await getDb();
  await db.run('BEGIN TRANSACTION');
  
  try {
    const body: Partial<Model> & { properties?: Property[] } = await request.json();
    console.log(`[API PUT /models/${params.modelId}] - Received body:`, JSON.stringify(body, null, 2));

    const currentTimestamp = new Date().toISOString();
    
    const oldModelRow = await db.get('SELECT * FROM models WHERE id = ?', params.modelId);
    if (!oldModelRow) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }
    const oldPropertiesFromDb = await db.all('SELECT * FROM properties WHERE model_id = ? ORDER BY orderIndex ASC', params.modelId);
    
    // ================================================================
    // Step 1: Update core model metadata (name, description, group, etc.) with robust logic
    // ================================================================
    const changelogDetails: StructuralChangeDetail[] = [];

    // Determine final values, preferring request body but falling back to old data
    const finalName = body.name ?? oldModelRow.name;
    const finalDescription = 'description' in body ? body.description : oldModelRow.description;
    const finalModelGroupId = 'modelGroupId' in body ? body.modelGroupId : oldModelRow.model_group_id;
    const finalDisplayPropertyNames = 'displayPropertyNames' in body ? JSON.stringify(body.displayPropertyNames || []) : oldModelRow.displayPropertyNames;
    const finalWorkflowId = 'workflowId' in body ? body.workflowId : oldModelRow.workflowId;

    // Log what we're about to do
    console.log(`[API PUT /models/${params.modelId}] - FINAL VALUES TO SAVE:`, { finalName, finalDescription, finalModelGroupId, finalDisplayPropertyNames, finalWorkflowId });
    
    // Execute the static, robust update
    await db.run(
        'UPDATE models SET name = ?, description = ?, model_group_id = ?, displayPropertyNames = ?, workflowId = ? WHERE id = ?',
        finalName,
        finalDescription,
        finalModelGroupId,
        finalDisplayPropertyNames,
        finalWorkflowId,
        params.modelId
    );
    console.log(`[API PUT /models/${params.modelId}] - Core model metadata update successful.`);

    // ================================================================
    // Step 2: Handle properties update
    // ================================================================
    let newProcessedProperties: Property[] = oldPropertiesFromDb.map(p_row => ({ ...p_row, required: !!p_row.required, autoSetOnCreate: !!p_row.autoSetOnCreate, autoSetOnUpdate: !!p_row.autoSetOnUpdate, isUnique: !!p_row.isUnique } as Property));
    
    if (body.properties) {
      console.log(`[API PUT /models/${params.modelId}] - Starting properties update.`);
      await db.run('DELETE FROM properties WHERE model_id = ?', params.modelId);
      
      newProcessedProperties = [];
      for (const prop of body.properties) {
        const propertyId = prop.id || crypto.randomUUID();
        const propMinValueForDb = (prop.type === 'number' && typeof prop.minValue === 'number' && !isNaN(prop.minValue)) ? Number(prop.minValue) : null;
        const propMaxValueForDb = (prop.type === 'number' && typeof prop.maxValue === 'number' && !isNaN(prop.maxValue)) ? Number(prop.maxValue) : null;
        
        await db.run(
          'INSERT INTO properties (id, model_id, name, type, relatedModelId, required, relationshipType, unit, precision, autoSetOnCreate, autoSetOnUpdate, isUnique, orderIndex, defaultValue, validationRulesetId, minValue, maxValue) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          propertyId, params.modelId, prop.name, prop.type, prop.relatedModelId,
          prop.required ? 1 : 0, prop.relationshipType, prop.unit, prop.precision,
          prop.autoSetOnCreate ? 1 : 0, prop.autoSetOnUpdate ? 1 : 0,
          prop.isUnique ? 1 : 0, prop.orderIndex, prop.defaultValue ?? null,
          prop.validationRulesetId ?? null,
          propMinValueForDb,
          propMaxValueForDb
        );
        newProcessedProperties.push({
            ...prop, id: propertyId, model_id: params.modelId, 
            required: !!prop.required, autoSetOnCreate: !!prop.autoSetOnCreate, autoSetOnUpdate: !!prop.autoSetOnUpdate, isUnique: !!prop.isUnique,
            defaultValue: prop.defaultValue, validationRulesetId: prop.validationRulesetId ?? null, minValue: propMinValueForDb, maxValue: propMaxValueForDb
        } as Property);
      }
      console.log(`[API PUT /models/${params.modelId}] - Properties re-insertion committed successfully.`);
    }
    
    // ================================================================
    // Step 3: Handle workflow side-effects (if workflow changed)
    // ================================================================
    if ('workflowId' in body && body.workflowId !== oldModelRow.workflowId) {
      console.log(`[API PUT /models/${params.modelId}] - Workflow changed. Updating object states.`);
      if (body.workflowId) { 
        const workflowForUpdate: WorkflowWithDetails | undefined = await db.get('SELECT * FROM workflows WHERE id = ?', body.workflowId);
        if (workflowForUpdate) {
          const statesForUpdate: WorkflowState[] = await db.all('SELECT id, isInitial FROM workflow_states WHERE workflowId = ?', body.workflowId);
          const initialStateForUpdate = statesForUpdate.find(s => s.isInitial === 1 || s.isInitial === true);
          await db.run("UPDATE data_objects SET currentStateId = ? WHERE model_id = ?", initialStateForUpdate?.id || null, params.modelId);
        } else {
          await db.run("UPDATE data_objects SET currentStateId = NULL WHERE model_id = ?", params.modelId);
        }
      } else { 
        await db.run("UPDATE data_objects SET currentStateId = NULL WHERE model_id = ?", params.modelId);
      }
    }
    
    // ================================================================
    // Step 4: Log the changes
    // ================================================================
    // Name
    if (finalName !== oldModelRow.name) changelogDetails.push({ field: 'name', oldValue: oldModelRow.name, newValue: finalName });
    // Description
    if (finalDescription !== oldModelRow.description) changelogDetails.push({ field: 'description', oldValue: oldModelRow.description, newValue: finalDescription });
    // Model Group
    if (finalModelGroupId !== oldModelRow.model_group_id) changelogDetails.push({ field: 'modelGroupId', oldValue: oldModelRow.model_group_id, newValue: finalModelGroupId });
    // Display Properties
    if (finalDisplayPropertyNames !== oldModelRow.displayPropertyNames) {
        const safeJsonParse = (jsonString: string | null | undefined, defaultValue: any = []) => {
            if (!jsonString) return defaultValue;
            try { return JSON.parse(jsonString); } catch { return defaultValue; }
        };
        changelogDetails.push({ field: 'displayPropertyNames', oldValue: safeJsonParse(oldModelRow.displayPropertyNames), newValue: body.displayPropertyNames || [] });
    }
    // Workflow
    if (finalWorkflowId !== oldModelRow.workflowId) changelogDetails.push({ field: 'workflowId', oldValue: oldModelRow.workflowId, newValue: finalWorkflowId });
    // Properties list
    const oldPropsForLog = oldPropertiesFromDb.map(p => ({name: p.name, type: p.type, orderIndex: p.orderIndex, required: !!p.required}));
    const newPropsForLog = newProcessedProperties.map(p => ({name: p.name, type: p.type, orderIndex: p.orderIndex, required: !!p.required}));
    if(JSON.stringify(oldPropsForLog) !== JSON.stringify(newPropsForLog)){
        changelogDetails.push({ field: 'properties', oldValue: oldPropsForLog, newValue: newPropsForLog });
    }

    if (changelogDetails.length > 0) {
        const changelogId = crypto.randomUUID();
        await db.run(
          'INSERT INTO structural_changelog (id, timestamp, userId, entityType, entityId, entityName, action, changes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          changelogId, currentTimestamp, currentUser.id, 'Model', params.modelId, finalName, 'UPDATE', JSON.stringify(changelogDetails)
        );
        console.log(`[API PUT /models/${params.modelId}] - Changelog entry created.`);
    } else {
        console.log(`[API PUT /models/${params.modelId}] - No changes detected for changelog.`);
    }

    // ================================================================
    // Step 5: Commit transaction and return updated model
    // ================================================================
    await db.run('COMMIT');

    const refreshedModelRow = await db.get('SELECT * FROM models WHERE id = ?', params.modelId);
    const refreshedPropertiesFromDb = await db.all('SELECT * FROM properties WHERE model_id = ? ORDER BY orderIndex ASC', params.modelId);

    let refreshedParsedDpn: string[] = [];
    if (refreshedModelRow.displayPropertyNames && typeof refreshedModelRow.displayPropertyNames === 'string') {
        try {
            const temp = JSON.parse(refreshedModelRow.displayPropertyNames);
            if (Array.isArray(temp)) refreshedParsedDpn = temp.filter(name => typeof name === 'string');
        } catch (e: any) {
            console.warn(`API (PUT /models/[modelId]): Invalid JSON for displayPropertyNames for model ${refreshedModelRow.id} after update: ${refreshedModelRow.displayPropertyNames}. Error: ${e.message}`);
        }
    }
    
    const returnedModel: Model = {
      id: refreshedModelRow.id,
      name: refreshedModelRow.name,
      description: refreshedModelRow.description,
      modelGroupId: refreshedModelRow.model_group_id,
      displayPropertyNames: refreshedParsedDpn,
      properties: refreshedPropertiesFromDb.map(p_row => ({
        ...(p_row as any), 
        required: p_row.required === 1,
        autoSetOnCreate: p_row.autoSetOnCreate === 1,
        autoSetOnUpdate: p_row.autoSetOnUpdate === 1,
        isUnique: p_row.isUnique === 1,
        validationRulesetId: p_row.validationRulesetId ?? null,
        minValue: p_row.minValue ?? null,
        maxValue: p_row.maxValue ?? null,
      }) as Property),
      workflowId: refreshedModelRow.workflowId === undefined ? null : refreshedModelRow.workflowId,
    };
    console.log(`[API PUT /models/${params.modelId}] - UPDATE REQUEST COMPLETED SUCCESSFULLY. Returning updated model.`);
    return NextResponse.json(returnedModel);

  } catch (error: any) {
    console.error(`[API PUT /models/${params.modelId}] - Unhandled error in PUT handler. Rolling back. Error:`, error);
    await db.run('ROLLBACK');
    
    let errorMessage = `Failed to update model. The operation was rolled back due to an internal error.`;
    let errorDetails = (error instanceof Error) ? error.message : 'An unknown error occurred.';
    
    return NextResponse.json({ error: errorMessage, details: errorDetails }, { status: 500 });
  }
}

// DELETE a model
export async function DELETE(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  const db = await getDb();
  await db.run('BEGIN TRANSACTION');
  try {
    const currentTimestamp = new Date().toISOString();
    const modelToDelete = await db.get('SELECT * FROM models WHERE id = ?', params.modelId);
    
    if (!modelToDelete) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }
    
    const oldPropertiesFromDb = await db.all('SELECT * FROM properties WHERE model_id = ?', params.modelId);
    const modelSnapshot = {
      ...modelToDelete,
      properties: oldPropertiesFromDb.map(p => ({
        name: p.name, type: p.type, orderIndex: p.orderIndex, required: !!p.required,
        relatedModelId: p.relatedModelId, relationshipType: p.relationshipType, unit: p.unit, 
        precision: p.precision, autoSetOnCreate: !!p.autoSetOnCreate, autoSetOnUpdate: !!p.autoSetOnUpdate, 
        isUnique: !!p.isUnique, defaultValue: p.defaultValue, validationRulesetId: p.validationRulesetId,
        minValue: p.minValue, maxValue: p.maxValue
      }))
    };

    await db.run('DELETE FROM models WHERE id = ?', params.modelId); // Properties and data_objects are deleted via CASCADE
    
    // Log structural change for model deletion
    const changelogId = crypto.randomUUID();
    await db.run(
      'INSERT INTO structural_changelog (id, timestamp, userId, entityType, entityId, entityName, action, changes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      changelogId,
      currentTimestamp,
      currentUser.id,
      'Model',
      params.modelId,
      modelToDelete.name, 
      'DELETE',
      JSON.stringify(modelSnapshot) 
    );

    await db.run('COMMIT');

    return NextResponse.json({ message: 'Model deleted successfully' });
  } catch (error: any) {
    try { await db.run('ROLLBACK'); } catch (rbError) { console.error("Rollback failed in DELETE /models/[modelId]:", rbError); }
    
    const errorMessage = error.message || `An unknown server error occurred while deleting model ${params.modelId}.`;
    const errorStack = error.stack || 'No stack trace available.';
    console.error(`API Error (DELETE /models/[modelId]) - Failed to delete model ${params.modelId}. Message: ${errorMessage}, Stack: ${errorStack}`, error);
    return NextResponse.json({ error: 'Failed to delete model', details: errorMessage }, { status: 500 });
  }
}

    
