
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  try {
    const cookieStore = cookies();
    const sessionId = cookieStore.get('codex_structure_session')?.value;

    if (!sessionId) {
      return NextResponse.json(null, { status: 200 }); // No active session
    }

    const db = await getDb();
    const user = await db.get('SELECT id, username, role FROM users WHERE id = ?', sessionId);

    if (!user) {
      // Invalid session ID, clear cookie
      cookies().delete('codex_structure_session');
      return NextResponse.json(null, { status: 200 });
    }

    return NextResponse.json(user);
  } catch (error: any) {
    console.error('API Error (GET /api/auth/me):', error);
    return NextResponse.json({ error: 'Failed to fetch current user', details: error.message }, { status: 500 });
  }
}
