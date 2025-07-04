
'use server';

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';

interface Params {
  params: { repositoryId: string };
}

export async function DELETE(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !currentUser.permissionIds.includes('*') && !currentUser.permissionIds.includes('marketplace:manage_repositories')) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
  }

  try {
    const db = await getDb();
    const result = await db.run('DELETE FROM marketplace_repositories WHERE id = ?', params.repositoryId);
    if (result.changes === 0) {
      return NextResponse.json({ error: 'Repository not found.' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Repository deleted successfully.' });
  } catch (error: any) {
    console.error(`API Error (DELETE /marketplace/repositories/${params.repositoryId}):`, error);
    return NextResponse.json({ error: 'Failed to delete repository.', details: error.message }, { status: 500 });
  }
}

    