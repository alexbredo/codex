
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { z } from 'zod';

const registerSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = registerSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const { username, password } = validation.data;
    const db = await getDb();

    const existingUser = await db.get('SELECT id FROM users WHERE username = ?', username);
    if (existingUser) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
    }

    const userCountResult = await db.get('SELECT COUNT(*) as count FROM users');
    const userCount = userCountResult?.count || 0;
    
    let roleToAssign;
    const adminRoleId = '00000000-role-0000-0000-administrator';
    const userRoleId = '00000000-role-0000-0000-000user000000';

    if (userCount === 0) { // First user becomes an admin
        roleToAssign = await db.get("SELECT id, name FROM roles WHERE id = ?", adminRoleId);
    } else { // Subsequent users get the standard 'User' role
        roleToAssign = await db.get("SELECT id, name FROM roles WHERE id = ?", userRoleId);
    }

    if (!roleToAssign) {
      return NextResponse.json({ error: "System roles not configured. Cannot register user." }, { status: 500 });
    }
    
    const userId = crypto.randomUUID();
    // WARNING: Storing plaintext password. Highly insecure. For demo only.
    await db.run('INSERT INTO users (id, username, password) VALUES (?, ?, ?)', userId, username, password);
    // Assign the role in the new join table
    await db.run('INSERT INTO user_roles (userId, roleId) VALUES (?, ?)', userId, roleToAssign.id);

    const logId = crypto.randomUUID();
    await db.run(
      'INSERT INTO security_log (id, timestamp, userId, username, action, targetEntityType, targetEntityId, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      logId,
      new Date().toISOString(),
      userId,
      username,
      'USER_REGISTER',
      'User',
      userId,
      JSON.stringify({ ip: request.headers.get('x-forwarded-for') ?? 'unknown', roleAssigned: roleToAssign.name })
    );

    return NextResponse.json({ id: userId, username, roles: [roleToAssign] }, { status: 201 });
  } catch (error: any) {
    console.error('API Error (POST /api/auth/register):', error);
    return NextResponse.json({ error: 'Failed to register user', details: error.message }, { status: 500 });
  }
}
