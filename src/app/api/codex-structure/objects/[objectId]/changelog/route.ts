
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { ChangelogEntry } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth';

interface Params {
  params: { objectId: string };
}

export async function GET(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  const { objectId } = params;

  try {
    const db = await getDb();

    // First, find the modelId for the object to check permissions against it.
    const objectWithModelId = await db.get('SELECT model_id FROM data_objects WHERE id = ?', objectId);
    if (!objectWithModelId) {
        return NextResponse.json({ error: 'Data object not found' }, { status: 404 });
    }
    const { model_id: modelId } = objectWithModelId;

    // Now, perform the permission check.
    const canView = currentUser?.permissionIds.includes('*') || currentUser?.permissionIds.includes(`model:view:${modelId}`);
    if (!currentUser || !canView) {
        return NextResponse.json({ error: 'Unauthorized to view changelog for this object' }, { status: 403 });
    }

    // Proceed to fetch the changelog since the user is authorized.
    const changelogRows = await db.all(`
      SELECT
        cl.id,
        cl.dataObjectId,
        cl.modelId,
        cl.changedAt,
        cl.changedByUserId,
        u.username as changedByUsername,
        cl.changeType,
        cl.changes
      FROM data_object_changelog cl
      LEFT JOIN users u ON cl.changedByUserId = u.id
      WHERE cl.dataObjectId = ?
      ORDER BY cl.changedAt DESC
    `, objectId);

    const changelogEntries: ChangelogEntry[] = changelogRows.map(row => ({
      id: row.id,
      dataObjectId: row.dataObjectId,
      modelId: row.modelId,
      changedAt: row.changedAt,
      changedByUserId: row.changedByUserId,
      changedByUsername: row.changedByUsername || (row.changedByUserId ? 'Unknown User' : 'System'),
      changeType: row.changeType as ChangelogEntry['changeType'],
      changes: JSON.parse(row.changes), // Parse the JSON string into an object
    }));

    return NextResponse.json(changelogEntries);

  } catch (error: any) {
    console.error(`Failed to fetch changelog for object ${objectId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch changelog', details: error.message }, { status: 500 });
  }
}
