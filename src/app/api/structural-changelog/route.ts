
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import type { StructuralChangelogEntry, SecurityLogEntry, ActivityLogEntry, PaginatedActivityLogResponse } from '@/lib/types';

const PUBLIC_USER_ID_FILTER_VALUE = "__PUBLIC_SUBMISSION__";

export async function GET(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || (!currentUser.permissionIds.includes('admin:view_activity_log') && !currentUser.permissionIds.includes('*'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = (page - 1) * limit;

  // Filters
  const categoryFilter = searchParams.get('category');
  const userIdFilter = searchParams.get('userId');
  const actionFilter = searchParams.get('action');
  const dateStart = searchParams.get('dateStart');
  const dateEnd = searchParams.get('dateEnd');

  try {
    const db = await getDb();
    let allEntries: ActivityLogEntry[] = [];

    // Fetch Structural Changes
    if (!categoryFilter || categoryFilter === 'Structural') {
      const structuralRows: StructuralChangelogEntry[] = await db.all(
        `SELECT scl.*, u.username FROM structural_changelog scl LEFT JOIN users u ON scl.userId = u.id ORDER BY scl.timestamp DESC`
      );
      allEntries.push(...structuralRows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        category: 'Structural' as const,
        user: { id: row.userId, name: row.username || (row.userId ? 'Unknown User' : 'System') },
        action: row.action,
        entity: { type: row.entityType, id: row.entityId, name: row.entityName || null },
        summary: `${row.action} ${row.entityType} ${row.entityName || `(${row.entityId.substring(0,8)}...)`}`,
        details: JSON.parse(row.changes as any),
      })));
    }
    
    // Fetch Security Changes
    if (!categoryFilter || categoryFilter === 'Security') {
      const securityRows: SecurityLogEntry[] = await db.all(
        `SELECT * FROM security_log ORDER BY timestamp DESC`
      );
      allEntries.push(...securityRows.map(row => {
        const details = row.details ? JSON.parse(row.details as any) : {};
        let summary = `${row.action.replace(/_/g, ' ')}`;
        if(row.targetEntityType && details.createdUsername) summary += `: ${details.createdUsername}`;
        if(row.targetEntityType && details.deletedUsername) summary += `: ${details.deletedUsername}`;

        return {
          id: row.id,
          timestamp: row.timestamp,
          category: 'Security' as const,
          user: { id: row.userId, name: row.username || 'System' },
          action: row.action,
          entity: { type: row.targetEntityType || 'System', id: row.targetEntityId || null, name: details.createdUsername || details.deletedUsername || null },
          summary: summary,
          details: details,
        }
      }));
    }

    // Fetch Data Changes
    if (!categoryFilter || categoryFilter === 'Data') {
      const dataChangeRows: any[] = await db.all(`
        SELECT 
            dcl.id,
            dcl.changedAt as timestamp,
            dcl.changedByUserId as userId,
            u.username,
            dcl.changeType as action,
            dcl.dataObjectId as entityId,
            dcl.modelId as modelId,
            m.name as modelName,
            dcl.changes
        FROM data_object_changelog dcl
        LEFT JOIN users u ON dcl.changedByUserId = u.id
        JOIN models m ON dcl.modelId = m.id
        ORDER BY dcl.changedAt DESC
      `);
      
      allEntries.push(...dataChangeRows.map(row => {
        const details = JSON.parse(row.changes as any);
        let summary = `${row.action} an object in model '${row.modelName}'`;
        
        return {
            id: row.id,
            timestamp: row.timestamp,
            category: 'Data' as const,
            user: { id: row.userId, name: row.username || (row.userId ? 'Unknown User' : 'System') },
            action: row.action,
            entity: { type: 'DataObject', id: row.entityId, name: null }, // Don't have object display name here easily
            summary: summary,
            details: details,
        };
      }));
    }
    
    // Manual Filtering
    let filteredEntries = allEntries;
    if (userIdFilter) {
      if (userIdFilter === PUBLIC_USER_ID_FILTER_VALUE) {
        // Special case for public submissions which have a null userId in 'Data' category logs
        filteredEntries = filteredEntries.filter(entry => entry.user.id === null && entry.category === 'Data');
      } else {
        filteredEntries = filteredEntries.filter(entry => entry.user.id === userIdFilter);
      }
    }
    if (actionFilter) {
      filteredEntries = filteredEntries.filter(entry => entry.action === actionFilter);
    }
    if (dateStart) {
      filteredEntries = filteredEntries.filter(entry => new Date(entry.timestamp) >= new Date(dateStart));
    }
    if (dateEnd) {
      const endDate = new Date(dateEnd);
      endDate.setDate(endDate.getDate() + 1);
      filteredEntries = filteredEntries.filter(entry => new Date(entry.timestamp) < endDate);
    }


    // Manual Sorting and Pagination
    filteredEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const totalEntries = filteredEntries.length;
    const totalPages = Math.ceil(totalEntries / limit);
    const paginatedEntries = filteredEntries.slice(offset, offset + limit);

    const responsePayload: PaginatedActivityLogResponse = {
      entries: paginatedEntries,
      totalEntries,
      totalPages,
      currentPage: page,
    };

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error('API Error (GET /structural-changelog -> Activity Log):', error);
    return NextResponse.json({ error: 'Failed to fetch activity log', details: error.message }, { status: 500 });
  }
}
