
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { z } from 'zod';

interface Params {
  params: { userId: string };
}

const updateUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50).optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100).optional().or(z.literal('')),
  roleIds: z.array(z.string().uuid("Each role ID must be a valid UUID.")).min(1, "At least one role is required.").optional(),
});


export async function GET(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  const canView = currentUser?.permissionIds.includes('users:view') || currentUser?.permissionIds.includes('*');

  if (!currentUser || !canView) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const db = await getDb();
    const user = await db.get(`SELECT id, username FROM users WHERE id = ?`, params.userId);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const roles = await db.all('SELECT r.id, r.name FROM user_roles ur JOIN roles r ON ur.roleId = r.id WHERE ur.userId = ?', params.userId);
    user.roles = roles;

    return NextResponse.json(user);
  } catch (error: any) {
    console.error(`API Error (GET /api/users/${params.userId}):`, error);
    return NextResponse.json({ error: 'Failed to fetch user', details: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  const canEdit = currentUser?.permissionIds.includes('users:edit') || currentUser?.permissionIds.includes('*');

  if (!currentUser || !canEdit) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const db = await getDb();
  await db.run('BEGIN TRANSACTION');

  try {
    const body = await request.json();
    const validation = updateUserSchema.safeParse(body);

    if (!validation.success) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const { username: newUsername, password: newPassword, roleIds: newRoleIds } = validation.data;
    const { userId } = params;

    const targetUser = await db.get('SELECT id, username FROM users WHERE id = ?', userId);
    if (!targetUser) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const updates: string[] = [];
    const values: any[] = [];
    const updatedFieldsForLog = [];

    if (newUsername && newUsername !== targetUser.username) {
      const existingUserWithNewName = await db.get('SELECT id FROM users WHERE username = ? AND id != ?', newUsername, userId);
      if (existingUserWithNewName) {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
      }
      updates.push('username = ?');
      values.push(newUsername);
      updatedFieldsForLog.push('username');
    }

    if (newPassword && newPassword.trim() !== '') {
      updates.push('password = ?');
      values.push(newPassword);
      updatedFieldsForLog.push('password');
    }

    if (updates.length > 0) {
      values.push(userId);
      await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, ...values);
    }

    if (newRoleIds) {
      const isAdminRole = (roleId: string) => roleId === '00000000-role-0000-0000-administrator';
      const userHadAdmin = (await db.get('SELECT 1 FROM user_roles WHERE userId = ? AND roleId = ?', userId, '00000000-role-0000-0000-administrator')) != null;
      const userWillHaveAdmin = newRoleIds.some(isAdminRole);

      if (userHadAdmin && !userWillHaveAdmin) {
        const adminCountResult = await db.get("SELECT COUNT(*) as count FROM user_roles WHERE roleId = ?", '00000000-role-0000-0000-administrator');
        if (adminCountResult && adminCountResult.count <= 1) {
            await db.run('ROLLBACK');
            return NextResponse.json({ error: 'Cannot remove the role from the last administrator.' }, { status: 400 });
        }
      }

      await db.run('DELETE FROM user_roles WHERE userId = ?', userId);
      const roleStmt = await db.prepare('INSERT INTO user_roles (userId, roleId) VALUES (?, ?)');
      for (const roleId of newRoleIds) {
        await roleStmt.run(userId, roleId);
      }
      await roleStmt.finalize();
      updatedFieldsForLog.push('roles');
    }

    if (updatedFieldsForLog.length > 0) {
        const logId = crypto.randomUUID();
        await db.run(
            'INSERT INTO security_log (id, timestamp, userId, username, action, targetEntityType, targetEntityId, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            logId,
            new Date().toISOString(),
            currentUser.id,
            currentUser.username,
            'USER_UPDATE',
            'User',
            userId,
            JSON.stringify({ updatedFields: updatedFieldsForLog, targetUsername: newUsername || targetUser.username })
        );
    }

    await db.run('COMMIT');

    const updatedUserResult = await db.get('SELECT id, username FROM users WHERE id = ?', userId);
    const updatedRoles = await db.all('SELECT r.id, r.name FROM user_roles ur JOIN roles r ON ur.roleId = r.id WHERE ur.userId = ?', userId);
    updatedUserResult.roles = updatedRoles;

    return NextResponse.json(updatedUserResult);

  } catch (error: any) {
    await db.run('ROLLBACK');
    console.error(`API Error - Failed to update user ${params.userId}:`, error);
    return NextResponse.json({ error: 'Failed to update user', details: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  const canDelete = currentUser?.permissionIds.includes('users:delete') || currentUser?.permissionIds.includes('*');

  if (!currentUser || !canDelete) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { userId } = params;
  const db = await getDb();
  await db.run('BEGIN TRANSACTION');

  try {
    const targetUser = await db.get('SELECT id, username FROM users WHERE id = ?', userId);
    if (!targetUser) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (currentUser.id === userId) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Cannot delete yourself.' }, { status: 400 });
    }

    const userHadAdmin = (await db.get('SELECT 1 FROM user_roles WHERE userId = ? AND roleId = ?', userId, '00000000-role-0000-0000-administrator')) != null;

    if (userHadAdmin) {
      const adminCountResult = await db.get("SELECT COUNT(*) as count FROM user_roles WHERE roleId = ?", '00000000-role-0000-0000-administrator');
      if (adminCountResult && adminCountResult.count <= 1) {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: 'Cannot delete the last administrator.' }, { status: 400 });
      }
    }

    const result = await db.run('DELETE FROM users WHERE id = ?', userId); // CASCADE will delete from user_roles
    if (result.changes === 0) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'User not found or already deleted' }, { status: 404 });
    }

    const logId = crypto.randomUUID();
    await db.run(
        'INSERT INTO security_log (id, timestamp, userId, username, action, targetEntityType, targetEntityId, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        logId,
        new Date().toISOString(),
        currentUser.id,
        currentUser.username,
        'USER_DELETE',
        'User',
        userId,
        JSON.stringify({ deletedUsername: targetUser.username })
    );

    await db.run('COMMIT');
    return NextResponse.json({ message: 'User deleted successfully' });

  } catch (error: any) {
    await db.run('ROLLBACK');
    console.error(`API Error - Failed to delete user ${userId}:`, error);
    return NextResponse.json({ error: 'Failed to delete user', details: error.message }, { status: 500 });
  }
}
