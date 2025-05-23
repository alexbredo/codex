
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { DataObject } from '@/lib/types';

interface Params {
  params: { modelId: string; objectId: string };
}

// GET a single object
export async function GET(request: Request, { params }: Params) {
  try {
    const db = await getDb();
    const row = await db.get('SELECT id, data FROM data_objects WHERE id = ? AND model_id = ?', params.objectId, params.modelId);

    if (!row) {
      return NextResponse.json({ error: 'Object not found' }, { status: 404 });
    }
    const object: DataObject = { id: row.id, ...JSON.parse(row.data) };
    return NextResponse.json(object);
  } catch (error) {
    console.error(`Failed to fetch object ${params.objectId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch object' }, { status: 500 });
  }
}

// PUT (update) an object
export async function PUT(request: Request, { params }: Params) {
  try {
    const { id, model_id, ...updates }: Partial<DataObject> & {id?: string, model_id?:string} = await request.json();
    const db = await getDb();

    const existingObject = await db.get('SELECT data FROM data_objects WHERE id = ? AND model_id = ?', params.objectId, params.modelId);
    if (!existingObject) {
      return NextResponse.json({ error: 'Object not found' }, { status: 404 });
    }

    const currentData = JSON.parse(existingObject.data);
    const newData = { ...currentData, ...updates };

    await db.run(
      'UPDATE data_objects SET data = ? WHERE id = ? AND model_id = ?',
      JSON.stringify(newData),
      params.objectId,
      params.modelId
    );
    
    const updatedObject: DataObject = { id: params.objectId, ...newData };
    return NextResponse.json(updatedObject);
  } catch (error) {
    console.error(`Failed to update object ${params.objectId}:`, error);
    return NextResponse.json({ error: 'Failed to update object' }, { status: 500 });
  }
}

// DELETE an object
export async function DELETE(request: Request, { params }: Params) {
  try {
    const db = await getDb();
    const result = await db.run('DELETE FROM data_objects WHERE id = ? AND model_id = ?', params.objectId, params.modelId);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Object not found' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Object deleted successfully' });
  } catch (error) {
    console.error(`Failed to delete object ${params.objectId}:`, error);
    return NextResponse.json({ error: 'Failed to delete object' }, { status: 500 });
  }
}
