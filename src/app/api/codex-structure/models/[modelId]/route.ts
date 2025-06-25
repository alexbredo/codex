
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
  
  try {
    const body: Partial<Model> & { properties?: Property[] } = await request.json();
    console.log(`[API PUT /models] Received update request for model ${params.modelId}. Body:`, JSON.stringify(body, null, 2));

    const currentTimestamp = new Date().toISOString();
    
    const oldModelRow = await db.get('SELECT * FROM models WHERE id = ?', params.modelId);
    if (!oldModelRow) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }
    
    // ================================================================
    // Step 1: Update core model metadata (name, description, group, etc.)
    // This is NOT in a transaction with properties, so it commits immediately.
    // ================================================================
    const updates: string[] = [];
    const values: any[] = [];
    const changelogDetails: StructuralChangeDetail[] = [];

    if ('name' in body && body.name !== oldModelRow.name) {
      const nameCheck = await db.get('SELECT id FROM models WHERE name = ? AND id != ?', body.name, params.modelId);
      if (nameCheck) {
          return NextResponse.json({ error: 'A model with this name already exists.' }, { status: 409 });
      }
      updates.push('name = ?');
      values.push(body.name);
      changelogDetails.push({ field: 'name', oldValue: oldModelRow.name, newValue: body.name });
    }
    
    if ('description' in body && body.description !== oldModelRow.description) {
      updates.push('description = ?');
      values.push(body.description);
      changelogDetails.push({ field: 'description', oldValue: oldModelRow.description, newValue: body.description });
    }
    
    if ('modelGroupId' in body && body.modelGroupId !== oldModelRow.model_group_id) {
      console.log(`[API PUT /models] 'modelGroupId' change detected. Old: "${oldModelRow.model_group_id}", New: "${body.modelGroupId}"`);
      updates.push('model_group_id = ?');
      values.push(body.modelGroupId);
      changelogDetails.push({ field: 'modelGroupId', oldValue: oldModelRow.model_group_id, newValue: body.modelGroupId });
    }

    if ('displayPropertyNames' in body) {
      const newDisplayNames = JSON.stringify(body.displayPropertyNames || []);
      const oldDisplayNames = oldModelRow.displayPropertyNames || '[]';
      if (newDisplayNames !== oldDisplayNames) {
        updates.push('displayPropertyNames = ?');
        values.push(newDisplayNames);
        const safeJsonParse = (jsonString: string | null | undefined, defaultValue: any = []) => {
          if (!jsonString) return defaultValue;
          try { return JSON.parse(jsonString); } catch { return defaultValue; }
        };
        changelogDetails.push({ field: 'displayPropertyNames', oldValue: safeJsonParse(oldDisplayNames), newValue: body.displayPropertyNames || [] });
      }
    }

    if ('workflowId' in body && body.workflowId !== oldModelRow.workflowId) {
      updates.push('workflowId = ?');
      values.push(body.workflowId);
      changelogDetails.push({ field: 'workflowId', oldValue: oldModelRow.workflowId, newValue: body.workflowId });
    }
    
    if (updates.length > 0) {
      const sqlQuery = `UPDATE models SET ${updates.join(', ')} WHERE id = ?`;
      values.push(params.modelId);
      console.log(`[API PUT /models] Executing Metadata SQL: ${sqlQuery} with values: ${JSON.stringify(values)}`);
      await db.run(sqlQuery, ...values);
      console.log(`[API PUT /models] Model metadata updated successfully.`);
    } else {
      console.log("[API PUT /models] No model metadata fields needed updating.");
    }
    
    // ================================================================
    // Step 2: Handle properties update in its own transaction
    // ================================================================
    const oldPropertiesFromDb = await db.all('SELECT * FROM properties WHERE model_id = ? ORDER BY orderIndex ASC', params.modelId);
    let newProcessedProperties: Property[] = oldPropertiesFromDb.map(p => ({ ...p, required: !!p.required, autoSetOnCreate: !!p.autoSetOnCreate, autoSetOnUpdate: !!p.autoSetOnUpdate, isUnique: !!p.isUnique } as Property));
    
    if (body.properties) {
      try {
        await db.run('BEGIN TRANSACTION');
        console.log("[API PUT /models] Starting properties transaction.");
        
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
              required: !!prop.required, autoSetOnCreate: !!prop.autoSetOnCreate, autoSetOnUpdate: !!prop.autoSetOnUpdate, isUnique: !!p.isUnique,
              defaultValue: prop.defaultValue, validationRulesetId: prop.validationRulesetId ?? null, minValue: propMinValueForDb, maxValue: propMaxValueForDb
          } as Property);
        }
        await db.run('COMMIT');
        console.log("[API PUT /models] Properties transaction committed successfully.");

      } catch (propError: any) {
        await db.run('ROLLBACK');
        console.error("[API PUT /models] Error occurred during properties update, transaction rolled back. Error:", propError);
        // Throw an error that the client can display, but the metadata update is already saved.
        throw new Error(`Model metadata was updated, but properties failed to save: ${propError.message}`);
      }
    }
    
    // ================================================================
    // Step 3: Handle workflow side-effects (if workflow changed)
    // This is also separate from any transaction.
    // ================================================================
    if ('workflowId' in body && body.workflowId !== oldModelRow.workflowId) {
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
    const oldPropsForLog = oldPropertiesFromDb.map(p => ({name: p.name, type: p.type, orderIndex: p.orderIndex, required: !!p.required}));
    const newPropsForLog = newProcessedProperties.map(p => ({name: p.name, type: p.type, orderIndex: p.orderIndex, required: !!p.required}));
    
    if(JSON.stringify(oldPropsForLog) !== JSON.stringify(newPropsForLog)){
        changelogDetails.push({ 
            field: 'properties', 
            oldValue: oldPropsForLog,
            newValue: newPropsForLog
        });
    }

    if (changelogDetails.length > 0) {
        const changelogId = crypto.randomUUID();
        const finalModelName = ('name' in body && typeof body.name === 'string') ? body.name : oldModelRow.name;
        await db.run(
          'INSERT INTO structural_changelog (id, timestamp, userId, entityType, entityId, entityName, action, changes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          changelogId,
          currentTimestamp,
          currentUser.id,
          'Model',
          params.modelId,
          finalModelName, 
          'UPDATE',
          JSON.stringify(changelogDetails)
        );
    }
    

    // ================================================================
    // Step 5: Fetch and return the fully updated model for the client
    // ================================================================
    const refreshedModelRow = await db.get('SELECT * FROM models WHERE id = ?', params.modelId);
    console.log("[API PUT /models] Refetched model group ID after commit:", refreshedModelRow.model_group_id);

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
      modelGroupId: refreshedModelRow.model_group_id,
      displayPropertyNames: refreshedParsedDpn,
      properties: refreshedPropertiesFromDb.map(p => ({
        ...(p as any), 
        required: p.required === 1,
        autoSetOnCreate: p.autoSetOnCreate === 1,
        autoSetOnUpdate: p.autoSetOnUpdate === 1,
        isUnique: p.isUnique === 1,
        validationRulesetId: p.validationRulesetId ?? null,
        minValue: p.minValue ?? null,
        maxValue: p.maxValue ?? null,
      }) as Property),
      workflowId: refreshedModelRow.workflowId === undefined ? null : refreshedModelRow.workflowId,
    };
    return NextResponse.json(returnedModel);

  } catch (error: any) {
    let errorMessage = `Failed to update model. The operation was rolled back due to an internal error.`;
    let errorDetails = (error instanceof Error) ? error.message : 'An unknown error occurred.';
    console.error("[API PUT /models] Unhandled Error during model update:", error);
    
    return NextResponse.json({ error: errorMessage, details: errorDetails, stack: error.stack }, { status: 500 });
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
    
    const propertiesOfModelToDelete = await db.all('SELECT * FROM properties WHERE model_id = ?', params.modelId);
    const modelSnapshot = {
      ...modelToDelete,
      properties: propertiesOfModelToDelete.map(p => ({
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
