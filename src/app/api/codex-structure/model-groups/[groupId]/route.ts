
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { ModelGroup } from '@/lib/types';
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
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { name, description }: Partial<Omit<ModelGroup, 'id'>> = await request.json();
    const db = await getDb();

    const existingGroup = await db.get('SELECT * FROM model_groups WHERE id = ?', params.groupId);
    if (!existingGroup) {
      return NextResponse.json({ error: 'Model group not found' }, { status: 404 });
    }
     if (existingGroup.name.toLowerCase() === 'default' && name && name.trim().toLowerCase() !== 'default') {
      return NextResponse.json({ error: 'The "Default" group name cannot be changed.' }, { status: 400 });
    }
    if (name && name.trim().toLowerCase() === 'default' && existingGroup.name.toLowerCase() !== 'default') {
       return NextResponse.json({ error: 'Cannot rename a group to "Default".' }, { status: 400 });
    }


    if (name && name.trim() === '') {
        return NextResponse.json({ error: 'Group name cannot be empty.' }, { status: 400 });
    }
    
    if (name && name !== existingGroup.name) {
        const nameCheck = await db.get('SELECT id FROM model_groups WHERE name = ? AND id != ?', name.trim(), params.groupId);
        if (nameCheck) {
            return NextResponse.json({ error: 'A model group with this name already exists.' }, { status: 409 });
        }
    }

    await db.run(
      'UPDATE model_groups SET name = ?, description = ? WHERE id = ?',
      name?.trim() ?? existingGroup.name,
      description ?? existingGroup.description,
      params.groupId
    );

    const updatedGroup: ModelGroup = { 
        id: params.groupId, 
        name: name?.trim() ?? existingGroup.name, 
        description: description ?? existingGroup.description
    };
    return NextResponse.json(updatedGroup);
  } catch (error: any) {
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
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const db = await getDb();
    const groupToDelete = await db.get('SELECT name FROM model_groups WHERE id = ?', params.groupId);
    if (!groupToDelete) {
      return NextResponse.json({ error: 'Model group not found' }, { status: 404 });
    }
    if (groupToDelete.name.toLowerCase() === 'default') {
        return NextResponse.json({ error: 'The "Default" group cannot be deleted.' }, { status: 400 });
    }


    // Check if any models are using this namespace
    const modelsInGroup = await db.get('SELECT COUNT(*) as count FROM models WHERE namespace = ?', groupToDelete.name);
    if (modelsInGroup && modelsInGroup.count > 0) {
      return NextResponse.json({ 
        error: `Cannot delete group "${groupToDelete.name}" as it is currently used by ${modelsInGroup.count} model(s). Please reassign models before deleting the group.` 
      }, { status: 409 }); // 409 Conflict
    }

    const result = await db.run('DELETE FROM model_groups WHERE id = ?', params.groupId);
    if (result.changes === 0) {
        return NextResponse.json({ error: 'Model group not found or already deleted' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Model group deleted successfully' });
  } catch (error: any) {
    console.error(`API Error - Failed to delete model group ${params.groupId}. Message: ${error.message}, Stack: ${error.stack}`, error);
    return NextResponse.json({ error: 'Failed to delete model group', details: error.message }, { status: 500 });
  }
}
