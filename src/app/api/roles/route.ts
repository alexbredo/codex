
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { z } from 'zod';

const roleSchema = z.object({
  name: z.string().min(1, 'Role name is required.'),
  description: z.string().optional(),
  permissionIds: z.array(z.string()).optional().default([]),
});

// GET all roles
export async function GET(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  
  try {
    const db = await getDb();
    const roles = await db.all(`
      SELECT r.id, r.name, r.description, r.isSystemRole, COUNT(u.id) as userCount, COUNT(rp.permissionId) as permissionCount
      FROM roles r
      LEFT JOIN users u ON r.id = u.roleId
      LEFT JOIN role_permissions rp ON r.id = rp.roleId
      GROUP BY r.id, r.name, r.description
      ORDER BY r.name ASC
    `);

    return NextResponse.json(roles);
  } catch (error: any) {
    console.error('API Error (GET /api/roles):', error);
    return NextResponse.json({ error: 'Failed to fetch roles', details: error.message }, { status: 500 });
  }
}

// POST a new role
export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const db = await getDb();
  await db.run('BEGIN TRANSACTION');

  try {
    const body = await request.json();
    const validation = roleSchema.safeParse(body);
    if (!validation.success) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }
    const { name, description, permissionIds } = validation.data;

    // Check for name uniqueness
    const existingRole = await db.get('SELECT id FROM roles WHERE name = ?', name);
    if (existingRole) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'A role with this name already exists.' }, { status: 409 });
    }

    const roleId = crypto.randomUUID();
    await db.run(
      'INSERT INTO roles (id, name, description, isSystemRole) VALUES (?, ?, ?, 0)',
      roleId, name, description
    );

    if (permissionIds.length > 0) {
      const stmt = await db.prepare('INSERT INTO role_permissions (roleId, permissionId) VALUES (?, ?)');
      for (const permId of permissionIds) {
        await stmt.run(roleId, permId);
      }
      await stmt.finalize();
    }
    
    await db.run('COMMIT');
    
    const newRole = await db.get('SELECT * FROM roles WHERE id = ?', roleId);
    return NextResponse.json(newRole, { status: 201 });
  } catch (error: any) {
    await db.run('ROLLBACK');
    console.error('API Error (POST /api/roles):', error);
    return NextResponse.json({ error: 'Failed to create role', details: error.message }, { status: 500 });
  }
}
