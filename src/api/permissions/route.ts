
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import type { Permission } from '@/lib/types';

// GET all available permissions
export async function GET(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  const canManageRoles = currentUser?.permissionIds.includes('roles:manage') || currentUser?.permissionIds.includes('*');

  if (!currentUser || !canManageRoles) {
    await getDb().then(db => db.run(
      'INSERT INTO security_log (id, timestamp, userId, username, action, details) VALUES (?, ?, ?, ?, ?, ?)',
      crypto.randomUUID(), new Date().toISOString(), currentUser?.id || null, currentUser?.username || 'Anonymous', 'PERMISSION_DENIED',
      JSON.stringify({ reason: "Attempted to view permissions list without 'roles:manage' permission." })
    )).catch(err => console.error("Failed to log security event:", err));

    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const db = await getDb();
    const permissions: Permission[] = await db.all('SELECT * FROM permissions ORDER BY category, name');
    
    // Group permissions by category for easier use in the UI
    const groupedPermissions = permissions.reduce((acc, perm) => {
      const category = perm.category || 'General';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(perm);
      return acc;
    }, {} as Record<string, Permission[]>);

    return NextResponse.json(groupedPermissions);
  } catch (error: any) {
    console.error('API Error (GET /api/permissions):', error);
    return NextResponse.json({ error: 'Failed to fetch permissions', details: error.message }, { status: 500 });
  }
}
