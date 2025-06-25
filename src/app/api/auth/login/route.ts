
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
    const user = await db.get('SELECT id, username, role, password FROM users WHERE username = ?', username);

    if (!user || user.password !== password) {
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

    // Don't send password back
    const { password: _, ...userWithoutPassword } = user;
    return NextResponse.json(userWithoutPassword);

  } catch (error: any) {
    console.error('API Error (POST /api/auth/login):', error);
    return NextResponse.json({ error: 'Failed to login', details: error.message }, { status: 500 });
  }
}
