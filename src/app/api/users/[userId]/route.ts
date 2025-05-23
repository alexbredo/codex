
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { z } from 'zod';

interface Params {
  params: { userId: string };
}

const updateRoleSchema = z.object({
  role: z.enum(['user', 'administrator']),
});

export async function PUT(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const validation = updateRoleSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const { role: newRole } = validation.data;
    const { userId } = params;
    const db = await getDb();

    const targetUser = await db.get('SELECT id, role FROM users WHERE id = ?', userId);
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

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


    await db.run('UPDATE users SET role = ? WHERE id = ?', newRole, userId);

    const updatedUser = await db.get('SELECT id, username, role FROM users WHERE id = ?', userId);
    return NextResponse.json(updatedUser);

  } catch (error: any) {
    console.error(`API Error - Failed to update user role for ${params.userId}:`, error);
    return NextResponse.json({ error: 'Failed to update user role', details: error.message }, { status: 500 });
  }
}
