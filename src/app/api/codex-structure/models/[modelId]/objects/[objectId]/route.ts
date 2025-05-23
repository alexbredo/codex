
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { DataObject, Property } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth'; // Auth helper

interface Params {
  params: { modelId: string; objectId: string };
}

// GET a single object
export async function GET(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !['user', 'administrator'].includes(currentUser.role)) {
    return NextResponse.json({ error: 'Unauthorized to view object' }, { status: 403 });
  }
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
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !['user', 'administrator'].includes(currentUser.role)) {
    return NextResponse.json({ error: 'Unauthorized to update object' }, { status: 403 });
  }
  try {
    const { id, model_id, ...updates }: Partial<DataObject> & {id?: string, model_id?:string} = await request.json();
    const db = await getDb();

    const existingObjectRecord = await db.get('SELECT data FROM data_objects WHERE id = ? AND model_id = ?', params.objectId, params.modelId);
    if (!existingObjectRecord) {
      return NextResponse.json({ error: 'Object not found' }, { status: 404 });
    }

    const properties: Property[] = await db.all('SELECT name, type, isUnique FROM properties WHERE model_id = ?', params.modelId);
    const currentData = JSON.parse(existingObjectRecord.data);

    for (const prop of properties) {
      if (prop.type === 'string' && prop.isUnique && updates.hasOwnProperty(prop.name)) {
        const newValue = updates[prop.name];
        if (newValue !== currentData[prop.name] && newValue !== null && typeof newValue !== 'undefined' && String(newValue).trim() !== '') {
          const conflictingObject = await db.get(
            `SELECT id FROM data_objects WHERE model_id = ? AND id != ? AND json_extract(data, '$.${prop.name}') = ?`,
            params.modelId,
            params.objectId,
            newValue
          );
          if (conflictingObject) {
            return NextResponse.json({ 
              error: `Value '${newValue}' for property '${prop.name}' must be unique. It already exists.`,
              field: prop.name
            }, { status: 409 }); 
          }
        }
      }
    }

    const newData = { ...currentData, ...updates };

    await db.run(
      'UPDATE data_objects SET data = ? WHERE id = ? AND model_id = ?',
      JSON.stringify(newData),
      params.objectId,
      params.modelId
    );
    
    const updatedObject: DataObject = { id: params.objectId, ...newData };
    return NextResponse.json(updatedObject);
  } catch (error: any) {
    console.error(`Failed to update object ${params.objectId}:`, error);
    let errorMessage = 'Failed to update object';
    if (error.message) {
        errorMessage += `: ${error.message}`;
    }
    return NextResponse.json({ error: errorMessage, details: error.message }, { status: 500 });
  }
}

// DELETE an object
export async function DELETE(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !['user', 'administrator'].includes(currentUser.role)) {
    return NextResponse.json({ error: 'Unauthorized to delete object' }, { status: 403 });
  }
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
