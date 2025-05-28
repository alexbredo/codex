
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Model, Property } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth'; // Auth helper

// GET all models
export async function GET(request: Request) {
  // No specific role check for listing models, as viewers might need this.
  // Finer-grained control can be added if needed.
  try {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM models ORDER BY namespace ASC, name ASC');
    
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
          });

        modelsWithProperties.push({
          id: modelRow.id,
          name: modelRow.name,
          description: modelRow.description,
          namespace: modelRow.namespace || 'Default',
          displayPropertyNames: parsedDisplayPropertyNames,
          properties: mappedProperties,
        });
      } catch (modelProcessingError: any) {
          const errorMessage = `Processing failed for model ${modelRow?.name || modelRow?.id}. Original error: ${modelProcessingError.message}`;
          console.error(`API Error (GET /models) - Error processing model ${modelRow?.id} (${modelRow?.name}):`, {
              message: modelProcessingError.message,
              stack: modelProcessingError.stack,
              modelData: modelRow 
          });
          // Instead of throwing, which stops the whole process, we could skip this model or return partial data.
          // For now, rethrow to align with previous behavior, but this is a point for refinement.
          return NextResponse.json({ error: 'Failed to fetch models', details: errorMessage }, { status: 500 });
      }
    }
    return NextResponse.json(modelsWithProperties);
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
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { id: modelId, name, description, namespace, displayPropertyNames, properties: newProperties }: Omit<Model, 'id'> & {id: string} = await request.json();
    const db = await getDb();
    const finalNamespace = (namespace && namespace.trim() !== '') ? namespace.trim() : 'Default';


    await db.run('BEGIN TRANSACTION');

    await db.run(
      'INSERT INTO models (id, name, description, namespace, displayPropertyNames) VALUES (?, ?, ?, ?, ?)',
      modelId,
      name,
      description,
      finalNamespace,
      JSON.stringify(displayPropertyNames || [])
    );

    for (const prop of newProperties) {
      await db.run(
        'INSERT INTO properties (id, model_id, name, type, relatedModelId, required, relationshipType, unit, precision, autoSetOnCreate, autoSetOnUpdate, isUnique, orderIndex, defaultValue) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        prop.id || crypto.randomUUID(),
        modelId,
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
    }

    await db.run('COMMIT');
    
    const createdModel: Model = {
        id: modelId,
        name,
        description,
        namespace: finalNamespace,
        displayPropertyNames: displayPropertyNames || [],
        properties: newProperties.map(p => ({
            ...p,
            required: !!p.required,
            autoSetOnCreate: !!p.autoSetOnCreate,
            autoSetOnUpdate: !!p.autoSetOnUpdate,
            isUnique: !!p.isUnique,
            defaultValue: p.defaultValue,
        })),
    };

    return NextResponse.json(createdModel, { status: 201 });
  } catch (error: any) {
    const db = await getDb();
    await db.run('ROLLBACK');
    const errorMessage = error.message || 'An unknown server error occurred while creating the model.';
    const errorStack = error.stack || 'No stack trace available.';
    console.error(`API Error (POST /models) - Failed to create model. Message: ${errorMessage}, Stack: ${errorStack}`, error);
    if (error.message && error.message.includes('UNIQUE constraint failed: models.name')) {
      return NextResponse.json({ error: 'A model with this name already exists.', details: errorMessage }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create model', details: errorMessage }, { status: 500 });
  }
}
