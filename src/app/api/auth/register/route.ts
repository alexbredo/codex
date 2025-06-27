
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { z } from 'zod';

// Role is now determined by the backend, not sent by client
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

    // Determine role: first user is admin, others are user
    const userCountResult = await db.get('SELECT COUNT(*) as count FROM users');
    const userCount = userCountResult?.count || 0;
    
    let roleName: 'administrator' | 'user';
    let roleId: string;

    const adminRole = await db.get("SELECT id FROM roles WHERE name = 'Administrator'");
    const userRole = await db.get("SELECT id FROM roles WHERE name = 'User'");

    if (userCount === 0 && adminRole) {
      roleName = 'administrator';
      roleId = adminRole.id;
    } else if (userRole) {
      roleName = 'user';
      roleId = userRole.id;
    } else {
      // Fallback if roles aren't seeded correctly
      return NextResponse.json({ error: "System roles not configured. Cannot register user." }, { status: 500 });
    }


    const userId = crypto.randomUUID();
    // WARNING: Storing plaintext password. Highly insecure. For demo only.
    await db.run(
      'INSERT INTO users (id, username, password, role, roleId) VALUES (?, ?, ?, ?, ?)',
      userId,
      username,
      password, // Plaintext password
      roleName, // Old field for compatibility if needed, though should be deprecated
      roleId
    );

    // Log security event
    const logId = crypto.randomUUID();
    await db.run(
      'INSERT INTO security_log (id, timestamp, userId, username, action, targetEntityType, targetEntityId, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      logId,
      new Date().toISOString(),
      userId, // The user who was just created
      username,
      'USER_REGISTER',
      'User',
      userId,
      JSON.stringify({ ip: request.headers.get('x-forwarded-for') ?? 'unknown', roleAssigned: roleName })
    );

    return NextResponse.json({ id: userId, username, role: roleName }, { status: 201 });
  } catch (error: any) {
    console.error('API Error (POST /api/auth/register):', error);
    return NextResponse.json({ error: 'Failed to register user', details: error.message }, { status: 500 });
  }
}
