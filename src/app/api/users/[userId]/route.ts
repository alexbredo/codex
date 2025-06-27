
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
  roleId: z.string().uuid("A valid role ID must be provided.").optional(),
});


export async function GET(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const db = await getDb();
    const user = await db.get(`
      SELECT u.id, u.username, u.roleId, r.name as role
      FROM users u
      LEFT JOIN roles r ON u.roleId = r.id
      WHERE u.id = ?
    `, params.userId);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    // Normalize role name for consistency if needed, though sending roleId is primary
    user.role = user.role?.toLowerCase() === 'administrator' ? 'administrator' : user.role;

    return NextResponse.json(user);
  } catch (error: any) {
    console.error(`API Error (GET /api/users/${params.userId}):`, error);
    return NextResponse.json({ error: 'Failed to fetch user', details: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const validation = updateUserSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const { username: newUsername, password: newPassword, roleId: newRoleId } = validation.data;
    const { userId } = params;
    const db = await getDb();

    const targetUser = await db.get('SELECT id, username, roleId FROM users WHERE id = ?', userId);
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const updates: string[] = [];
    const values: any[] = [];
    const updatedFieldsForLog = [];

    if (newUsername && newUsername !== targetUser.username) {
      const existingUserWithNewName = await db.get('SELECT id FROM users WHERE username = ? AND id != ?', newUsername, userId);
      if (existingUserWithNewName) {
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

    if (newRoleId && newRoleId !== targetUser.roleId) {
      const newRole = await db.get('SELECT id, name, isSystemRole FROM roles WHERE id = ?', newRoleId);
      if (!newRole) {
        return NextResponse.json({ error: 'Invalid roleId provided.' }, { status: 400 });
      }
      
      const oldRole = await db.get('SELECT id, name, isSystemRole FROM roles WHERE id = ?', targetUser.roleId);
      
      if (oldRole?.name === 'Administrator' && newRole.name !== 'Administrator') {
        const adminCountResult = await db.get("SELECT COUNT(*) as count FROM users u JOIN roles r ON u.roleId = r.id WHERE r.name = 'Administrator'");
        if (adminCountResult && adminCountResult.count === 1) {
          return NextResponse.json({ error: 'Cannot change the role of the last administrator.' }, { status: 400 });
        }
      }
      updates.push('roleId = ?', 'role = ?');
      values.push(newRoleId, newRole.name);
      updatedFieldsForLog.push('role');
    }

    if (updates.length > 0) {
      values.push(userId);
      await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, ...values);

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

    const updatedUserResult = await db.get('SELECT u.id, u.username, r.id as roleId, r.name as role FROM users u JOIN roles r ON u.roleId = r.id WHERE u.id = ?', userId);
    
    return NextResponse.json(updatedUserResult);

  } catch (error: any) {
    console.error(`API Error - Failed to update user ${params.userId}:`, error);
    return NextResponse.json({ error: 'Failed to update user', details: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { userId } = params;
  const db = await getDb();

  try {
    const targetUser = await db.get('SELECT u.id, u.username, r.name as role FROM users u JOIN roles r ON u.roleId = r.id WHERE u.id = ?', userId);
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (currentUser.id === userId) {
      return NextResponse.json({ error: 'Cannot delete yourself.' }, { status: 400 });
    }

    if (targetUser.role?.toLowerCase() === 'administrator') {
      const adminCountResult = await db.get("SELECT COUNT(*) as count FROM users u JOIN roles r ON u.roleId = r.id WHERE r.name = 'Administrator'");
      if (adminCountResult && adminCountResult.count === 1) {
        return NextResponse.json({ error: 'Cannot delete the last administrator.' }, { status: 400 });
      }
    }

    const result = await db.run('DELETE FROM users WHERE id = ?', userId);
    if (result.changes === 0) {
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

    return NextResponse.json({ message: 'User deleted successfully' });

  } catch (error: any) {
    console.error(`API Error - Failed to delete user ${userId}:`, error);
    return NextResponse.json({ error: 'Failed to delete user', details: error.message }, { status: 500 });
  }
}
