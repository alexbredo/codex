
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { DataObject } from '@/lib/types';

interface Params {
  params: { modelId: string };
}

// GET all objects for a model
export async function GET(request: Request, { params }: Params) {
  try {
    const db = await getDb();
    const modelExists = await db.get('SELECT id FROM models WHERE id = ?', params.modelId);
    if (!modelExists) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    const rows = await db.all('SELECT id, data FROM data_objects WHERE model_id = ?', params.modelId);
    const objects: DataObject[] = rows.map(row => ({
      id: row.id,
      ...JSON.parse(row.data),
    }));
    return NextResponse.json(objects);
  } catch (error) {
    console.error(`Failed to fetch objects for model ${params.modelId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch objects' }, { status: 500 });
  }
}

// POST a new object for a model
export async function POST(request: Request, { params }: Params) {
  try {
    const { id: objectId, ...objectData }: Omit<DataObject, 'id'> & { id: string } = await request.json();
    const db = await getDb();

    const modelExists = await db.get('SELECT id FROM models WHERE id = ?', params.modelId);
    if (!modelExists) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    await db.run(
      'INSERT INTO data_objects (id, model_id, data) VALUES (?, ?, ?)',
      objectId,
      params.modelId,
      JSON.stringify(objectData)
    );
    
    const createdObject: DataObject = { id: objectId, ...objectData };
    return NextResponse.json(createdObject, { status: 201 });
  } catch (error) {
    console.error(`Failed to create object for model ${params.modelId}:`, error);
    return NextResponse.json({ error: 'Failed to create object' }, { status: 500 });
  }
}
