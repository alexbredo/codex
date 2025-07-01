
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { z } from 'zod';
import type { ChangelogEventData } from '@/lib/types';

interface Params {
  params: { modelId: string };
}

const batchDeleteSchema = z.object({
  objectIds: z.array(z.string().uuid()).min(1, 'At least one object ID is required.'),
});

export async function POST(request: Request, { params }: Params) {
  const { modelId } = params;
  const currentUser = await getCurrentUserFromCookie();

  // Permission Check: User must have general delete permissions for this model to perform batch actions.
  // We don't check for ownership since it's a bulk operation.
  if (!currentUser || (!currentUser.permissionIds.includes('*') && !currentUser.permissionIds.includes(`model:delete:${modelId}`))) {
    return NextResponse.json({ error: 'Unauthorized: You do not have permission to delete objects in this model.' }, { status: 403 });
  }

  const db = await getDb();
  await db.run('BEGIN TRANSACTION');

  try {
    const body = await request.json();
    const validation = batchDeleteSchema.safeParse(body);

    if (!validation.success) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const { objectIds } = validation.data;
    const currentTimestamp = new Date().toISOString();
    let deletedCount = 0;

    for (const objectId of objectIds) {
      const objectToSoftDelete = await db.get(
        'SELECT data FROM data_objects WHERE id = ? AND model_id = ? AND (isDeleted = 0 OR isDeleted IS NULL)',
        objectId,
        modelId
      );

      // If the object exists and is not already deleted, proceed.
      if (objectToSoftDelete) {
        const result = await db.run(
          'UPDATE data_objects SET isDeleted = 1, deletedAt = ? WHERE id = ?',
          currentTimestamp,
          objectId
        );

        if (result.changes > 0) {
          deletedCount++;
          // Log the soft delete event
          const changelogId = crypto.randomUUID();
          const changelogEventData: ChangelogEventData = {
            type: 'DELETE',
            status: 'deleted',
            timestamp: currentTimestamp,
            snapshot: JSON.parse(objectToSoftDelete.data),
          };
          await db.run(
            'INSERT INTO data_object_changelog (id, dataObjectId, modelId, changedAt, changedByUserId, changeType, changes) VALUES (?, ?, ?, ?, ?, ?, ?)',
            changelogId,
            objectId,
            modelId,
            currentTimestamp,
            currentUser.id,
            'DELETE',
            JSON.stringify(changelogEventData)
          );
        }
      }
    }

    await db.run('COMMIT');

    if (deletedCount < objectIds.length) {
      return NextResponse.json({
        message: `Batch delete partially completed. ${deletedCount} of ${objectIds.length} objects were deleted. Some may have already been deleted or did not exist.`,
        deletedCount,
      }, { status: 207 }); // Multi-Status
    }

    return NextResponse.json({ message: `Successfully deleted ${deletedCount} objects.`, deletedCount }, { status: 200 });

  } catch (error: any) {
    await db.run('ROLLBACK');
    console.error(`API Error (POST /models/${modelId}/objects/batch-delete):`, error);
    return NextResponse.json({ error: 'Failed to batch delete objects', details: error.message }, { status: 500 });
  }
}
