
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { z } from 'zod';

const createUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
  roleId: z.string().uuid("A valid role ID must be provided."),
});

// GET all users
export async function GET(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = await getDb();
    const users = await db.all(`
        SELECT u.id, u.username, u.roleId, r.name as role
        FROM users u
        LEFT JOIN roles r ON u.roleId = r.id
        ORDER BY u.username ASC
    `);
    
    const formattedUsers = users.map(u => ({
        id: u.id,
        username: u.username,
        roleId: u.roleId,
        role: u.role || 'N/A' // Handle case where role might be null
    }));

    return NextResponse.json(formattedUsers);
  } catch (error: any) {
    console.error('API Error - Failed to fetch users:', error);
    return NextResponse.json({ error: 'Failed to fetch users', details: error.message }, { status: 500 });
  }
}

// POST (create) a new user (Admin action)
export async function POST(request: Request) {
  const adminUser = await getCurrentUserFromCookie();
  if (!adminUser || adminUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized to create user' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const validation = createUserSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const { username, password, roleId } = validation.data;
    const db = await getDb();

    const existingUser = await db.get('SELECT id FROM users WHERE username = ?', username);
    if (existingUser) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
    }

    const roleExists = await db.get('SELECT id, name FROM roles WHERE id = ?', roleId);
    if (!roleExists) {
        return NextResponse.json({ error: 'Invalid roleId provided.' }, { status: 400 });
    }

    const userId = crypto.randomUUID();
    await db.run(
      'INSERT INTO users (id, username, password, roleId, role) VALUES (?, ?, ?, ?, ?)',
      userId,
      username,
      password,
      roleId,
      roleExists.name
    );
    
    const logId = crypto.randomUUID();
    await db.run(
      'INSERT INTO security_log (id, timestamp, userId, username, action, targetEntityType, targetEntityId, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      logId,
      new Date().toISOString(),
      adminUser.id,
      adminUser.username,
      'USER_CREATE',
      'User',
      userId,
      JSON.stringify({ createdUsername: username, roleAssigned: roleExists.name })
    );

    const createdUser = {
      id: userId,
      username,
      role: roleExists.name,
      roleId: roleExists.id,
    };
    return NextResponse.json(createdUser, { status: 201 });

  } catch (error: any) {
    console.error('API Error - Failed to create user:', error);
    return NextResponse.json({ error: 'Failed to create user', details: error.message }, { status: 500 });
  }
}
