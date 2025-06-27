
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';

// DEBUG MODE FLAG - Should match the one in auth-context.tsx for consistency during dev
export const DEBUG_MODE = true; // <<< SET TO true TO BYPASS LOGIN FOR DEVELOPMENT

interface UserSession {
  id: string;
  username: string;
  role: 'user' | 'administrator';
  roleId: string;
}

const adminRoleId = '00000000-role-0000-0000-administrator';
export const MOCK_API_ADMIN_USER: UserSession = {
  id: 'debug-api-admin-user',
  username: 'DebugApiAdmin',
  role: 'administrator',
  roleId: adminRoleId,
};

export async function getCurrentUserFromCookie(): Promise<UserSession | null> {
  if (DEBUG_MODE) {
    // console.warn("DEBUG_MODE (API): getCurrentUserFromCookie returning mock admin."); // Keep console.warn for debugging
    return MOCK_API_ADMIN_USER;
  }

  const cookieStore = cookies();
  const sessionId = cookieStore.get('codex_structure_session')?.value;

  if (!sessionId) {
    return null;
  }

  try {
    const db = await getDb();
    // Join with roles table to get the role name
    const userRow = await db.get(`
      SELECT u.id, u.username, u.roleId, r.name as role
      FROM users u
      LEFT JOIN roles r ON u.roleId = r.id
      WHERE u.id = ?
    `, sessionId);
    
    if (!userRow) {
      return null;
    }

    // Normalize role name to fit the expected enum type
    const roleName = userRow.role?.toLowerCase() === 'administrator' ? 'administrator' : 'user';

    return {
        id: userRow.id,
        username: userRow.username,
        roleId: userRow.roleId,
        role: roleName
    };
  } catch (error) {
    console.error("Error fetching user from session cookie:", error);
    return null;
  }
}
