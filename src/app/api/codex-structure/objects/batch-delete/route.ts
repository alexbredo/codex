
'use server';

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { z } from 'zod';
import type { ChangelogEventData } from '@/lib/types';

// This is a new, generic batch delete endpoint that can handle objects from multiple models.

const batchDeleteSchema = z.object({
  objectIds: z.array(z.string().uuid()).min(1, 'At least one object ID is required.'),
});

export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    const errors: string[] = [];

    // Check permissions for all objects before proceeding
    for (const objectId of objectIds) {
        const objectInfo = await db.get('SELECT model_id, ownerId FROM data_objects WHERE id = ?', objectId);
        if (!objectInfo) {
            errors.push(`Object with ID ${objectId} not found.`);
            continue;
        }
        const isOwner = objectInfo.ownerId === currentUser.id;
        const canDelete = currentUser.permissionIds.includes(`model:delete:${objectInfo.model_id}`) || (currentUser.permissionIds.includes('objects:delete_own') && isOwner);
        if (!currentUser.permissionIds.includes('*') && !canDelete) {
            await db.run('ROLLBACK');
            return NextResponse.json({ error: `Unauthorized to delete one or more objects. (Object ID: ${objectId}, Model ID: ${objectInfo.model_id})` }, { status: 403 });
        }
    }
    
    if (errors.length > 0) {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: 'One or more objects could not be found.', details: errors }, { status: 404 });
    }


    for (const objectId of objectIds) {
      const objectToSoftDelete = await db.get(
        'SELECT model_id, data FROM data_objects WHERE id = ? AND (isDeleted = 0 OR isDeleted IS NULL)',
        objectId
      );

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
            type: 'DELETE', status: 'deleted', timestamp: currentTimestamp,
            snapshot: JSON.parse(objectToSoftDelete.data),
          };
          await db.run(
            'INSERT INTO data_object_changelog (id, dataObjectId, modelId, changedAt, changedByUserId, changeType, changes) VALUES (?, ?, ?, ?, ?, ?, ?)',
            changelogId, objectId, objectToSoftDelete.model_id, currentTimestamp,
            currentUser.id, 'DELETE', JSON.stringify(changelogEventData)
          );
        }
      }
    }

    await db.run('COMMIT');

    if (deletedCount < objectIds.length) {
      return NextResponse.json({
        message: `Batch delete partially completed. ${deletedCount} of ${objectIds.length} objects were deleted. Some may have already been deleted.`,
        deletedCount,
      }, { status: 207 });
    }

    return NextResponse.json({ message: `Successfully deleted ${deletedCount} objects.`, deletedCount }, { status: 200 });

  } catch (error: any) {
    await db.run('ROLLBACK');
    console.error(`API Error (POST /objects/batch-delete):`, error);
    return NextResponse.json({ error: 'Failed to batch delete objects', details: error.message }, { status: 500 });
  }
}
