
import { NextResponse } from 'next/server';
import { getCurrentUserFromCookie } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const user = await getCurrentUserFromCookie();

    if (!user) {
      return NextResponse.json(null, { status: 200 });
    }
    
    // The user object from getCurrentUserFromCookie already has the desired shape
    // { id, username, roles, permissionIds }
    return NextResponse.json(user);
    
  } catch (error: any) {
    console.error('API Error (GET /api/auth/me):', error);
    return NextResponse.json({ error: 'Failed to fetch current user', details: error.message }, { status: 500 });
  }
}
