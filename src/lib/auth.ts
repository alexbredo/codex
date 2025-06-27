
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';

// DEBUG MODE FLAG - Should match the one in auth-context.tsx for consistency during dev
export const DEBUG_MODE = true; // <<< SET TO true TO BYPASS LOGIN FOR DEVELOPMENT

export interface UserRoleInfo {
  id: string;
  name: string;
}

export interface UserSession {
  id: string;
  username: string;
  roles: UserRoleInfo[]; // Now an array of roles
  permissionIds: string[];
}

const adminRoleId = '00000000-role-0000-0000-administrator';
export const MOCK_API_ADMIN_USER: UserSession = {
  id: 'debug-api-admin-user',
  username: 'DebugApiAdmin',
  roles: [{ id: adminRoleId, name: 'Administrator' }],
  permissionIds: ['*'], // Mock admin has all permissions
};

export async function getCurrentUserFromCookie(): Promise<UserSession | null> {
  if (DEBUG_MODE) {
    return MOCK_API_ADMIN_USER;
  }

  const cookieStore = cookies();
  const sessionId = cookieStore.get('codex_structure_session')?.value;

  if (!sessionId) {
    return null;
  }

  try {
    const db = await getDb();
    const userRow = await db.get(`SELECT id, username FROM users WHERE id = ?`, sessionId);
    
    if (!userRow) {
      return null;
    }

    // Fetch all roles for the user
    const userRoles = await db.all<UserRoleInfo[]>(`
        SELECT r.id, r.name
        FROM user_roles ur
        JOIN roles r ON ur.roleId = r.id
        WHERE ur.userId = ?
    `, sessionId);

    if (userRoles.length === 0) {
        // A user should always have at least one role, but handle this edge case.
        return {
            id: userRow.id,
            username: userRow.username,
            roles: [],
            permissionIds: [],
        };
    }

    const roleIds = userRoles.map(r => r.id);

    // Fetch all unique permission IDs for all of the user's roles
    const permissions = await db.all<{ permissionId: string }>(`
        SELECT DISTINCT permissionId 
        FROM role_permissions 
        WHERE roleId IN (${roleIds.map(() => '?').join(',')})
    `, ...roleIds);
    
    const permissionIds = permissions.map(p => p.permissionId);

    // Handle admin wildcard
    if (roleIds.includes(adminRoleId)) {
        if (!permissionIds.includes('*')) {
            permissionIds.push('*');
        }
    }

    return {
        id: userRow.id,
        username: userRow.username,
        roles: userRoles,
        permissionIds,
    };
  } catch (error) {
    console.error("Error fetching user from session cookie:", error);
    return null;
  }
}
