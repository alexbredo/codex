
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { z } from 'zod';
import { cookies } from 'next/headers';

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
    // Join with roles table to get role name
    const user = await db.get(`
        SELECT u.id, u.username, u.password, r.name as role 
        FROM users u
        LEFT JOIN roles r ON u.roleId = r.id
        WHERE u.username = ?
    `, username);

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
    
    // Simple session management: set user ID in a cookie
    // This is a basic placeholder and not secure for production.
    cookies().set('codex_structure_session', user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7, // 1 week
      path: '/',
      sameSite: 'lax',
    });

    // Log security event
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

    // Don't send password back
    const { password: _, ...userWithoutPassword } = user;
     // Normalize role name for consistency
    userWithoutPassword.role = userWithoutPassword.role?.toLowerCase() === 'administrator' ? 'administrator' : 'user';

    return NextResponse.json(userWithoutPassword);

  } catch (error: any) {
    console.error('API Error (POST /api/auth/login):', error);
    return NextResponse.json({ error: 'Failed to login', details: error.message }, { status: 500 });
  }
}
