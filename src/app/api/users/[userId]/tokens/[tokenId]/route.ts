
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';

// DELETE to revoke an API token
export async function DELETE(request: Request, { params }: { params: { userId: string, tokenId: string } }) {
  const currentUser = await getCurrentUserFromCookie();
  const { userId, tokenId } = params;

  // A user can revoke their own tokens, or an admin can revoke any user's tokens.
  if (!currentUser || (currentUser.id !== userId && !currentUser.permissionIds.includes('*'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const db = await getDb();
    
    const tokenToRevoke = await db.get('SELECT name FROM api_tokens WHERE id = ? AND userId = ?', tokenId, userId);
    if (!tokenToRevoke) {
      return NextResponse.json({ error: 'Token not found or does not belong to this user.' }, { status: 404 });
    }
    
    const result = await db.run(
      'DELETE FROM api_tokens WHERE id = ? AND userId = ?',
      tokenId,
      userId
    );

    if (result.changes === 0) {
      // This case should be covered by the check above, but it's a good safeguard
      return NextResponse.json({ error: 'Token not found or does not belong to this user.' }, { status: 404 });
    }
    
    // Log security event for token revocation
    const userForToken = await db.get('SELECT username FROM users WHERE id = ?', userId);
    await db.run(
        'INSERT INTO security_log (id, timestamp, userId, username, action, targetEntityType, targetEntityId, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        crypto.randomUUID(),
        new Date().toISOString(),
        currentUser.id,
        currentUser.username,
        'API_TOKEN_REVOKE',
        'User',
        userId,
        JSON.stringify({ revokedTokenName: tokenToRevoke.name, targetUsername: userForToken?.username || userId })
    );

    return NextResponse.json({ message: 'API token revoked successfully.' }, { status: 200 });

  } catch (error: any) {
    console.error(`API Error (DELETE /users/${userId}/tokens/${tokenId}):`, error);
    return NextResponse.json({ error: 'Failed to revoke API token', details: error.message }, { status: 500 });
  }
}
