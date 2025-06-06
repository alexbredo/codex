
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import type { DataObject, ChangelogEntry, ChangelogEventData, PropertyChangeDetail } from '@/lib/types';

interface Params {
  params: { objectId: string; changelogEntryId: string };
}

export async function POST(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized to revert object state' }, { status: 403 });
  }

  const { objectId, changelogEntryId } = params;
  const db = await getDb();
  await db.run('BEGIN TRANSACTION');

  try {
    const targetChangelogEntry: ChangelogEntry | undefined = await db.get(
      'SELECT * FROM data_object_changelog WHERE id = ? AND dataObjectId = ?',
      changelogEntryId,
      objectId
    );

    if (!targetChangelogEntry) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Target changelog entry not found for this object' }, { status: 404 });
    }
    targetChangelogEntry.changes = JSON.parse(targetChangelogEntry.changes as unknown as string); // Parse changes JSON

    const currentObjectRow = await db.get('SELECT * FROM data_objects WHERE id = ?', objectId);
    if (!currentObjectRow) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Object not found' }, { status: 404 });
    }
    
    let currentObjectData: Record<string, any> = JSON.parse(currentObjectRow.data);
    const newObjectState: Partial<DataObject> = { ...currentObjectData };
    let newChangelogType: ChangelogEventData['type'] = 'UPDATE'; // Default for revert, might change
    const revertPropertyChanges: PropertyChangeDetail[] = [];
    const currentTimestamp = new Date().toISOString();

    let finalIsDeleted = currentObjectRow.isDeleted;
    let finalDeletedAt = currentObjectRow.deletedAt;
    let finalCurrentStateId = currentObjectRow.currentStateId;
    let finalOwnerId = currentObjectRow.ownerId;


    switch (targetChangelogEntry.changeType) {
      case 'CREATE':
        await db.run('ROLLBACK');
        return NextResponse.json({ error: "Reverting a 'CREATE' action is not supported via this method. Please delete the object if you wish to undo its creation." }, { status: 400 });

      case 'UPDATE':
        newChangelogType = 'REVERT_UPDATE';
        if (!targetChangelogEntry.changes.modifiedProperties) {
          await db.run('ROLLBACK');
          return NextResponse.json({ error: "Changelog entry for 'UPDATE' is missing property details needed for revert." }, { status: 500 });
        }
        for (const propChange of targetChangelogEntry.changes.modifiedProperties) {
          if (propChange.propertyName === '__workflowState__') {
            if (finalCurrentStateId !== propChange.oldValue) {
                 revertPropertyChanges.push({ propertyName: '__workflowState__', oldValue: finalCurrentStateId, newValue: propChange.oldValue, oldLabel: currentObjectRow.currentStateId, newLabel: propChange.oldLabel });
            }
            finalCurrentStateId = propChange.oldValue;
          } else if (propChange.propertyName === '__owner__') {
             if (finalOwnerId !== propChange.oldValue) {
                revertPropertyChanges.push({ propertyName: '__owner__', oldValue: finalOwnerId, newValue: propChange.oldValue, oldLabel: currentObjectRow.ownerId, newLabel: propChange.oldLabel });
            }
            finalOwnerId = propChange.oldValue;
          } else {
            if (newObjectState[propChange.propertyName] !== propChange.oldValue) {
                revertPropertyChanges.push({ propertyName: propChange.propertyName, oldValue: newObjectState[propChange.propertyName], newValue: propChange.oldValue });
            }
            newObjectState[propChange.propertyName] = propChange.oldValue;
          }
        }
        newObjectState.updatedAt = currentTimestamp;
        break;

      case 'DELETE':
        newChangelogType = 'REVERT_DELETE'; // Effectively a restore
        if (!targetChangelogEntry.changes.snapshot) {
          await db.run('ROLLBACK');
          return NextResponse.json({ error: "Changelog entry for 'DELETE' is missing snapshot data needed for revert." }, { status: 500 });
        }
        // Restore object data from snapshot
        Object.assign(newObjectState, targetChangelogEntry.changes.snapshot);
        newObjectState.updatedAt = currentTimestamp; // Update timestamp on restore/revert
        finalIsDeleted = 0;
        finalDeletedAt = null;
        
        // Log what changed due to this REVERT_DELETE (restore)
        // This will essentially be from "deleted state" to "snapshot state"
        revertPropertyChanges.push({ propertyName: '__isDeleted__', oldValue: true, newValue: false });
        // Potentially log all properties from snapshot if we want to be verbose
        // For now, just the act of restoring from snapshot is logged.
        break;

      case 'RESTORE':
        newChangelogType = 'REVERT_RESTORE'; // Effectively a soft delete
        // Log what changed due to this REVERT_RESTORE (soft delete)
        if (finalIsDeleted === 0 || finalIsDeleted === false) { // Check if it was actually active
            revertPropertyChanges.push({ propertyName: '__isDeleted__', oldValue: false, newValue: true });
        }
        finalIsDeleted = 1;
        finalDeletedAt = currentTimestamp;
        newObjectState.updatedAt = currentTimestamp;
        break;
      
      default:
        // For REVERT_UPDATE, REVERT_DELETE, REVERT_RESTORE, maybe disallow reverting a revert for simplicity now
        await db.run('ROLLBACK');
        return NextResponse.json({ error: `Reverting a '${targetChangelogEntry.changeType}' action is not currently supported.` }, { status: 400 });
    }

    if (revertPropertyChanges.length === 0 && newChangelogType === 'REVERT_UPDATE') {
        // This can happen if the object was already in the state we are trying to revert to.
        await db.run('ROLLBACK');
        return NextResponse.json({ message: 'Object is already in the target state. No changes applied.' }, { status: 200 });
    }

    await db.run(
      'UPDATE data_objects SET data = ?, currentStateId = ?, ownerId = ?, isDeleted = ?, deletedAt = ? WHERE id = ?',
      JSON.stringify(newObjectState),
      finalCurrentStateId,
      finalOwnerId,
      finalIsDeleted,
      finalDeletedAt,
      objectId
    );

    // Log the revert action itself
    const newChangelogId = crypto.randomUUID();
    const newChangelogEventData: ChangelogEventData = {
      type: newChangelogType,
      revertedFromChangelogEntryId: changelogEntryId,
    };
    if (newChangelogType === 'REVERT_UPDATE' || newChangelogType === 'REVERT_DELETE' || newChangelogType === 'REVERT_RESTORE') {
      newChangelogEventData.modifiedProperties = revertPropertyChanges;
    }
     if (newChangelogType === 'REVERT_DELETE') { // Restored
        newChangelogEventData.status = 'restored';
    } else if (newChangelogType === 'REVERT_RESTORE') { // Soft-deleted
        newChangelogEventData.status = 'deleted';
        newChangelogEventData.timestamp = currentTimestamp;
    }


    await db.run(
      'INSERT INTO data_object_changelog (id, dataObjectId, modelId, changedAt, changedByUserId, changeType, changes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      newChangelogId,
      objectId,
      currentObjectRow.model_id,
      currentTimestamp,
      currentUser.id,
      newChangelogType,
      JSON.stringify(newChangelogEventData)
    );

    await db.run('COMMIT');

    const updatedObjectAfterRevert = await db.get('SELECT * FROM data_objects WHERE id = ?', objectId);
    const finalRevertedObject: DataObject = {
        id: updatedObjectAfterRevert.id,
        currentStateId: updatedObjectAfterRevert.currentStateId,
        ownerId: updatedObjectAfterRevert.ownerId,
        isDeleted: !!updatedObjectAfterRevert.isDeleted,
        deletedAt: updatedObjectAfterRevert.deletedAt,
        ...JSON.parse(updatedObjectAfterRevert.data)
    };

    return NextResponse.json(finalRevertedObject);

  } catch (error: any) {
    await db.run('ROLLBACK');
    console.error(`Failed to revert object ${objectId} state from changelog ${changelogEntryId}:`, error);
    return NextResponse.json({ error: 'Failed to revert object state', details: error.message }, { status: 500 });
  }
}
