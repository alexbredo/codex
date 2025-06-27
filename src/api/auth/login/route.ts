
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { z } from 'zod';
import { cookies } from 'next/headers';
import type { UserRoleInfo } from '@/lib/types';

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = loginSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const { username, password } = validation.data;
    const db = await getDb();

    // WARNING: Comparing plaintext password. Highly insecure. For demo only.
    const user = await db.get(`SELECT id, username, password FROM users WHERE username = ?`, username);

    if (!user || user.password !== password) {
       if (user) { // User exists, but password was wrong
            const logId = crypto.randomUUID();
            await db.run(
                'INSERT INTO security_log (id, timestamp, userId, username, action, details) VALUES (?, ?, ?, ?, ?, ?)',
                logId,
                new Date().toISOString(),
                user.id,
                user.username,
                'USER_LOGIN_FAILURE',
                JSON.stringify({ ip: request.headers.get('x-forwarded-for') ?? 'unknown', reason: 'Invalid password' })
            );
        }
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }
    
    cookies().set('codex_structure_session', user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
      sameSite: 'lax',
    });

    const logId = crypto.randomUUID();
    await db.run(
        'INSERT INTO security_log (id, timestamp, userId, username, action, details) VALUES (?, ?, ?, ?, ?, ?)',
        logId,
        new Date().toISOString(),
        user.id,
        user.username,
        'USER_LOGIN',
        JSON.stringify({ ip: request.headers.get('x-forwarded-for') ?? 'unknown' })
    );

    // Fetch user's roles
    const userRoles = await db.all<UserRoleInfo[]>(`
        SELECT r.id, r.name 
        FROM user_roles ur
        JOIN roles r ON ur.roleId = r.id
        WHERE ur.userId = ?
    `, user.id);

    // Don't send password back
    const { password: _, ...userWithoutPassword } = user;
    const userToReturn = { ...userWithoutPassword, roles: userRoles };

    return NextResponse.json(userToReturn);

  } catch (error: any) {
    console.error('API Error (POST /api/auth/login):', error);
    return NextResponse.json({ error: 'Failed to login', details: error.message }, { status: 500 });
  }
}
