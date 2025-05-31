
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
        return isNaN(date.getTime()) ? String(value).trim() : date.toISOString();
      } catch {
        return String(value).trim();
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

  try {
    const body: Partial<Omit<Model, 'id'>> & { properties?: Property[] } = await request.json();
    console.log(`[API PUT /models/:id DEBUG] Received payload:`, JSON.stringify(body, null, 2));
    const { name, description, namespace, displayPropertyNames, properties: updatedPropertiesInput, workflowId: newWorkflowIdFromRequest } = body;

    const finalNamespace = (namespace && namespace.trim() !== '') ? namespace.trim() : 'Default';

    const existingModel = await db.get('SELECT * FROM models WHERE id = ?', params.modelId);
    if (!existingModel) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    if (name && name !== existingModel.name) {
        const nameCheck = await db.get('SELECT id FROM models WHERE name = ? AND id != ?', name, params.modelId);
        if (nameCheck) {
            return NextResponse.json({ error: 'A model with this name already exists.' }, { status: 409 });
        }
    }

    await db.run('BEGIN TRANSACTION');

    const oldPropertyIds = new Set((await db.all('SELECT id FROM properties WHERE model_id = ?', params.modelId)).map(p => p.id));
    const oldPropertyNames = new Set((await db.all('SELECT name FROM properties WHERE model_id = ?', params.modelId)).map(p => p.name));

    // Determine the final workflowId to save on the model
    const finalWorkflowIdToSaveOnModel = Object.prototype.hasOwnProperty.call(body, 'workflowId')
      ? (newWorkflowIdFromRequest === undefined ? null : newWorkflowIdFromRequest)
      : existingModel.workflowId;

    console.log(`[API PUT /models/:id DEBUG] Original existingModel.workflowId: ${existingModel.workflowId}`);
    console.log(`[API PUT /models/:id DEBUG] newWorkflowIdFromRequest (from body): ${newWorkflowIdFromRequest}`);
    console.log(`[API PUT /models/:id DEBUG] finalWorkflowIdToSaveOnModel (for model record): ${finalWorkflowIdToSaveOnModel}`);

    // Update the model itself
    await db.run(
      'UPDATE models SET name = ?, description = ?, namespace = ?, displayPropertyNames = ?, workflowId = ? WHERE id = ?',
      name ?? existingModel.name,
      description ?? existingModel.description,
      finalNamespace,
      displayPropertyNames ? JSON.stringify(displayPropertyNames) : existingModel.displayPropertyNames,
      finalWorkflowIdToSaveOnModel,
      params.modelId
    );

    const propertiesToUpdateOrCreate = updatedPropertiesInput || [];
    const newPropertiesWithDefaults: Property[] = [];

    // Properties are fully replaced: delete old, insert new ones
    await db.run('DELETE FROM properties WHERE model_id = ?', params.modelId);
    for (const prop of propertiesToUpdateOrCreate) {
      const propertyId = prop.id || crypto.randomUUID();
      await db.run(
        'INSERT INTO properties (id, model_id, name, type, relatedModelId, required, relationshipType, unit, precision, autoSetOnCreate, autoSetOnUpdate, isUnique, orderIndex, defaultValue) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        propertyId,
        params.modelId,
        prop.name,
        prop.type,
        prop.relatedModelId,
        prop.required ? 1 : 0,
        prop.relationshipType,
        prop.unit,
        prop.precision,
        prop.autoSetOnCreate ? 1 : 0,
        prop.autoSetOnUpdate ? 1 : 0,
        prop.isUnique ? 1 : 0,
        prop.orderIndex,
        prop.defaultValue ?? null
      );
      // Check if this property is new or its name changed, and has a default value
      if ((!oldPropertyIds.has(propertyId) || !oldPropertyNames.has(prop.name)) && prop.defaultValue !== undefined && prop.defaultValue !== null) {
        newPropertiesWithDefaults.push(prop);
      }
    }

    // Apply default values for *newly added* properties to existing objects
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

    // Logic for updating currentStateId on objects IF the model's workflowId has changed.
    const oldWorkflowIdOnModel = existingModel.workflowId || null;
    const newWorkflowIdOnModel = finalWorkflowIdToSaveOnModel || null;

    console.log(`[API PUT /models/:id DEBUG] Workflow check for object states - Old WF ID on Model: ${oldWorkflowIdOnModel}, New WF ID on Model: ${newWorkflowIdOnModel}`);

    if (newWorkflowIdOnModel !== oldWorkflowIdOnModel) {
      console.log(`[API PUT /models/:id DEBUG] Model's workflowId HAS CHANGED from '${oldWorkflowIdOnModel}' to '${newWorkflowIdOnModel}'.`);

      if (newWorkflowIdOnModel) {
        // A workflow is newly assigned or changed.
        // Reset ALL objects of this model to the new workflow's initial state.
        console.log(`[API PUT /models/:id DEBUG] Workflow set to ${newWorkflowIdOnModel}. Attempting to set initial state for ALL objects of model ${params.modelId}.`);
        const workflowForUpdate: WorkflowWithDetails | undefined = await db.get('SELECT * FROM workflows WHERE id = ?', newWorkflowIdOnModel);

        if (workflowForUpdate) {
          const statesForUpdate: WorkflowState[] = await db.all('SELECT id, isInitial FROM workflow_states WHERE workflowId = ?', newWorkflowIdOnModel);
          const initialStateForUpdate = statesForUpdate.find(s => s.isInitial === 1 || s.isInitial === true);

          if (initialStateForUpdate && initialStateForUpdate.id) {
            console.log(`[API PUT /models/:id DEBUG] Found initial state ${initialStateForUpdate.id} for workflow ${newWorkflowIdOnModel}.`);
            const backfillResult = await db.run(
              "UPDATE data_objects SET currentStateId = ? WHERE model_id = ?", // Update ALL objects for this model
              initialStateForUpdate.id,
              params.modelId
            );
            console.log(`[API PUT /models/:id DEBUG] RESET ALL currentStateIds to ${initialStateForUpdate.id} for ${backfillResult.changes} objects in model ${params.modelId}.`);
          } else {
            console.warn(`[API PUT /models/:id DEBUG] No initial state found for new workflow ${newWorkflowIdOnModel}. Objects for model ${params.modelId} will NOT have their states reset by this operation. They might retain old state IDs or become NULL if no objects existed.`);
            // If no initial state, objects will implicitly have currentStateId as NULL or their old value.
            // As per new requirement, if workflow changes and new one has no initial state, what to do?
            // For now, they won't be changed. If the requirement is to clear them:
            // const clearStateResult = await db.run("UPDATE data_objects SET currentStateId = NULL WHERE model_id = ?", params.modelId);
            // console.log(`[API PUT /models/:id DEBUG] Cleared currentStateId for ${clearStateResult.changes} objects in model ${params.modelId} as new workflow has no initial state.`);
          }
        } else {
          console.warn(`[API PUT /models/:id DEBUG] New workflow ${newWorkflowIdOnModel} not found in DB. Object states for model ${params.modelId} will not be changed.`);
        }
      } else {
        // Workflow was removed (newWorkflowIdOnModel is null).
        // Per current understanding, object states should remain untouched (data preserved, may show as N/A).
        console.log(`[API PUT /models/:id DEBUG] Workflow was removed from model ${params.modelId}. Existing object states are preserved.`);
      }
    } else {
      console.log(`[API PUT /models/:id DEBUG] Model's workflowId DID NOT CHANGE. No mass update of object states performed.`);
    }

    await db.run('COMMIT');

    const refreshedModelRow = await db.get('SELECT * FROM models WHERE id = ?', params.modelId);
    const refreshedProperties = await db.all('SELECT * FROM properties WHERE model_id = ? ORDER BY orderIndex ASC', params.modelId);

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
      properties: refreshedProperties.map(p => ({
        ...p,
        required: p.required === 1,
        autoSetOnCreate: p.autoSetOnCreate === 1,
        autoSetOnUpdate: p.autoSetOnUpdate === 1,
        isUnique: p.isUnique === 1,
        defaultValue: p.defaultValue,
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
    return NextResponse.json({ error: 'Failed to update model', details: errorMessage }, { status: 500 });
  }
}

// DELETE a model
export async function DELETE(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  const db = await getDb();
  try {
    const modelExists = await db.get('SELECT id FROM models WHERE id = ?', params.modelId);
    if (!modelExists) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    await db.run('BEGIN TRANSACTION');
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
    