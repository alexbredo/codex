
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import type { StructuralChangelogEntry, PaginatedStructuralChangelogResponse } from '@/lib/types';

export async function GET(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = (page - 1) * limit;

  // Basic filtering options (can be expanded)
  const entityType = searchParams.get('entityType');
  const entityId = searchParams.get('entityId');
  const userIdParam = searchParams.get('userId');
  const action = searchParams.get('action');
  const dateStart = searchParams.get('dateStart');
  const dateEnd = searchParams.get('dateEnd');

  let whereClauses: string[] = [];
  let queryParams: any[] = [];

  if (entityType) {
    whereClauses.push('scl.entityType = ?');
    queryParams.push(entityType);
  }
  if (entityId) {
    whereClauses.push('scl.entityId = ?');
    queryParams.push(entityId);
  }
  if (userIdParam) {
    whereClauses.push('scl.userId = ?');
    queryParams.push(userIdParam);
  }
  if (action) {
    whereClauses.push('scl.action = ?');
    queryParams.push(action);
  }
  if (dateStart) {
    whereClauses.push('scl.timestamp >= ?');
    queryParams.push(dateStart);
  }
  if (dateEnd) {
    // Add 1 day to dateEnd to make it inclusive of the end date up to 23:59:59
    const endDate = new Date(dateEnd);
    endDate.setDate(endDate.getDate() + 1);
    whereClauses.push('scl.timestamp < ?');
    queryParams.push(endDate.toISOString().split('T')[0]);
  }

  const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  try {
    const db = await getDb();

    const countResult = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM structural_changelog scl ${whereString}`,
      ...queryParams
    );
    const totalEntries = countResult?.count || 0;
    const totalPages = Math.ceil(totalEntries / limit);

    const rows = await db.all(
      `SELECT scl.*, u.username 
       FROM structural_changelog scl
       LEFT JOIN users u ON scl.userId = u.id
       ${whereString}
       ORDER BY scl.timestamp DESC
       LIMIT ? OFFSET ?`,
      ...queryParams,
      limit,
      offset
    );

    const entries: StructuralChangelogEntry[] = rows.map(row => ({
      ...row,
      changes: JSON.parse(row.changes), // Parse the JSON string into an object
      username: row.username || (row.userId ? 'Unknown User' : 'System'),
    }));

    const responsePayload: PaginatedStructuralChangelogResponse = {
      entries,
      totalEntries,
      totalPages,
      currentPage: page,
    };

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error('API Error (GET /structural-changelog):', error);
    return NextResponse.json({ error: 'Failed to fetch structural changelog', details: error.message }, { status: 500 });
  }
}
