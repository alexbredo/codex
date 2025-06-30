
import { cookies, headers } from 'next/headers';
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
  
  const db = await getDb();
  let userIdToAuth: string | null = null;

  const authHeader = headers().get('Authorization');
  
  // 1. If an Authorization header with a Bearer token is present, use it exclusively.
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const tokenRecord = await db.get('SELECT userId FROM api_tokens WHERE token = ?', token);
    
    if (tokenRecord) {
      userIdToAuth = tokenRecord.userId;
      // Update last used timestamp (fire-and-forget for performance)
      db.run('UPDATE api_tokens SET lastUsedAt = ? WHERE token = ?', new Date().toISOString(), token).catch(err => {
        console.error("Failed to update token lastUsedAt timestamp:", err);
      });
    } else {
      // If a token was provided but it's invalid, we fail the authentication immediately
      // without checking for cookies. This is a stricter security measure.
      return null;
    }
  } else {
    // 2. If no Authorization header, fall back to checking the session cookie for browser-based access.
    const cookieStore = cookies();
    const sessionId = cookieStore.get('codex_structure_session')?.value;
    if (sessionId) {
      userIdToAuth = sessionId;
    }
  }

  // If we couldn't determine a user from either token or cookie, there's no session.
  if (!userIdToAuth) {
    return null;
  }

  // 3. Fetch user details, roles, and permissions using the determined user ID
  try {
    const userRow = await db.get(`SELECT id, username FROM users WHERE id = ?`, userIdToAuth);
    if (!userRow) return null;

    const userRoles = await db.all<UserRoleInfo[]>(`
        SELECT r.id, r.name
        FROM user_roles ur
        JOIN roles r ON ur.roleId = r.id
        WHERE ur.userId = ?
    `, userIdToAuth);

    if (userRoles.length === 0) {
      return { id: userRow.id, username: userRow.username, roles: [], permissionIds: [] };
    }

    const roleIds = userRoles.map(r => r.id);

    const permissions = await db.all<{ permissionId: string }>(`
        SELECT DISTINCT permissionId 
        FROM role_permissions 
        WHERE roleId IN (${roleIds.map(() => '?').join(',')})
    `, ...roleIds);
    
    const permissionIds = permissions.map(p => p.permissionId);

    if (roleIds.includes(adminRoleId) && !permissionIds.includes('*')) {
        permissionIds.push('*');
    }

    return {
        id: userRow.id,
        username: userRow.username,
        roles: userRoles,
        permissionIds,
    };
  } catch (error) {
    console.error("Error fetching user session:", error);
    return null;
  }
}
