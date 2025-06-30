
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { z } from 'zod';

interface Params {
  params: { roleId: string };
}

const roleUpdateSchema = z.object({
  name: z.string().min(1, 'Role name is required.'),
  description: z.string().optional(),
  permissionIds: z.array(z.string()).optional().default([]),
});

// GET a single role by ID, including its permissions
export async function GET(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !currentUser.permissionIds.includes('roles:manage')) {
    const db = await getDb();
    await db.run(
      'INSERT INTO security_log (id, timestamp, userId, username, action, targetEntityType, targetEntityId, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      crypto.randomUUID(), new Date().toISOString(), currentUser?.id || null, currentUser?.username || 'Anonymous', 'PERMISSION_DENIED',
      'Role', params.roleId, JSON.stringify({ reason: "Attempted to view role details without 'roles:manage' permission." })
    );
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const db = await getDb();
    const role = await db.get('SELECT * FROM roles WHERE id = ?', params.roleId);
    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    const permissions = await db.all('SELECT permissionId FROM role_permissions WHERE roleId = ?', params.roleId);
    role.permissionIds = permissions.map(p => p.permissionId);

    return NextResponse.json(role);
  } catch (error: any) {
    console.error(`API Error (GET /api/roles/${params.roleId}):`, error);
    return NextResponse.json({ error: 'Failed to fetch role', details: error.message }, { status: 500 });
  }
}

// PUT (update) an existing role
export async function PUT(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !currentUser.permissionIds.includes('roles:manage')) {
    const db = await getDb();
    await db.run(
      'INSERT INTO security_log (id, timestamp, userId, username, action, targetEntityType, targetEntityId, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      crypto.randomUUID(), new Date().toISOString(), currentUser?.id || null, currentUser?.username || 'Anonymous', 'PERMISSION_DENIED',
      'Role', params.roleId, JSON.stringify({ reason: "Attempted to update role without 'roles:manage' permission." })
    );
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const db = await getDb();
  await db.run('BEGIN TRANSACTION');

  try {
    const { roleId } = params;
    const body = await request.json();
    const validation = roleUpdateSchema.safeParse(body);
    if (!validation.success) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }
    const { name, description, permissionIds } = validation.data;

    const existingRole = await db.get('SELECT id, name, isSystemRole FROM roles WHERE id = ?', roleId);
    if (!existingRole) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }
    if (existingRole.isSystemRole) {
      await db.run(
        'INSERT INTO security_log (id, timestamp, userId, username, action, targetEntityType, targetEntityId, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        crypto.randomUUID(), new Date().toISOString(), currentUser.id, currentUser.username, 'ROLE_UPDATE_FAILURE',
        'Role', roleId, JSON.stringify({ reason: 'Attempted to modify a system role.' })
      );
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'System roles cannot be fully modified.' }, { status: 403 });
    }

    const nameCheck = await db.get('SELECT id FROM roles WHERE name = ? AND id != ?', name, roleId);
    if (nameCheck) {
      await db.run(
        'INSERT INTO security_log (id, timestamp, userId, username, action, targetEntityType, targetEntityId, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        crypto.randomUUID(), new Date().toISOString(), currentUser.id, currentUser.username, 'ROLE_UPDATE_FAILURE',
        'Role', roleId, JSON.stringify({ reason: 'A role with this name already exists.', attemptedName: name })
      );
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'A role with this name already exists.' }, { status: 409 });
    }

    await db.run('UPDATE roles SET name = ?, description = ? WHERE id = ?', name, description, roleId);

    // Sync permissions
    await db.run('DELETE FROM role_permissions WHERE roleId = ?', roleId);
    if (permissionIds.length > 0) {
      const stmt = await db.prepare('INSERT INTO role_permissions (roleId, permissionId) VALUES (?, ?)');
      for (const permId of permissionIds) {
        await stmt.run(roleId, permId);
      }
      await stmt.finalize();
    }
    
    await db.run('COMMIT');

    const updatedRole = await db.get('SELECT * FROM roles WHERE id = ?', roleId);
    const permissions = await db.all('SELECT permissionId FROM role_permissions WHERE roleId = ?', roleId);
    updatedRole.permissionIds = permissions.map(p => p.permissionId);
    
    return NextResponse.json(updatedRole);
  } catch (error: any) {
    await db.run('ROLLBACK');
    console.error(`API Error (PUT /api/roles/${params.roleId}):`, error);
    return NextResponse.json({ error: 'Failed to update role', details: error.message }, { status: 500 });
  }
}

// DELETE a role
export async function DELETE(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !currentUser.permissionIds.includes('roles:manage')) {
    const db = await getDb();
    await db.run(
      'INSERT INTO security_log (id, timestamp, userId, username, action, targetEntityType, targetEntityId, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      crypto.randomUUID(), new Date().toISOString(), currentUser?.id || null, currentUser?.username || 'Anonymous', 'PERMISSION_DENIED',
      'Role', params.roleId, JSON.stringify({ reason: "Attempted to delete role without 'roles:manage' permission." })
    );
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const db = await getDb();
  await db.run('BEGIN TRANSACTION');

  try {
    const { roleId } = params;
    
    const roleToDelete = await db.get('SELECT * FROM roles WHERE id = ?', roleId);
    if (!roleToDelete) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }
    if (roleToDelete.isSystemRole) {
      await db.run(
        'INSERT INTO security_log (id, timestamp, userId, username, action, targetEntityType, targetEntityId, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        crypto.randomUUID(), new Date().toISOString(), currentUser.id, currentUser.username, 'ROLE_DELETE_FAILURE',
        'Role', roleId, JSON.stringify({ reason: 'Attempted to delete a system role.' })
      );
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'System roles cannot be deleted.' }, { status: 403 });
    }

    const userCountResult = await db.get('SELECT COUNT(*) as count FROM user_roles WHERE roleId = ?', roleId);
    if (userCountResult && userCountResult.count > 0) {
      await db.run(
        'INSERT INTO security_log (id, timestamp, userId, username, action, targetEntityType, targetEntityId, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        crypto.randomUUID(), new Date().toISOString(), currentUser.id, currentUser.username, 'ROLE_DELETE_FAILURE',
        'Role', roleId, JSON.stringify({ reason: 'Attempted to delete a role that is still in use.', userCount: userCountResult.count })
      );
      await db.run('ROLLBACK');
      return NextResponse.json({ error: `Cannot delete role. ${userCountResult.count} user(s) are still assigned to it.` }, { status: 409 });
    }

    await db.run('DELETE FROM roles WHERE id = ?', roleId); // Cascade will delete from role_permissions and user_roles

    await db.run('COMMIT');
    return NextResponse.json({ message: 'Role deleted successfully.' });
  } catch (error: any) {
    await db.run('ROLLBACK');
    console.error(`API Error (DELETE /api/roles/${params.roleId}):`, error);
    return NextResponse.json({ error: 'Failed to delete role', details: error.message }, { status: 500 });
  }
}
