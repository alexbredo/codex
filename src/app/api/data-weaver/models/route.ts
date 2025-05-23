
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Model, Property } from '@/lib/types';

// GET all models
export async function GET() {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM models ORDER BY name ASC');
    
    const modelsWithProperties: Model[] = [];
    for (const modelRow of rows) {
      const properties = await db.all('SELECT * FROM properties WHERE model_id = ? ORDER BY orderIndex ASC', modelRow.id);
      modelsWithProperties.push({
        id: modelRow.id,
        name: modelRow.name,
        description: modelRow.description,
        displayPropertyNames: modelRow.displayPropertyNames ? JSON.parse(modelRow.displayPropertyNames) : [],
        properties: properties.map(p => ({
            ...p,
            required: p.required === 1,
            autoSetOnCreate: p.autoSetOnCreate === 1,
            autoSetOnUpdate: p.autoSetOnUpdate === 1,
        })),
      });
    }
    return NextResponse.json(modelsWithProperties);
  } catch (error) {
    console.error('Failed to fetch models:', error);
    return NextResponse.json({ error: 'Failed to fetch models' }, { status: 500 });
  }
}

// POST a new model
export async function POST(request: Request) {
  try {
    const { id: modelId, name, description, displayPropertyNames, properties: newProperties }: Omit<Model, 'id'> & {id: string} = await request.json();
    const db = await getDb();

    await db.run('BEGIN TRANSACTION');

    await db.run(
      'INSERT INTO models (id, name, description, displayPropertyNames) VALUES (?, ?, ?, ?)',
      modelId,
      name,
      description,
      JSON.stringify(displayPropertyNames || [])
    );

    for (const prop of newProperties) {
      await db.run(
        'INSERT INTO properties (id, model_id, name, type, relatedModelId, required, relationshipType, unit, precision, autoSetOnCreate, autoSetOnUpdate, orderIndex) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
        prop.orderIndex // This is now included
      );
    }

    await db.run('COMMIT');
    
    const createdModel: Model = {
        id: modelId,
        name,
        description,
        displayPropertyNames,
        properties: newProperties.map(p => ({
            ...p,
            required: !!p.required,
            autoSetOnCreate: !!p.autoSetOnCreate,
            autoSetOnUpdate: !!p.autoSetOnUpdate,
        })),
    };

    return NextResponse.json(createdModel, { status: 201 });
  } catch (error: any) {
    const db = await getDb();
    await db.run('ROLLBACK');
    console.error('Failed to create model:', error);
    if (error.message && error.message.includes('UNIQUE constraint failed: models.name')) {
      return NextResponse.json({ error: 'A model with this name already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create model' }, { status: 500 });
  }
}
