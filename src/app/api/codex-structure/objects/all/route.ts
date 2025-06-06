
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { DataObject } from '@/lib/types';

// GET all data objects, grouped by model_id
export async function GET(request: Request) { // Add request to access URL
  const { searchParams } = new URL(request.url);
  const includeDeleted = searchParams.get('includeDeleted') === 'true';

  try {
    const db = await getDb();
    let query = 'SELECT id, model_id, data, currentStateId, ownerId, isDeleted, deletedAt FROM data_objects';
    const queryParams: any[] = [];

    if (!includeDeleted) {
      query += ' WHERE (isDeleted = 0 OR isDeleted IS NULL)';
    }
    
    const rows = await db.all(query, ...queryParams);
    
    const allObjects: Record<string, DataObject[]> = {};

    for (const row of rows) {
      if (!allObjects[row.model_id]) {
        allObjects[row.model_id] = [];
      }
      const objectData = JSON.parse(row.data);
      allObjects[row.model_id].push({
        id: row.id,
        currentStateId: row.currentStateId,
        ownerId: row.ownerId,
        isDeleted: !!row.isDeleted,
        deletedAt: row.deletedAt,
        ...objectData,
      });
    }
    
    return NextResponse.json(allObjects);
  } catch (error) {
    console.error('Failed to fetch all objects:', error);
    return NextResponse.json({ error: 'Failed to fetch all objects' }, { status: 500 });
  }
}

