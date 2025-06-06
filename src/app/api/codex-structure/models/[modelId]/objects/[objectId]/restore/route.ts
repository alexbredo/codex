
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import type { ChangelogEventData } from '@/lib/types';

interface Params {
  params: { modelId: string; objectId: string };
}

export async function POST(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !['user', 'administrator'].includes(currentUser.role)) {
    return NextResponse.json({ error: 'Unauthorized to restore object' }, { status: 403 });
  }

  const db = await getDb();
  await db.run('BEGIN TRANSACTION');

  try {
    const currentTimestamp = new Date().toISOString();
    const objectToRestore = await db.get('SELECT id FROM data_objects WHERE id = ? AND model_id = ? AND isDeleted = 1', params.objectId, params.modelId);

    if (!objectToRestore) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Object not found or not deleted' }, { status: 404 });
    }

    const result = await db.run(
      'UPDATE data_objects SET isDeleted = 0, deletedAt = NULL, data = json_patch(data, json_object(\'updatedAt\', ?)) WHERE id = ? AND model_id = ?',
      currentTimestamp, // Update updatedAt on restore
      params.objectId,
      params.modelId
    );

    if (result.changes === 0) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Failed to restore object' }, { status: 500 });
    }

    // Log restore event
    const changelogId = crypto.randomUUID();
    const changelogEventData: ChangelogEventData = {
      type: 'RESTORE',
      status: 'restored',
      timestamp: currentTimestamp,
    };
    await db.run(
      'INSERT INTO data_object_changelog (id, dataObjectId, modelId, changedAt, changedByUserId, changeType, changes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      changelogId,
      params.objectId,
      params.modelId,
      currentTimestamp,
      currentUser?.id || null,
      'RESTORE',
      JSON.stringify(changelogEventData)
    );
    
    await db.run('COMMIT');

    // Fetch the restored object to return it
    const restoredObjectRow = await db.get('SELECT id, data, currentStateId, ownerId, isDeleted, deletedAt FROM data_objects WHERE id = ? AND model_id = ?', params.objectId, params.modelId);
    if (!restoredObjectRow) {
      // Should not happen if update was successful
      return NextResponse.json({ error: 'Failed to retrieve restored object, but operation might have succeeded.' }, { status: 500 });
    }
     const restoredObject = {
      id: restoredObjectRow.id,
      currentStateId: restoredObjectRow.currentStateId,
      ownerId: restoredObjectRow.ownerId,
      isDeleted: !!restoredObjectRow.isDeleted,
      deletedAt: restoredObjectRow.deletedAt,
      ...JSON.parse(restoredObjectRow.data)
    };


    return NextResponse.json(restoredObject);
  } catch (error: any) {
    await db.run('ROLLBACK');
    console.error(`Failed to restore object ${params.objectId}:`, error);
    return NextResponse.json({ error: 'Failed to restore object', details: error.message }, { status: 500 });
  }
}
