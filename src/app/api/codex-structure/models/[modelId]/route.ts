
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Model, Property, WorkflowWithDetails, WorkflowState, StructuralChangeDetail } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth';

interface Params {
  params: { modelId: string };
}

// GET a single model by ID
export async function GET(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || (!currentUser.permissionIds.includes(`model:view:${params.modelId}`) && !currentUser.permissionIds.includes('models:manage') && !currentUser.permissionIds.includes('*'))) {
    return NextResponse.json({ error: 'Unauthorized to view this model' }, { status: 403 });
  }

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
    console.error(`API Error (GET /models/${params.modelId}): Failed to fetch model.`, {
        message: errorMessage,
        stack: errorStack,
        error,
    });
    return NextResponse.json({ error: 'Failed to fetch model', details: errorMessage }, { status: 500 });
  }
}

// PUT (update) a model
export async function PUT(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || (!currentUser.permissionIds.includes('models:manage') && !currentUser.permissionIds.includes(`model:manage:${params.modelId}`) && !currentUser.permissionIds.includes('*'))) {
    return NextResponse.json({ error: 'Unauthorized to update model structure' }, { status: 403 });
  }

  const db = await getDb();
  
  try {
    await db.run('BEGIN TRANSACTION');
    const { modelId } = params;
    const body: Partial<Model> & { properties?: Property[] } = await request.json();
    const currentTimestamp = new Date().toISOString();
    const defaultGroupId = "00000000-0000-0000-0000-000000000001";
    
    const oldModelRow = await db.get('SELECT * FROM models WHERE id = ?', modelId);
    if (!oldModelRow) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }
    const oldPropertiesFromDb = await db.all('SELECT * FROM properties WHERE model_id = ? ORDER BY orderIndex ASC', modelId);
    
    // --- Model Group Logic ---
    let finalModelGroupIdToSave: string | null = oldModelRow.model_group_id; // Start with the existing value
    if (Object.prototype.hasOwnProperty.call(body, 'modelGroupId')) {
        // If the key is present in the request body, update our value.
        // Map `null` or `undefined` from the client to the actual Default Group ID for saving.
        finalModelGroupIdToSave = (body.modelGroupId === null || body.modelGroupId === undefined) ? defaultGroupId : body.modelGroupId;
    }
    // --- End Model Group Logic ---
    
    // ================================================================
    // Step 1: Prepare final values for database update
    // ================================================================
    const finalName = body.name ?? oldModelRow.name;
    const finalDescription = 'description' in body ? body.description : oldModelRow.description;
    const finalDisplayPropertyNames = 'displayPropertyNames' in body ? JSON.stringify(body.displayPropertyNames || []) : oldModelRow.displayPropertyNames;
    const finalWorkflowId = 'workflowId' in body ? body.workflowId : oldModelRow.workflowId;
    

    // ================================================================
    // Step 2: Update core model metadata in the database
    // ================================================================
    await db.run(
        'UPDATE models SET name = ?, description = ?, model_group_id = ?, displayPropertyNames = ?, workflowId = ? WHERE id = ?',
        finalName,
        finalDescription,
        finalModelGroupIdToSave, // Use the correctly determined ID
        finalDisplayPropertyNames,
        finalWorkflowId,
        modelId
    );

    // --- Update model-specific permissions if name changed ---
    if (body.name && body.name !== oldModelRow.name) {
      const actions = ['view', 'create', 'edit', 'delete', 'edit_own', 'delete_own', 'manage'];
      for (const action of actions) {
        const permId = `model:${action}:${modelId}`;
        let permName = '';
        if (action === 'create') permName = `Create ${body.name} Objects`;
        else if (action === 'edit_own') permName = `Edit Own ${body.name} Objects`;
        else if (action === 'delete_own') permName = `Delete Own ${body.name} Objects`;
        else if (action === 'manage') permName = `Manage ${body.name} Structure`;
        else permName = `${action.charAt(0).toUpperCase() + action.slice(1)} ${body.name} Objects`;
        
        const newPermCategory = `Model: ${body.name}`;
        await db.run(
          'UPDATE permissions SET name = ?, category = ? WHERE id = ?',
          permName, newPermCategory, permId
        );
      }
    }
    // --- End permission update ---

    // ================================================================
    // Step 3: Handle properties update
    // ================================================================
    let newProcessedProperties: Property[] = oldPropertiesFromDb.map(prop => ({ ...prop, required: !!prop.required, autoSetOnCreate: !!prop.autoSetOnCreate, autoSetOnUpdate: !!prop.autoSetOnUpdate, isUnique: !!prop.isUnique } as Property));
    
    if (body.properties) {
      // --- Data Migration for Renamed Properties ---
      const propertyIdToOldNameMap = new Map(oldPropertiesFromDb.map(p => [p.id, p.name]));
      const renamedProperties: { oldName: string, newName: string }[] = [];

      for (const newProp of body.properties) {
          if (newProp.id) { // It's an existing property
              const oldName = propertyIdToOldNameMap.get(newProp.id);
              if (oldName && oldName !== newProp.name) {
                  renamedProperties.push({ oldName, newName: newProp.name });
              }
          }
      }

      if (renamedProperties.length > 0) {
          for (const renamed of renamedProperties) {
              await db.run(
                `UPDATE data_objects 
                 SET data = json_set(json_remove(data, ?), ?, json_extract(data, ?))
                 WHERE model_id = ? AND json_extract(data, ?) IS NOT NULL`,
                `$.${renamed.oldName}`,
                `$.${renamed.newName}`,
                `$.${renamed.oldName}`,
                modelId,
                `$.${renamed.oldName}`
            );
          }
      }
      // --- End Data Migration ---
      
      await db.run('DELETE FROM properties WHERE model_id = ?', modelId);
      
      newProcessedProperties = [];
      for (const prop of body.properties) {
        const propertyId = prop.id || crypto.randomUUID();
        const propMinValueForDb = (prop.type === 'number' && typeof prop.minValue === 'number' && !isNaN(prop.minValue)) ? Number(prop.minValue) : null;
        const propMaxValueForDb = (prop.type === 'number' && typeof prop.maxValue === 'number' && !isNaN(prop.maxValue)) ? Number(prop.maxValue) : null;
        
        await db.run(
          'INSERT INTO properties (id, model_id, name, type, relatedModelId, required, relationshipType, unit, precision, autoSetOnCreate, autoSetOnUpdate, isUnique, orderIndex, defaultValue, validationRulesetId, minValue, maxValue) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          propertyId, modelId, prop.name, prop.type, prop.relatedModelId,
          prop.required ? 1 : 0, prop.relationshipType, prop.unit, prop.precision,
          prop.autoSetOnCreate ? 1 : 0, prop.autoSetOnUpdate ? 1 : 0,
          prop.isUnique ? 1 : 0, prop.orderIndex, prop.defaultValue ?? null,
          prop.validationRulesetId ?? null,
          propMinValueForDb,
          propMaxValueForDb
        );
        newProcessedProperties.push({
            ...prop, id: propertyId, model_id: modelId, 
            required: !!prop.required, autoSetOnCreate: !!prop.autoSetOnCreate, autoSetOnUpdate: !!prop.autoSetOnUpdate, isUnique: !!prop.isUnique,
            defaultValue: prop.defaultValue, validationRulesetId: prop.validationRulesetId ?? null, minValue: propMinValueForDb, maxValue: propMaxValueForDb
        } as Property);
      }
    }
    
    // ================================================================
    // Step 4: Handle workflow side-effects (if workflow changed)
    // ================================================================
    if ('workflowId' in body && body.workflowId !== oldModelRow.workflowId) {
      if (body.workflowId) { 
        const workflowForUpdate: WorkflowWithDetails | undefined = await db.get('SELECT * FROM workflows WHERE id = ?', body.workflowId);
        if (workflowForUpdate) {
          const statesForUpdate: WorkflowState[] = await db.all('SELECT id, isInitial FROM workflow_states WHERE workflowId = ?', body.workflowId);
          const initialStateForUpdate = statesForUpdate.find(s => s.isInitial === 1 || s.isInitial === true);
          await db.run("UPDATE data_objects SET currentStateId = ? WHERE model_id = ?", initialStateForUpdate?.id || null, modelId);
        } else {
          await db.run("UPDATE data_objects SET currentStateId = NULL WHERE model_id = ?", modelId);
        }
      } else { 
        await db.run("UPDATE data_objects SET currentStateId = NULL WHERE model_id = ?", modelId);
      }
    }
    
    // ================================================================
    // Step 5: Log the changes
    // ================================================================
    const changelogDetails: StructuralChangeDetail[] = [];
    if (finalName !== oldModelRow.name) changelogDetails.push({ field: 'name', oldValue: oldModelRow.name, newValue: finalName });
    if (finalDescription !== oldModelRow.description) changelogDetails.push({ field: 'description', oldValue: oldModelRow.description, newValue: finalDescription });
    
    // Normalize old and new model group IDs for accurate comparison
    const oldGroupIdForLog = oldModelRow.model_group_id || defaultGroupId;
    const newGroupIdForLog = finalModelGroupIdToSave || defaultGroupId;

    if (newGroupIdForLog !== oldGroupIdForLog) {
        changelogDetails.push({ field: 'modelGroupId', oldValue: oldModelRow.model_group_id, newValue: body.modelGroupId });
    }
    
    const safeJsonParse = (jsonString: string | null | undefined, defaultValue: any = []) => {
        if (jsonString === null || jsonString === undefined) return defaultValue;
        try { 
          const parsed = JSON.parse(jsonString);
          return Array.isArray(parsed) ? parsed : defaultValue;
        } catch { return defaultValue; }
    };

    if (finalDisplayPropertyNames !== oldModelRow.displayPropertyNames) {
        changelogDetails.push({ field: 'displayPropertyNames', oldValue: safeJsonParse(oldModelRow.displayPropertyNames), newValue: body.displayPropertyNames || [] });
    }
    
    if (finalWorkflowId !== oldModelRow.workflowId) changelogDetails.push({ field: 'workflowId', oldValue: oldModelRow.workflowId, newValue: finalWorkflowId });
    
    const oldPropsForLog = oldPropertiesFromDb.map(prop => ({name: prop.name, type: prop.type, orderIndex: prop.orderIndex, required: !!prop.required}));
    const newPropsForLog = newProcessedProperties.map(prop => ({name: prop.name, type: prop.type, orderIndex: prop.orderIndex, required: !!prop.required}));
    if(JSON.stringify(oldPropsForLog) !== JSON.stringify(newPropsForLog)){
        changelogDetails.push({ field: 'properties', oldValue: oldPropsForLog, newValue: newPropsForLog });
    }
    
    if (changelogDetails.length > 0) {
        const changelogId = crypto.randomUUID();
        await db.run(
          'INSERT INTO structural_changelog (id, timestamp, userId, entityType, entityId, entityName, action, changes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          changelogId, currentTimestamp, currentUser.id, 'Model', modelId, finalName, 'UPDATE', JSON.stringify(changelogDetails)
        );
    }

    await db.run('COMMIT');

    const refreshedModelRow = await db.get('SELECT * FROM models WHERE id = ?', modelId);
    const refreshedPropertiesFromDb = await db.all('SELECT * FROM properties WHERE model_id = ? ORDER BY orderIndex ASC', modelId);

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
    return NextResponse.json(returnedModel);

  } catch (error: any) {
    await db.run('ROLLBACK').catch(rbError => console.error("API Error (PUT /models/[modelId]): Rollback failed.", rbError));
    console.error(`API Error (PUT /models/${modelId}): Failed to update model.`, error);
    return NextResponse.json({ error: 'Failed to update model due to a server error.', details: error.message }, { status: 500 });
  }
}


