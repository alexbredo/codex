
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
    console.log(`[API PUT /models/:id DEBUG] Received payload:`, JSON.stringify(body, null, 2));
    
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

    const oldEffectiveWorkflowId = existingModel.workflowId || null; // Treat undefined/null from DB as null for comparison
    let newEffectiveWorkflowId: string | null; // This will be the workflow ID for the model after this operation.
    let workflowAssignmentActuallyChanged = false;

    if (Object.prototype.hasOwnProperty.call(body, 'workflowId')) {
      // workflowId key *was* present in the request.
      // Normalize undefined, empty string from request to null.
      const normalizedRequestedWfId = (body.workflowId === undefined || body.workflowId === '') ? null : body.workflowId;
      newEffectiveWorkflowId = normalizedRequestedWfId;
      if (newEffectiveWorkflowId !== oldEffectiveWorkflowId) {
        workflowAssignmentActuallyChanged = true;
      }
      console.log(`[API PUT /models/:id DEBUG] workflowId WAS IN request. Raw: ${body.workflowId}, Normalized: ${newEffectiveWorkflowId}, Old DB: ${oldEffectiveWorkflowId}, ActualChange: ${workflowAssignmentActuallyChanged}`);
    } else {
      // workflowId key was NOT in request. Model's workflowId does not change.
      newEffectiveWorkflowId = oldEffectiveWorkflowId;
      console.log(`[API PUT /models/:id DEBUG] workflowId was NOT IN request. Effective workflowId remains: ${newEffectiveWorkflowId}`);
    }

    // Update model's core properties (name, description, namespace, displayPropertyNames)
    // and workflowId *only if* it was part of the request and changed.
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
    
    // Only add workflowId to the SET clause if it was explicitly part of the request
    // AND its effective value (newEffectiveWorkflowId) is different from what's in the DB.
    if (Object.prototype.hasOwnProperty.call(body, 'workflowId') && newEffectiveWorkflowId !== existingModel.workflowId) {
      updateModelFields.push('workflowId = ?');
      updateModelValues.push(newEffectiveWorkflowId); // This is the normalized value (UUID or null)
      console.log(`[API PUT /models/:id DEBUG] Adding workflowId = ${newEffectiveWorkflowId} to model update SQL.`);
    }


    if (updateModelFields.length > 0) {
      const updateModelSql = `UPDATE models SET ${updateModelFields.join(', ')} WHERE id = ?`;
      updateModelValues.push(params.modelId);
      console.log(`[API PUT /models/:id DEBUG] Updating model record with SQL: ${updateModelSql}`, updateModelValues);
      await db.run(updateModelSql, ...updateModelValues);
    } else {
      console.log(`[API PUT /models/:id DEBUG] No core model fields (name, desc, ns, dpn, workflowId) changed on the model record itself.`);
    }


    // Properties update logic
    if (updatedPropertiesInput) {
      const oldPropertyIds = new Set((await db.all('SELECT id FROM properties WHERE model_id = ?', params.modelId)).map(p => p.id));
      const oldPropertyNames = new Set((await db.all('SELECT name FROM properties WHERE model_id = ?', params.modelId)).map(p => p.name));
      const newPropertiesWithDefaults: Property[] = [];

      await db.run('DELETE FROM properties WHERE model_id = ?', params.modelId);
      for (const prop of updatedPropertiesInput) {
        const propertyId = prop.id || crypto.randomUUID();
        await db.run(
          'INSERT INTO properties (id, model_id, name, type, relatedModelId, required, relationshipType, unit, precision, autoSetOnCreate, autoSetOnUpdate, isUnique, orderIndex, defaultValue) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          propertyId, params.modelId, prop.name, prop.type, prop.relatedModelId,
          prop.required ? 1 : 0, prop.relationshipType, prop.unit, prop.precision,
          prop.autoSetOnCreate ? 1 : 0, prop.autoSetOnUpdate ? 1 : 0,
          prop.isUnique ? 1 : 0, prop.orderIndex, prop.defaultValue ?? null
        );
        if ((!oldPropertyIds.has(propertyId) || !oldPropertyNames.has(prop.name)) && prop.defaultValue !== undefined && prop.defaultValue !== null) {
          newPropertiesWithDefaults.push(prop as Property);
        }
      }

      if (newPropertiesWithDefaults.length > 0) {
        const existingDataObjects = await db.all('SELECT id, data FROM data_objects WHERE model_id = ?', params.modelId);
        for (const propWithDefault of newPropertiesWithDefaults) {
          const parsedDefaultValue = parseDefaultValueForStorage(propWithDefault.defaultValue, propWithDefault.type, propWithDefault.relationshipType);
          if (parsedDefaultValue !== undefined) {
            for (const dataObj of existingDataObjects) {
              let currentData = JSON.parse(dataObj.data);
              if (!Object.prototype.hasOwnProperty.call(currentData, propWithDefault.name)) {
                currentData[propWithDefault.name] = parsedDefaultValue;
                await db.run('UPDATE data_objects SET data = ? WHERE id = ?', JSON.stringify(currentData), dataObj.id);
              }
            }
          }
        }
      }
      console.log(`[API PUT /models/:id DEBUG] Processed properties update.`);
    } else {
      console.log(`[API PUT /models/:id DEBUG] No properties were included in the update payload. Properties not changed.`);
    }


    // Logic for updating currentStateId on ALL objects IF the model's workflowId assignment ACTUALLY CHANGED.
    if (workflowAssignmentActuallyChanged) {
      console.log(`[API PUT /models/:id DEBUG] Model's effective workflowId HAS CHANGED from '${oldEffectiveWorkflowId}' to '${newEffectiveWorkflowId}'. Updating object states.`);

      if (newEffectiveWorkflowId) { // A workflow is newly assigned or changed to a different one.
        const workflowForUpdate: WorkflowWithDetails | undefined = await db.get('SELECT * FROM workflows WHERE id = ?', newEffectiveWorkflowId);
        if (workflowForUpdate) {
          const statesForUpdate: WorkflowState[] = await db.all('SELECT id, isInitial FROM workflow_states WHERE workflowId = ?', newEffectiveWorkflowId);
          const initialStateForUpdate = statesForUpdate.find(s => s.isInitial === 1 || s.isInitial === true);

          if (initialStateForUpdate && initialStateForUpdate.id) {
            console.log(`[API PUT /models/:id DEBUG] New workflow ${newEffectiveWorkflowId} has initial state ${initialStateForUpdate.id}. Updating ALL objects of model ${params.modelId}.`);
            const backfillResult = await db.run(
              "UPDATE data_objects SET currentStateId = ? WHERE model_id = ?",
              initialStateForUpdate.id,
              params.modelId
            );
            console.log(`[API PUT /models/:id DEBUG] Updated currentStateId for ${backfillResult.changes} objects to ${initialStateForUpdate.id}.`);
          } else {
            console.warn(`[API PUT /models/:id DEBUG] New workflow ${newEffectiveWorkflowId} has NO initial state. Setting currentStateId to NULL for ALL objects of model ${params.modelId}.`);
            const clearStateResult = await db.run("UPDATE data_objects SET currentStateId = NULL WHERE model_id = ?", params.modelId);
            console.log(`[API PUT /models/:id DEBUG] Set currentStateId to NULL for ${clearStateResult.changes} objects as new workflow has no initial state.`);
          }
        } else {
          console.warn(`[API PUT /models/:id DEBUG] New workflow ID ${newEffectiveWorkflowId} not found in DB. Setting currentStateId to NULL for ALL objects of model ${params.modelId} as a precaution.`);
          const clearStateResult = await db.run("UPDATE data_objects SET currentStateId = NULL WHERE model_id = ?", params.modelId);
          console.log(`[API PUT /models/:id DEBUG] Set currentStateId to NULL for ${clearStateResult.changes} objects due to missing workflow record.`);
        }
      } else { // Workflow was removed (newEffectiveWorkflowId is null).
        console.log(`[API PUT /models/:id DEBUG] Workflow was removed from model ${params.modelId}. Setting currentStateId to NULL for ALL objects.`);
        const clearStateResult = await db.run("UPDATE data_objects SET currentStateId = NULL WHERE model_id = ?", params.modelId);
        console.log(`[API PUT /models/:id DEBUG] Set currentStateId to NULL for ${clearStateResult.changes} objects.`);
      }
    } else {
      console.log(`[API PUT /models/:id DEBUG] Model's effective workflowId DID NOT CHANGE. No mass update of object states performed.`);
    }

    await db.run('COMMIT');

    // Fetch refreshed model and return
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
      }) as Property),
      workflowId: refreshedModelRow.workflowId === undefined ? null : refreshedModelRow.workflowId,
    };
    console.log("[API PUT /models/:id DEBUG] Returning updatedModel:", JSON.stringify(returnedModel, null, 2));
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
    
