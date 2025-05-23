
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    cookies().delete('codex_structure_session');
    return NextResponse.json({ message: 'Logged out successfully' });
  } catch (error: any) {
    console.error('Logout Error:', error);
    return NextResponse.json({ error: 'Failed to logout', details: error.message }, { status: 500 });
  }
}