// DELETE a model
export async function DELETE(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || (!currentUser.permissionIds.includes('models:manage') && !currentUser.permissionIds.includes(`model:manage:${params.modelId}`) && !currentUser.permissionIds.includes('*'))) {
    return NextResponse.json({ error: 'Unauthorized to delete model' }, { status: 403 });
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
      properties: oldPropertiesFromDb.map(prop => ({
        name: prop.name, type: prop.type, orderIndex: prop.orderIndex, required: !!prop.required,
        relatedModelId: prop.relatedModelId, relationshipType: prop.relationshipType, unit: prop.unit, 
        precision: prop.precision, autoSetOnCreate: !!prop.autoSetOnCreate, autoSetOnUpdate: !!prop.autoSetOnUpdate, 
        isUnique: !!prop.isUnique, defaultValue: prop.defaultValue, validationRulesetId: prop.validationRulesetId,
        minValue: prop.minValue, maxValue: prop.maxValue
      }))
    };

    // --- Delete model-specific permissions ---
    // The CASCADE DELETE on the permissions foreign key in role_permissions will handle cleanup there.
    await db.run("DELETE FROM permissions WHERE id LIKE ?", `model:%:${params.modelId}`);
    // --- End permission deletion ---

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
    console.error(`API Error (DELETE /models/${params.modelId}): Failed to delete model.`, {
        message: errorMessage,
        stack: error.stack,
        error
    });
    return NextResponse.json({ error: 'Failed to delete model', details: errorMessage }, { status: 500 });
  }
}
