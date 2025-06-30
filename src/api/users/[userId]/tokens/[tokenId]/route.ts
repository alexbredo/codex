
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';

interface Params {
  params: { userId: string, tokenId: string };
}

// DELETE to revoke an API token
export async function DELETE(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  const { userId, tokenId } = params;

  // A user can revoke their own tokens, or an admin can revoke any user's tokens.
  if (!currentUser || (currentUser.id !== userId && !currentUser.permissionIds.includes('*'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const db = await getDb();
    const result = await db.run(
      'DELETE FROM api_tokens WHERE id = ? AND userId = ?',
      tokenId,
      userId
    );

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Token not found or does not belong to this user.' }, { status: 404 });
    }
    
    return NextResponse.json({ message: 'API token revoked successfully.' }, { status: 200 });

  } catch (error: any) {
    console.error(`API Error (DELETE /users/${userId}/tokens/${tokenId}):`, error);
    return NextResponse.json({ error: 'Failed to revoke API token', details: error.message }, { status: 500 });
  }
}
