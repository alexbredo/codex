
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { z } from 'zod';

const createUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
  roleIds: z.array(z.string().uuid("Each role ID must be a valid UUID.")).min(1, "At least one role is required."),
});

// GET all users with their roles
export async function GET(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || (!currentUser.permissionIds.includes('users:view') && !currentUser.permissionIds.includes('*'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const db = await getDb();
    const users = await db.all(`
        SELECT 
          u.id, 
          u.username,
          GROUP_CONCAT(r.id) as roleIds,
          GROUP_CONCAT(r.name) as roleNames
        FROM users u
        LEFT JOIN user_roles ur ON u.id = ur.userId
        LEFT JOIN roles r ON ur.roleId = r.id
        GROUP BY u.id
        ORDER BY u.username ASC
    `);
    
    const formattedUsers = users.map(u => ({
        id: u.id,
        username: u.username,
        roles: u.roleIds ? u.roleIds.split(',').map((id: string, index: number) => ({
            id: id,
            name: u.roleNames.split(',')[index]
        })) : []
    }));

    return NextResponse.json(formattedUsers);
  } catch (error: any) {
    console.error('API Error - Failed to fetch users:', error);
    return NextResponse.json({ error: 'Failed to fetch users', details: error.message }, { status: 500 });
  }
}

// POST (create) a new user (Admin action)
export async function POST(request: Request) {
  const adminUser = await getCurrentUserFromCookie();
  if (!adminUser || !adminUser.permissionIds.includes('users:create')) {
    return NextResponse.json({ error: 'Unauthorized to create user' }, { status: 403 });
  }

  const db = await getDb();
  await db.run('BEGIN TRANSACTION');

  try {
    const body = await request.json();
    const validation = createUserSchema.safeParse(body);

    if (!validation.success) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const { username, password, roleIds } = validation.data;

    const existingUser = await db.get('SELECT id FROM users WHERE username = ?', username);
    if (existingUser) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
    }
    
    const userId = crypto.randomUUID();
    await db.run('INSERT INTO users (id, username, password) VALUES (?, ?, ?)', userId, username, password);

    // Assign roles
    const roleStmt = await db.prepare('INSERT INTO user_roles (userId, roleId) VALUES (?, ?)');
    for (const roleId of roleIds) {
      await roleStmt.run(userId, roleId);
    }
    await roleStmt.finalize();
    
    const assignedRoles = await db.all('SELECT name from roles WHERE id IN (' + roleIds.map(() => '?').join(',') + ')', ...roleIds);
    const assignedRoleNames = assignedRoles.map(r => r.name);

    const logId = crypto.randomUUID();
    await db.run(
      'INSERT INTO security_log (id, timestamp, userId, username, action, targetEntityType, targetEntityId, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      logId,
      new Date().toISOString(),
      adminUser.id,
      adminUser.username,
      'USER_CREATE',
      'User',
      userId,
      JSON.stringify({ createdUsername: username, rolesAssigned: assignedRoleNames })
    );

    await db.run('COMMIT');
    
    const createdUser = await db.get('SELECT id, username FROM users WHERE id = ?', userId);
    createdUser.roles = assignedRoles.map((r, i) => ({ id: roleIds[i], name: r.name }));

    return NextResponse.json(createdUser, { status: 201 });

  } catch (error: any) {
    await db.run('ROLLBACK');
    console.error('API Error - Failed to create user:', error);
    return NextResponse.json({ error: 'Failed to create user', details: error.message }, { status: 500 });
  }
}
