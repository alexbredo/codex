
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUserFromCookie();
    
    if (currentUser) {
      const db = await getDb();
      const logId = crypto.randomUUID();
      await db.run(
        'INSERT INTO security_log (id, timestamp, userId, username, action, details) VALUES (?, ?, ?, ?, ?, ?)',
        logId,
        new Date().toISOString(),
        currentUser.id,
        currentUser.username,
        'USER_LOGOUT',
        JSON.stringify({ ip: request.headers.get('x-forwarded-for') ?? 'unknown' })
      );
    }
    
    cookies().delete('codex_structure_session');
    return NextResponse.json({ message: 'Logged out successfully' });
  } catch (error: any) {
    console.error('API Error (POST /api/auth/logout):', error);
    return NextResponse.json({ error: 'Failed to logout', details: error.message }, { status: 500 });
  }
}
