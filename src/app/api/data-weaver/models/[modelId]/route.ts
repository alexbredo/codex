
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Model, Property } from '@/lib/types';

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

    const properties = await db.all('SELECT * FROM properties WHERE model_id = ?', params.modelId);
    
    const model: Model = {
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
    };
    return NextResponse.json(model);
  } catch (error) {
    console.error(`Failed to fetch model ${params.modelId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch model' }, { status: 500 });
  }
}

// PUT (update) a model
export async function PUT(request: Request, { params }: Params) {
  try {
    const { name, description, displayPropertyNames, properties: updatedProperties }: Partial<Omit<Model, 'id'>> & { properties?: Property[] } = await request.json();
    const db = await getDb();

    const existingModel = await db.get('SELECT * FROM models WHERE id = ?', params.modelId);
    if (!existingModel) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }
    
    // Check for name conflict if name is being changed
    if (name && name !== existingModel.name) {
        const nameCheck = await db.get('SELECT id FROM models WHERE name = ? AND id != ?', name, params.modelId);
        if (nameCheck) {
            return NextResponse.json({ error: 'A model with this name already exists.' }, { status: 409 });
        }
    }

    await db.run('BEGIN TRANSACTION');

    await db.run(
      'UPDATE models SET name = ?, description = ?, displayPropertyNames = ? WHERE id = ?',
      name ?? existingModel.name,
      description ?? existingModel.description,
      displayPropertyNames ? JSON.stringify(displayPropertyNames) : existingModel.displayPropertyNames,
      params.modelId
    );

    if (updatedProperties) {
      // Delete old properties and insert new ones
      await db.run('DELETE FROM properties WHERE model_id = ?', params.modelId);
      for (const prop of updatedProperties) {
        await db.run(
          'INSERT INTO properties (id, model_id, name, type, relatedModelId, required, relationshipType, unit, precision, autoSetOnCreate, autoSetOnUpdate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          prop.id || crypto.randomUUID(),
          params.modelId,
          prop.name,
          prop.type,
          prop.relatedModelId,
          prop.required ? 1 : 0,
          prop.relationshipType,
          prop.unit,
          prop.precision,
          prop.autoSetOnCreate ? 1 : 0,
          prop.autoSetOnUpdate ? 1 : 0
        );
      }
    }

    await db.run('COMMIT');

    // Fetch the updated model to return
    const refreshedModelRow = await db.get('SELECT * FROM models WHERE id = ?', params.modelId);
    const refreshedProperties = await db.all('SELECT * FROM properties WHERE model_id = ?', params.modelId);

    const returnedModel: Model = {
      id: refreshedModelRow.id,
      name: refreshedModelRow.name,
      description: refreshedModelRow.description,
      displayPropertyNames: refreshedModelRow.displayPropertyNames ? JSON.parse(refreshedModelRow.displayPropertyNames) : [],
      properties: refreshedProperties.map(p => ({
        ...p,
        required: p.required === 1,
        autoSetOnCreate: p.autoSetOnCreate === 1,
        autoSetOnUpdate: p.autoSetOnUpdate === 1,
      })),
    };

    return NextResponse.json(returnedModel);
  } catch (error: any) {
    const db = await getDb();
    await db.run('ROLLBACK');
    console.error(`Failed to update model ${params.modelId}:`, error);
    if (error.message && error.message.includes('UNIQUE constraint failed: models.name')) {
      return NextResponse.json({ error: 'A model with this name already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to update model' }, { status: 500 });
  }
}

// DELETE a model
export async function DELETE(request: Request, { params }: Params) {
  try {
    const db = await getDb();
    
    const modelExists = await db.get('SELECT id FROM models WHERE id = ?', params.modelId);
    if (!modelExists) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    await db.run('BEGIN TRANSACTION');
    // Properties and data_objects are deleted via CASCADE constraint from models table
    await db.run('DELETE FROM models WHERE id = ?', params.modelId);
    await db.run('COMMIT');

    return NextResponse.json({ message: 'Model deleted successfully' });
  } catch (error) {
    const db = await getDb();
    await db.run('ROLLBACK');
    console.error(`Failed to delete model ${params.modelId}:`, error);
    return NextResponse.json({ error: 'Failed to delete model' }, { status: 500 });
  }
}
