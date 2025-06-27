
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';
import { getCurrentUserFromCookie } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    // Rely on the refactored auth helper
    const user = await getCurrentUserFromCookie();

    if (!user) {
      // No active session or user not found, which is a valid state
      return NextResponse.json(null, { status: 200 });
    }
    
    // The user object from getCurrentUserFromCookie already has the desired shape
    // { id, username, role, roleId } but we only need to send back id, username, role.
    const { roleId, ...userForClient } = user;

    return NextResponse.json(userForClient);
    
  } catch (error: any) {
    console.error('API Error (GET /api/auth/me):', error);
    return NextResponse.json({ error: 'Failed to fetch current user', details: error.message }, { status: 500 });
  }
}
