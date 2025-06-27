
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Model, Property, StructuralChangeDetail } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth';

// GET all models
export async function GET(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  
  try {
    const db = await getDb();
    const rows = await db.all(`
      SELECT m.*, mg.name as model_group_name 
      FROM models m
      LEFT JOIN model_groups mg ON m.model_group_id = mg.id
      ORDER BY model_group_name ASC, m.name ASC
    `);
    
    const modelsWithProperties: Model[] = [];
    for (const modelRow of rows) {
      try {
        const properties = await db.all('SELECT * FROM properties WHERE model_id = ? ORDER BY orderIndex ASC', modelRow.id);
        
        let parsedDisplayPropertyNames: string[] = [];
        if (modelRow.displayPropertyNames && typeof modelRow.displayPropertyNames === 'string') {
            try {
                const tempParsed = JSON.parse(modelRow.displayPropertyNames);
                if (Array.isArray(tempParsed)) {
                    parsedDisplayPropertyNames = tempParsed.filter(name => typeof name === 'string');
                }
            } catch (parseError: any) {
                console.warn(`API (GET /models): Could not parse displayPropertyNames for model ${modelRow.id}: '${modelRow.displayPropertyNames}'. Error: ${parseError.message}`);
            }
        }

        const mappedProperties = properties.map(p_row => {
            if (!p_row || typeof p_row.type === 'undefined') {
              console.warn(`API (GET /models): Malformed property data for model ${modelRow.id}, property id ${p_row?.id}:`, p_row);
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
          });

        modelsWithProperties.push({
          id: modelRow.id,
          name: modelRow.name,
          description: modelRow.description,
          modelGroupId: modelRow.model_group_id,
          displayPropertyNames: parsedDisplayPropertyNames,
          properties: mappedProperties,
          workflowId: modelRow.workflowId === undefined ? null : modelRow.workflowId,
        });
      } catch (modelProcessingError: any) {
          const errorMessage = `Processing failed for model ${modelRow?.name || modelRow?.id}. Original error: ${modelProcessingError.message}`;
          console.error(`API Error (GET /models) - Error processing model ${modelRow?.id} (${modelRow?.name}):`, {
              message: modelProcessingError.message,
              stack: modelProcessingError.stack,
              modelData: modelRow 
          });
          return NextResponse.json({ error: 'Failed to fetch models', details: errorMessage }, { status: 500 });
      }
    }
    
    // Filter models based on user permissions
    const permittedModels = modelsWithProperties.filter(model => {
        if (!currentUser) return false;
        if (currentUser.permissionIds.includes('*')) return true;
        if (currentUser.permissionIds.includes('models:manage')) return true; // Global manage can see all
        return currentUser.permissionIds.includes(`model:view:${model.id}`) || currentUser.permissionIds.includes(`model:manage:${model.id}`);
    });

    return NextResponse.json(permittedModels);

  } catch (error: any) {
    const errorMessage = error.message || 'An unknown server error occurred while fetching models.';
    const errorStack = error.stack || 'No stack trace available.';
    console.error(`API Error (GET /models) - Failed to fetch models. Message: ${errorMessage}, Stack: ${errorStack}`, error);
    return NextResponse.json({ error: 'Failed to fetch models', details: errorMessage }, { status: 500 });
  }
}

// POST a new model
export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !currentUser.permissionIds.includes('models:manage')) {
    return NextResponse.json({ error: 'Unauthorized to create models' }, { status: 403 });
  }

  const db = await getDb();
  await db.run('BEGIN TRANSACTION');

  try {
    const { id: modelId, name, description, modelGroupId, displayPropertyNames, properties: newPropertiesInput, workflowId }: Omit<Model, 'id'> & {id: string} = await request.json();
    console.log("[API POST /models] Received payload for create:", JSON.stringify({ id: modelId, name, description, modelGroupId, displayPropertyNames, properties: newPropertiesInput, workflowId }, null, 2));
    
    const defaultGroupId = "00000000-0000-0000-0000-000000000001";
    const finalModelGroupId = modelGroupId || defaultGroupId;
    const currentTimestamp = new Date().toISOString();

    await db.run(
      'INSERT INTO models (id, name, description, model_group_id, displayPropertyNames, workflowId) VALUES (?, ?, ?, ?, ?, ?)',
      modelId,
      name,
      description,
      finalModelGroupId,
      JSON.stringify(displayPropertyNames || []),
      workflowId === undefined ? null : workflowId
    );

    const processedProperties: Property[] = [];
    for (const propInput of newPropertiesInput) {
      const propertyId = propInput.id || crypto.randomUUID();
      const propMinValueForDb = (propInput.type === 'number' && typeof propInput.minValue === 'number' && !isNaN(propInput.minValue)) ? Number(propInput.minValue) : null;
      const propMaxValueForDb = (propInput.type === 'number' && typeof propInput.maxValue === 'number' && !isNaN(propInput.maxValue)) ? Number(propInput.maxValue) : null;
      
      await db.run(
        'INSERT INTO properties (id, model_id, name, type, relatedModelId, required, relationshipType, unit, precision, autoSetOnCreate, autoSetOnUpdate, isUnique, orderIndex, defaultValue, validationRulesetId, minValue, maxValue) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        propertyId,
        modelId,
        propInput.name,
        propInput.type,
        propInput.relatedModelId,
        propInput.required ? 1 : 0,
        propInput.relationshipType,
        propInput.unit,
        propInput.precision,
        propInput.autoSetOnCreate ? 1 : 0,
        propInput.autoSetOnUpdate ? 1 : 0,
        propInput.isUnique ? 1 : 0,
        propInput.orderIndex,
        propInput.defaultValue ?? null,
        propInput.validationRulesetId ?? null,
        propMinValueForDb,
        propMaxValueForDb
      );
      processedProperties.push({
        ...propInput,
        id: propertyId,
        model_id: modelId, // Ensure model_id is set for the log
        required: !!propInput.required,
        autoSetOnCreate: !!propInput.autoSetOnCreate,
        autoSetOnUpdate: !!propInput.autoSetOnUpdate,
        isUnique: !!propInput.isUnique,
        defaultValue: propInput.defaultValue,
        validationRulesetId: propInput.validationRulesetId ?? null,
        minValue: propMinValueForDb,
        maxValue: propMaxValueForDb,
      } as Property);
    }

    // --- Create model-specific permissions ---
    const actions = ['view', 'create', 'edit', 'delete', 'edit_own', 'delete_own', 'manage'];
    for (const action of actions) {
        const permId = `model:${action}:${modelId}`;
        let permName = '';
        if (action === 'create') permName = `Create ${name} Objects`;
        else if (action === 'edit_own') permName = `Edit Own ${name} Objects`;
        else if (action === 'delete_own') permName = `Delete Own ${name} Objects`;
        else if (action === 'manage') permName = `Manage ${name} Structure`;
        else permName = `${action.charAt(0).toUpperCase() + action.slice(1)} ${name} Objects`;

        await db.run(
            'INSERT INTO permissions (id, name, category) VALUES (?, ?, ?)',
            permId, permName, `Model: ${name}`
        );
        // Also grant this new permission to the admin role by default
        const adminRoleId = '00000000-role-0000-0000-administrator';
        await db.run('INSERT OR IGNORE INTO role_permissions (roleId, permissionId) VALUES (?, ?)', adminRoleId, permId);
    }
    // --- End permission creation ---

    // Log structural change for model creation
    const changelogId = crypto.randomUUID();
    const createdModelSnapshot = {
      id: modelId,
      name,
      description,
      modelGroupId: finalModelGroupId,
      displayPropertyNames: displayPropertyNames || [],
      workflowId: workflowId === undefined ? null : workflowId,
      properties: processedProperties.map(p => ({ // Log processed properties
        name: p.name, type: p.type, relatedModelId: p.relatedModelId, required: p.required, 
        relationshipType: p.relationshipType, unit: p.unit, precision: p.precision, 
        autoSetOnCreate: p.autoSetOnCreate, autoSetOnUpdate: p.autoSetOnUpdate, 
        isUnique: p.isUnique, orderIndex: p.orderIndex, defaultValue: p.defaultValue,
        validationRulesetId: p.validationRulesetId, minValue: p.minValue, maxValue: p.maxValue,
      }))
    };

    await db.run(
      'INSERT INTO structural_changelog (id, timestamp, userId, entityType, entityId, entityName, action, changes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      changelogId,
      currentTimestamp,
      currentUser.id,
      'Model',
      modelId,
      name,
      'CREATE',
      JSON.stringify(createdModelSnapshot)
    );

    await db.run('COMMIT');
    
    const createdModelForResponse: Model = {
        id: modelId,
        name,
        description,
        modelGroupId: finalModelGroupId,
        displayPropertyNames: displayPropertyNames || [],
        properties: processedProperties,
        workflowId: workflowId === undefined ? null : workflowId,
    };

    return NextResponse.json(createdModelForResponse, { status: 201 });
  } catch (error: any) {
    // Ensure rollback even if db was not explicitly awaited inside the try.
    // If db instance wasn't available, this might fail, but that's a deeper issue.
    try { await db.run('ROLLBACK'); } catch (rbError) { console.error("Rollback failed in POST /models:", rbError); }
    
    const errorMessage = error.message || 'An unknown server error occurred while creating the model.';
    const errorStack = error.stack || 'No stack trace available.';
    console.error(`API Error (POST /models) - Failed to create model. Message: ${errorMessage}, Stack: ${errorStack}`, error);
    if (error.message && error.message.includes('UNIQUE constraint failed: models.name')) {
      return NextResponse.json({ error: 'A model with this name already exists.', details: errorMessage }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create model', details: errorMessage }, { status: 500 });
  }
}
