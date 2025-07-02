
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';

interface Params {
  params: { linkId: string };
}

// DELETE a share link to revoke it
export async function DELETE(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { linkId } = params;

  try {
    const db = await getDb();
    
    const linkToDelete = await db.get('SELECT created_by_user_id, link_type, model_id, data_object_id FROM shared_object_links WHERE id = ?', linkId);
    if (!linkToDelete) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    }

    if (linkToDelete.created_by_user_id !== currentUser.id && !currentUser.permissionIds.includes('*')) {
       return NextResponse.json({ error: 'Forbidden: You do not have permission to delete this link.' }, { status: 403 });
    }

    const result = await db.run('DELETE FROM shared_object_links WHERE id = ?', linkId);
    if (result.changes === 0) {
      return NextResponse.json({ error: 'Link not found or already deleted' }, { status: 404 });
    }

    // Log security event for share link revocation
    await db.run(
      'INSERT INTO security_log (id, timestamp, userId, username, action, targetEntityType, targetEntityId, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      crypto.randomUUID(),
      new Date().toISOString(),
      currentUser.id,
      currentUser.username,
      'SHARE_LINK_DELETE',
      'ShareLink',
      linkId,
      JSON.stringify({ linkType: linkToDelete.link_type, modelId: linkToDelete.model_id, objectId: linkToDelete.data_object_id })
    );

    return NextResponse.json({ message: 'Share link revoked successfully.' }, { status: 200 });
  } catch (error: any) {
    console.error(`API Error (DELETE /share-links/${linkId}):`, error);
    return NextResponse.json({ error: 'Failed to revoke share link', details: error.message }, { status: 500 });
  }
}
