
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { DataObject } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth';

// GET all data objects, grouped by model_id, respecting user permissions
export async function GET(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const includeDeleted = searchParams.get('includeDeleted') === 'true';

  try {
    const db = await getDb();
    let query = 'SELECT o.id, o.model_id, o.data, o.currentStateId, o.ownerId, o.isDeleted, o.deletedAt FROM data_objects o';
    const queryParams: any[] = [];
    const whereConditions: string[] = [];

    // --- Permission Filtering ---
    if (!currentUser.permissionIds.includes('*')) {
      const viewableModelIds = currentUser.permissionIds
        .filter(p => p.startsWith('model:view:'))
        .map(p => p.replace('model:view:', ''));
      
      if (viewableModelIds.length === 0) {
        return NextResponse.json({}); // Return empty object if no models are viewable
      }
      
      whereConditions.push(`o.model_id IN (${viewableModelIds.map(() => '?').join(',')})`);
      queryParams.push(...viewableModelIds);
    }
    // --- End Permission Filtering ---
    
    if (!includeDeleted) {
      whereConditions.push('(o.isDeleted = 0 OR o.isDeleted IS NULL)');
    }
    
    if (whereConditions.length > 0) {
      query += ` WHERE ${whereConditions.join(' AND ')}`;
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
  } catch (error: any) {
    console.error('API Error (GET /api/codex-structure/objects/all):', error);
    return NextResponse.json({ error: 'Failed to fetch all objects', details: error.message }, { status: 500 });
  }
}
