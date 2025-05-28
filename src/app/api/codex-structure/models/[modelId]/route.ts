
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Model, Property } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth'; // Auth helper

interface Params {
  params: { modelId: string };
}

// Helper function to parse default values on the server
function parseDefaultValueForStorage(value: string | undefined | null, type: Property['type'], relationshipType?: Property['relationshipType']): any {
  if (value === undefined || value === null || String(value).trim() === '') {
    return undefined; // Will become null in JSON if key exists, or key won't be added
  }

  switch (type) {
    case 'string':
    case 'markdown':
    case 'image':
      return String(value).trim(); // Trim strings
    case 'number':
    case 'rating':
      const num = parseFloat(value);
      return isNaN(num) ? undefined : num;
    case 'boolean':
      return String(value).toLowerCase() === 'true';
    case 'date':
      try {
        const date = new Date(value);
        // Store as ISO string. If invalid, store original string or undefined.
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
          // If JSON.parse fails, try splitting by comma
          const ids = String(value).split(',').map(id => id.trim()).filter(id => id !== '');
          if (ids.length > 0) return ids;
        }
        return []; // Default to empty array if parsing fails or empty
      }
      return String(value).trim(); // Single ID
    default:
      return String(value).trim(); // Fallback to trimmed string
  }
}


// GET a single model by ID
export async function GET(request: Request, { params }: Params) {
  // No specific role check for getting a single model, as viewers might need this.
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

  try {
    const { name, description, namespace, displayPropertyNames, properties: updatedPropertiesInput }: Partial<Omit<Model, 'id'>> & { properties?: Property[] } = await request.json();
    const db = await getDb();
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

    // Fetch current properties before update to identify new ones
    const oldPropertiesFromDb = await db.all('SELECT id, name FROM properties WHERE model_id = ?', params.modelId);
    const oldPropertyIds = new Set(oldPropertiesFromDb.map(p => p.id));
    const oldPropertyNames = new Set(oldPropertiesFromDb.map(p => p.name));


    await db.run('BEGIN TRANSACTION');

    await db.run(
      'UPDATE models SET name = ?, description = ?, namespace = ?, displayPropertyNames = ? WHERE id = ?',
      name ?? existingModel.name,
      description ?? existingModel.description,
      finalNamespace,
      displayPropertyNames ? JSON.stringify(displayPropertyNames) : existingModel.displayPropertyNames,
      params.modelId
    );

    const propertiesToUpdateOrCreate = updatedPropertiesInput || [];
    const newPropertiesWithDefaults: Property[] = [];

    // Delete old properties and insert new/updated ones
    await db.run('DELETE FROM properties WHERE model_id = ?', params.modelId);
    for (const prop of propertiesToUpdateOrCreate) {
      await db.run(
        'INSERT INTO properties (id, model_id, name, type, relatedModelId, required, relationshipType, unit, precision, autoSetOnCreate, autoSetOnUpdate, isUnique, orderIndex, defaultValue) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        prop.id || crypto.randomUUID(), // Ensure new properties get an ID if not provided
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
      // Identify newly added properties with default values
      // A property is "new" if its ID wasn't in oldPropertyIds OR its name wasn't in oldPropertyNames (covers cases where ID might be regenerated client-side for a "new" feeling prop)
      if ((!oldPropertyIds.has(prop.id) || !oldPropertyNames.has(prop.name)) && prop.defaultValue !== undefined && prop.defaultValue !== null) {
        newPropertiesWithDefaults.push(prop);
      }
    }

    // Apply default values of new properties to existing data objects
    if (newPropertiesWithDefaults.length > 0) {
      const existingDataObjects = await db.all('SELECT id, data FROM data_objects WHERE model_id = ?', params.modelId);
      for (const propWithDefault of newPropertiesWithDefaults) {
        const parsedDefaultValue = parseDefaultValueForStorage(propWithDefault.defaultValue, propWithDefault.type, propWithDefault.relationshipType);
        
        // Only proceed if parsedDefaultValue is not undefined (meaning the default was valid and parsable)
        if (parsedDefaultValue !== undefined) {
          for (const dataObj of existingDataObjects) {
            let currentData = JSON.parse(dataObj.data);
            // Add default value only if property does not exist on the object
            if (!currentData.hasOwnProperty(propWithDefault.name)) {
              currentData[propWithDefault.name] = parsedDefaultValue;
              await db.run('UPDATE data_objects SET data = ? WHERE id = ?', JSON.stringify(currentData), dataObj.id);
            }
          }
        }
      }
    }

    await db.run('COMMIT');

    // Fetch the model again to return the updated version
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
    };

    return NextResponse.json(returnedModel);
  } catch (error: any) {
    const db = await getDb();
    await db.run('ROLLBACK'); // Ensure rollback on any error
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
  try {
    const db = await getDb();
    
    const modelExists = await db.get('SELECT id FROM models WHERE id = ?', params.modelId);
    if (!modelExists) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    await db.run('BEGIN TRANSACTION');
    await db.run('DELETE FROM models WHERE id = ?', params.modelId);
    // Properties and data_objects are deleted via CASCADE
    await db.run('COMMIT');

    return NextResponse.json({ message: 'Model deleted successfully' });
  } catch (error: any) {
    const db = await getDb();
    await db.run('ROLLBACK');
    const errorMessage = error.message || `An unknown server error occurred while deleting model ${params.modelId}.`;
    const errorStack = error.stack || 'No stack trace available.';
    console.error(`API Error (DELETE /models/[modelId]) - Failed to delete model ${params.modelId}. Message: ${errorMessage}, Stack: ${errorStack}`, error);
    return NextResponse.json({ error: 'Failed to delete model', details: errorMessage }, { status: 500 });
  }
}
