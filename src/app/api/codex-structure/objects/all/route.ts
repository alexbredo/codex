
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { DataObject } from '@/lib/types';

// GET all data objects, grouped by model_id
export async function GET() {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT id, model_id, data FROM data_objects');
    
    const allObjects: Record<string, DataObject[]> = {};

    for (const row of rows) {
      if (!allObjects[row.model_id]) {
        allObjects[row.model_id] = [];
      }
      const objectData = JSON.parse(row.data);
      allObjects[row.model_id].push({
        id: row.id,
        ...objectData,
      });
    }
    
    return NextResponse.json(allObjects);
  } catch (error) {
    console.error('Failed to fetch all objects:', error);
    return NextResponse.json({ error: 'Failed to fetch all objects' }, { status: 500 });
  }
}
