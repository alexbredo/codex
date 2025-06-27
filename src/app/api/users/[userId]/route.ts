
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { z } from 'zod';

interface Params {
  params: { userId: string };
}

// Schema for updating user (username, password, role)
const updateUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50).optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100).optional().or(z.literal('')), // Allow empty string to indicate no change
  role: z.enum(['user', 'administrator']).optional(),
});


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

    const { username: newUsername, password: newPassword, role: newRole } = validation.data;
    const { userId } = params;
    const db = await getDb();

    const targetUser = await db.get('SELECT id, username, role FROM users WHERE id = ?', userId);
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (newUsername && newUsername !== targetUser.username) {
      const existingUserWithNewName = await db.get('SELECT id FROM users WHERE username = ? AND id != ?', newUsername, userId);
      if (existingUserWithNewName) {
        return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
      }
      updates.push('username = ?');
      values.push(newUsername);
    }

    if (newPassword && newPassword.trim() !== '') { // Only update password if a new one is provided and not empty
      updates.push('password = ?');
      values.push(newPassword); // Plaintext password
    }

    if (newRole && newRole !== targetUser.role) {
      // Safety check: Prevent demoting the last admin
      if (targetUser.role === 'administrator' && newRole === 'user') {
        const adminCountResult = await db.get("SELECT COUNT(*) as count FROM users WHERE role = 'administrator'");
        if (adminCountResult && adminCountResult.count === 1) {
          return NextResponse.json({ error: 'Cannot demote the last administrator.' }, { status: 400 });
        }
      }
      // Prevent admin from demoting themselves if they are the only admin
      if (currentUser.id === userId && newRole === 'user' && targetUser.role === 'administrator') {
        const adminCountResult = await db.get("SELECT COUNT(*) as count FROM users WHERE role = 'administrator'");
        if (adminCountResult && adminCountResult.count === 1) {
          return NextResponse.json({ error: 'You cannot demote yourself as the last administrator.' }, { status: 400 });
        }
      }
      updates.push('role = ?');
      values.push(newRole);
    }

    if (updates.length > 0) {
      values.push(userId);
      await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, ...values);

      // Log security event
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
          JSON.stringify({ updatedFields: updates.map(u => u.split(' ')[0]), targetUsername: newUsername || targetUser.username })
      );
    }


    const updatedUser = await db.get('SELECT id, username, role FROM users WHERE id = ?', userId);
    return NextResponse.json(updatedUser);

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
    const targetUser = await db.get('SELECT id, role, username FROM users WHERE id = ?', userId);
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (currentUser.id === userId) {
      return NextResponse.json({ error: 'Cannot delete yourself.' }, { status: 400 });
    }

    if (targetUser.role === 'administrator') {
      const adminCountResult = await db.get("SELECT COUNT(*) as count FROM users WHERE role = 'administrator'");
      if (adminCountResult && adminCountResult.count === 1) {
        return NextResponse.json({ error: 'Cannot delete the last administrator.' }, { status: 400 });
      }
    }

    const result = await db.run('DELETE FROM users WHERE id = ?', userId);
    if (result.changes === 0) {
      return NextResponse.json({ error: 'User not found or already deleted' }, { status: 404 });
    }
    
    // Log security event
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
