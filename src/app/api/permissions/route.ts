
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import type { Permission } from '@/lib/types';

// GET all available permissions
export async function GET(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const db = await getDb();
    const permissions: Permission[] = await db.all('SELECT * FROM permissions ORDER BY category, name');
    
    // Group permissions by category for easier use in the UI
    const groupedPermissions = permissions.reduce((acc, perm) => {
      if (!acc[perm.category]) {
        acc[perm.category] = [];
      }
      acc[perm.category].push(perm);
      return acc;
    }, {} as Record<string, Permission[]>);

    return NextResponse.json(groupedPermissions);
  } catch (error: any) {
    console.error('API Error (GET /api/permissions):', error);
    return NextResponse.json({ error: 'Failed to fetch permissions', details: error.message }, { status: 500 });
  }
}
