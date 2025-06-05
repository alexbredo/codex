
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Model, Property, WorkflowWithDetails, WorkflowState } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth'; // Auth helper

interface Params {
  params: { modelId: string };
}

// Helper function to parse default values on the server
function parseDefaultValueForStorage(value: string | undefined | null, type: Property['type'], relationshipType?: Property['relationshipType']): any {
  if (value === undefined || value === null || String(value).trim() === '') {
    return undefined;
  }

  switch (type) {
    case 'string':
    case 'markdown':
    case 'image':
      return String(value).trim();
    case 'number':
    case 'rating':
      const num = parseFloat(value);
      return isNaN(num) ? undefined : num;
    case 'boolean':
      return String(value).toLowerCase() === 'true';
    case 'date':
      try {
        const date = new Date(value);
        // Check if it's a valid date string, not just "Invalid Date" from new Date("")
        if (isNaN(date.getTime()) && String(value).trim() !== '') return String(value).trim(); // Keep original invalid string if not empty
        return isNaN(date.getTime()) ? undefined : date.toISOString(); // Return ISO or undefined if really invalid/empty
      } catch {
        return String(value).trim(); // Fallback if new Date throws (should be rare)
      }
    case 'relationship':
      if (relationshipType === 'many') {
        try {
          const parsedArray = JSON.parse(value);
          if (Array.isArray(parsedArray) && parsedArray.every(item => typeof item === 'string')) {
            return parsedArray;
          }
        } catch (e) {
          const ids = String(value).split(',').map(id => id.trim()).filter(id => id !== '');
          if (ids.length > 0) return ids;
        }
        return [];
      }
      return String(value).trim();
    default:
      return String(value).trim();
  }
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
      namespace: modelRow.namespace || 'Default',
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
    const body: Partial<Omit<Model, 'id'>> & { properties?: Property[], workflowId?: string | null } = await request.json();
    console.log(`[API PUT /models/:id DEBUG] Received payload for update:`, JSON.stringify(body, null, 2));
    
    const { name, description, namespace, displayPropertyNames, properties: updatedPropertiesInput } = body;

    const existingModel = await db.get('SELECT * FROM models WHERE id = ?', params.modelId);
    if (!existingModel) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    if (name && name !== existingModel.name) {
        const nameCheck = await db.get('SELECT id FROM models WHERE name = ? AND id != ?', name, params.modelId);
        if (nameCheck) {
            await db.run('ROLLBACK');
            return NextResponse.json({ error: 'A model with this name already exists.' }, { status: 409 });
        }
    }

    const oldEffectiveWorkflowId = existingModel.workflowId || null; 
    let newEffectiveWorkflowId: string | null; 
    let workflowAssignmentActuallyChanged = false;

    if (Object.prototype.hasOwnProperty.call(body, 'workflowId')) {
      const normalizedRequestedWfId = (body.workflowId === undefined || body.workflowId === '') ? null : body.workflowId;
      newEffectiveWorkflowId = normalizedRequestedWfId;
      if (newEffectiveWorkflowId !== oldEffectiveWorkflowId) {
        workflowAssignmentActuallyChanged = true;
      }
    } else {
      newEffectiveWorkflowId = oldEffectiveWorkflowId;
    }

    const updateModelFields: string[] = [];
    const updateModelValues: any[] = [];

    if (name !== undefined && name !== existingModel.name) {
      updateModelFields.push('name = ?');
      updateModelValues.push(name);
    }
    if (description !== undefined && description !== existingModel.description) {
      updateModelFields.push('description = ?');
      updateModelValues.push(description);
    }
    
    const finalNamespace = (namespace === undefined || namespace.trim() === '') ? 'Default' : namespace.trim();
    if (finalNamespace !== existingModel.namespace) {
        updateModelFields.push('namespace = ?');
        updateModelValues.push(finalNamespace);
    }

    if (displayPropertyNames !== undefined) {
        const newDpnJson = JSON.stringify(displayPropertyNames || []);
        if (newDpnJson !== existingModel.displayPropertyNames) {
            updateModelFields.push('displayPropertyNames = ?');
            updateModelValues.push(newDpnJson);
        }
    }
    
    if (Object.prototype.hasOwnProperty.call(body, 'workflowId') && newEffectiveWorkflowId !== existingModel.workflowId) {
      updateModelFields.push('workflowId = ?');
      updateModelValues.push(newEffectiveWorkflowId);
    }

    if (updateModelFields.length > 0) {
      const updateModelSql = `UPDATE models SET ${updateModelFields.join(', ')} WHERE id = ?`;
      updateModelValues.push(params.modelId);
      await db.run(updateModelSql, ...updateModelValues);
    }

    // Properties update logic
    if (updatedPropertiesInput) {
      const oldDbProperties = await db.all('SELECT id, name FROM properties WHERE model_id = ?', params.modelId);
      const oldPropertyIds = new Set(oldDbProperties.map(p => p.id));
      
      const propertiesToApplyDefaultsFor: Property[] = [];

      // Delete existing properties and re-insert them to handle order changes and deletions
      await db.run('DELETE FROM properties WHERE model_id = ?', params.modelId);
      
      for (const prop of updatedPropertiesInput) {
        // Ensure prop.id is always a string. If client sends new prop without ID, generate one.
        const propertyId = prop.id || crypto.randomUUID();
        
        await db.run(
          'INSERT INTO properties (id, model_id, name, type, relatedModelId, required, relationshipType, unit, precision, autoSetOnCreate, autoSetOnUpdate, isUnique, orderIndex, defaultValue, validationRulesetId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          propertyId, params.modelId, prop.name, prop.type, prop.relatedModelId,
          prop.required ? 1 : 0, prop.relationshipType, prop.unit, prop.precision,
          prop.autoSetOnCreate ? 1 : 0, prop.autoSetOnUpdate ? 1 : 0,
          prop.isUnique ? 1 : 0, prop.orderIndex, prop.defaultValue ?? null,
          prop.validationRulesetId ?? null // Ensure validationRulesetId is saved
        );

        // Identify genuinely new properties (by ID) that have a meaningful default value
        if (!oldPropertyIds.has(propertyId) && prop.defaultValue !== undefined && prop.defaultValue !== null && String(prop.defaultValue).trim() !== '') {
          propertiesToApplyDefaultsFor.push({ ...prop, id: propertyId }); // Use the ID that was inserted
        }
      }

      // Apply defaults for genuinely new properties that have a non-empty default value
      if (propertiesToApplyDefaultsFor.length > 0) {
        const existingDataObjects = await db.all('SELECT id, data FROM data_objects WHERE model_id = ?', params.modelId);
        for (const newPropWithDefault of propertiesToApplyDefaultsFor) {
          const parsedDefaultValue = parseDefaultValueForStorage(newPropWithDefault.defaultValue, newPropWithDefault.type, newPropWithDefault.relationshipType);
          
          // Only proceed if parsedDefaultValue is not undefined (meaning it's a valid, non-empty default)
          if (parsedDefaultValue !== undefined) {
            for (const dataObj of existingDataObjects) {
              let currentData = JSON.parse(dataObj.data);
              // Critical check: only apply default if the property name does not already exist in the object
              if (!Object.prototype.hasOwnProperty.call(currentData, newPropWithDefault.name)) {
                currentData[newPropWithDefault.name] = parsedDefaultValue;
                await db.run('UPDATE data_objects SET data = ? WHERE id = ?', JSON.stringify(currentData), dataObj.id);
              }
            }
          }
        }
      }
    }

    if (workflowAssignmentActuallyChanged) {
      if (newEffectiveWorkflowId) { 
        const workflowForUpdate: WorkflowWithDetails | undefined = await db.get('SELECT * FROM workflows WHERE id = ?', newEffectiveWorkflowId);
        if (workflowForUpdate) {
          const statesForUpdate: WorkflowState[] = await db.all('SELECT id, isInitial FROM workflow_states WHERE workflowId = ?', newEffectiveWorkflowId);
          const initialStateForUpdate = statesForUpdate.find(s => s.isInitial === 1 || s.isInitial === true);

          if (initialStateForUpdate && initialStateForUpdate.id) {
            await db.run("UPDATE data_objects SET currentStateId = ? WHERE model_id = ?", initialStateForUpdate.id, params.modelId);
          } else {
            await db.run("UPDATE data_objects SET currentStateId = NULL WHERE model_id = ?", params.modelId);
          }
        } else {
          await db.run("UPDATE data_objects SET currentStateId = NULL WHERE model_id = ?", params.modelId);
        }
      } else { 
        await db.run("UPDATE data_objects SET currentStateId = NULL WHERE model_id = ?", params.modelId);
      }
    }

    await db.run('COMMIT');

    const refreshedModelRow = await db.get('SELECT * FROM models WHERE id = ?', params.modelId);
    const refreshedPropertiesFromDb = await db.all('SELECT * FROM properties WHERE model_id = ? ORDER BY orderIndex ASC', params.modelId);

    let refreshedParsedDpn: string[] = [];
    if (refreshedModelRow.displayPropertyNames && typeof refreshedModelRow.displayPropertyNames === 'string') {
        try {
            const temp = JSON.parse(refreshedModelRow.displayPropertyNames);
            if (Array.isArray(temp)) {
                refreshedParsedDpn = temp.filter(name => typeof name === 'string');
            }
        } catch (e: any) {
            console.warn(`API (PUT /models/[modelId]): Invalid JSON for displayPropertyNames for model ${refreshedModelRow.id} after update: ${refreshedModelRow.displayPropertyNames}. Error: ${e.message}`);
        }
    }
    
    const returnedModel: Model = {
      id: refreshedModelRow.id,
      name: refreshedModelRow.name,
      description: refreshedModelRow.description,
      namespace: refreshedModelRow.namespace || 'Default',
      displayPropertyNames: refreshedParsedDpn,
      properties: refreshedPropertiesFromDb.map(p => ({
        ...(p as any), 
        required: p.required === 1,
        autoSetOnCreate: p.autoSetOnCreate === 1,
        autoSetOnUpdate: p.autoSetOnUpdate === 1,
        isUnique: p.isUnique === 1,
        validationRulesetId: p.validationRulesetId ?? null,
      }) as Property),
      workflowId: refreshedModelRow.workflowId === undefined ? null : refreshedModelRow.workflowId,
    };
    return NextResponse.json(returnedModel);

  } catch (error: any) {
    await db.run('ROLLBACK');
    const errorMessage = error.message || `An unknown server error occurred while updating model ${params.modelId}.`;
    const errorStack = error.stack || 'No stack trace available.';
    console.error(`API Error (PUT /models/[modelId]) - Failed to update model ${params.modelId}. Message: ${errorMessage}, Stack: ${errorStack}`, error);
    if (error.message && error.message.includes('UNIQUE constraint failed: models.name')) {
      return NextResponse.json({ error: 'A model with this name already exists.', details: errorMessage }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to update model', details: errorMessage, stack: error.stack }, { status: 500 });
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
    const modelExists = await db.get('SELECT id FROM models WHERE id = ?', params.modelId);
    if (!modelExists) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    await db.run('DELETE FROM models WHERE id = ?', params.modelId); // Properties and data_objects are deleted via CASCADE
    await db.run('COMMIT');

    return NextResponse.json({ message: 'Model deleted successfully' });
  } catch (error: any) {
    await db.run('ROLLBACK');
    const errorMessage = error.message || `An unknown server error occurred while deleting model ${params.modelId}.`;
    const errorStack = error.stack || 'No stack trace available.';
    console.error(`API Error (DELETE /models/[modelId]) - Failed to delete model ${params.modelId}. Message: ${errorMessage}, Stack: ${errorStack}`, error);
    return NextResponse.json({ error: 'Failed to delete model', details: errorMessage }, { status: 500 });
  }
}
    
