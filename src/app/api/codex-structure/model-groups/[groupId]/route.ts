
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { ModelGroup, StructuralChangeDetail } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth'; // Auth helper

interface Params {
  params: { groupId: string };
}

// GET a single model group by ID
export async function GET(request: Request, { params }: Params) {
  // No specific role check for getting a single group.
  try {
    const db = await getDb();
    const group = await db.get('SELECT * FROM model_groups WHERE id = ?', params.groupId);

    if (!group) {
      return NextResponse.json({ error: 'Model group not found' }, { status: 404 });
    }
    return NextResponse.json(group);
  } catch (error: any) {
    console.error(`API Error - Failed to fetch model group ${params.groupId}. Message: ${error.message}, Stack: ${error.stack}`, error);
    return NextResponse.json({ error: 'Failed to fetch model group', details: error.message }, { status: 500 });
  }
}

// PUT (update) a model group
export async function PUT(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  const canManageGroups = currentUser?.permissionIds.includes('*') || currentUser?.permissionIds.includes('admin:manage_model_groups');

  if (!currentUser || !canManageGroups) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const db = await getDb();
  await db.run('BEGIN TRANSACTION');
  try {
    const { name, description }: Partial<Omit<ModelGroup, 'id'>> = await request.json();
    const currentTimestamp = new Date().toISOString();

    const existingGroup = await db.get('SELECT * FROM model_groups WHERE id = ?', params.groupId);
    if (!existingGroup) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Model group not found' }, { status: 404 });
    }

    const trimmedName = name?.trim();
     if (existingGroup.name.toLowerCase() === 'default' && trimmedName && trimmedName.toLowerCase() !== 'default') {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'The "Default" group name cannot be changed.' }, { status: 400 });
    }
    if (trimmedName && trimmedName.toLowerCase() === 'default' && existingGroup.name.toLowerCase() !== 'default') {
       await db.run('ROLLBACK');
       return NextResponse.json({ error: 'Cannot rename a group to "Default".' }, { status: 400 });
    }


    if (trimmedName === '') { // Checks if name is provided and is empty after trimming
        await db.run('ROLLBACK');
        return NextResponse.json({ error: 'Group name cannot be empty.' }, { status: 400 });
    }
    
    if (trimmedName && trimmedName !== existingGroup.name) {
        const nameCheck = await db.get('SELECT id FROM model_groups WHERE name = ? AND id != ?', trimmedName, params.groupId);
        if (nameCheck) {
            await db.run('ROLLBACK');
            return NextResponse.json({ error: 'A model group with this name already exists.' }, { status: 409 });
        }
    }

    const finalName = trimmedName ?? existingGroup.name;
    const finalDescription = description ?? existingGroup.description;

    await db.run(
      'UPDATE model_groups SET name = ?, description = ? WHERE id = ?',
      finalName,
      finalDescription,
      params.groupId
    );

    // Log structural change
    const changes: StructuralChangeDetail[] = [];
    if (finalName !== existingGroup.name) {
      changes.push({ field: 'name', oldValue: existingGroup.name, newValue: finalName });
    }
    if (finalDescription !== existingGroup.description) {
      changes.push({ field: 'description', oldValue: existingGroup.description, newValue: finalDescription });
    }

    if (changes.length > 0) {
      const changelogId = crypto.randomUUID();
      await db.run(
        'INSERT INTO structural_changelog (id, timestamp, userId, entityType, entityId, entityName, action, changes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        changelogId,
        currentTimestamp,
        currentUser.id,
        'ModelGroup',
        params.groupId,
        finalName, // Use the new name for entityName
        'UPDATE',
        JSON.stringify(changes)
      );
    }
    
    await db.run('COMMIT');

    const updatedGroup: ModelGroup = { 
        id: params.groupId, 
        name: finalName, 
        description: finalDescription
    };
    return NextResponse.json(updatedGroup);
  } catch (error: any) {
    await db.run('ROLLBACK');
    console.error(`API Error - Failed to update model group ${params.groupId}. Message: ${error.message}, Stack: ${error.stack}`, error);
     if (error.message && error.message.includes('UNIQUE constraint failed: model_groups.name')) {
      return NextResponse.json({ error: 'A model group with this name already exists.', details: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to update model group', details: error.message }, { status: 500 });
  }
}

// DELETE a model group
export async function DELETE(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  const canManageGroups = currentUser?.permissionIds.includes('*') || currentUser?.permissionIds.includes('admin:manage_model_groups');

  if (!currentUser || !canManageGroups) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const db = await getDb();
  await db.run('BEGIN TRANSACTION');
  try {
    const currentTimestamp = new Date().toISOString();
    const defaultGroupId = "00000000-0000-0000-0000-000000000001";

    const groupToDelete = await db.get('SELECT * FROM model_groups WHERE id = ?', params.groupId);
    if (!groupToDelete) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Model group not found' }, { status: 404 });
    }
    if (groupToDelete.name.toLowerCase() === 'default') {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: 'The "Default" group cannot be deleted.' }, { status: 400 });
    }

    // Reassign models in this group to the 'Default' group
    await db.run('UPDATE models SET model_group_id = ? WHERE model_group_id = ?', defaultGroupId, params.groupId);


    const result = await db.run('DELETE FROM model_groups WHERE id = ?', params.groupId);
    if (result.changes === 0) {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: 'Model group not found or already deleted' }, { status: 404 });
    }

    // Log structural change
    const changelogId = crypto.randomUUID();
    const snapshot = { name: groupToDelete.name, description: groupToDelete.description };
    await db.run(
      'INSERT INTO structural_changelog (id, timestamp, userId, entityType, entityId, entityName, action, changes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      changelogId,
      currentTimestamp,
      currentUser.id,
      'ModelGroup',
      params.groupId,
      groupToDelete.name, // Use the name of the group being deleted
      'DELETE',
      JSON.stringify(snapshot) // Store a snapshot of the deleted group
    );

    await db.run('COMMIT');
    return NextResponse.json({ message: 'Model group deleted successfully' });
  } catch (error: any) {
    await db.run('ROLLBACK');
    console.error(`API Error - Failed to delete model group ${params.groupId}. Message: ${error.message}, Stack: ${error.stack}`, error);
    return NextResponse.json({ error: 'Failed to delete model group', details: error.message }, { status: 500 });
  }
}
