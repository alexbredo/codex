
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { ChangelogEntry } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth';

interface Params {
  params: { objectId: string };
}

export async function GET(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !['user', 'administrator'].includes(currentUser.role)) {
    return NextResponse.json({ error: 'Unauthorized to view changelog' }, { status: 403 });
  }

  const { objectId } = params;

  try {
    const db = await getDb();

    // Check if the object itself exists and belongs to a model the user might have some context for (optional stricter check)
    // For now, just ensure the objectId is valid.
    const objectExists = await db.get('SELECT id FROM data_objects WHERE id = ?', objectId);
    if (!objectExists) {
        return NextResponse.json({ error: 'Parent data object not found' }, { status: 404 });
    }

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
      changeType: row.changeType as 'CREATE' | 'UPDATE',
      changes: JSON.parse(row.changes), // Parse the JSON string into an object
    }));

    return NextResponse.json(changelogEntries);

  } catch (error: any) {
    console.error(`Failed to fetch changelog for object ${objectId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch changelog', details: error.message }, { status: 500 });
  }
}
