
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';

// DEBUG MODE FLAG - Should match the one in auth-context.tsx for consistency during dev
export const DEBUG_MODE = false; // <<< SET TO true TO BYPASS LOGIN FOR DEVELOPMENT

interface UserSession {
  id: string;
  username: string;
  role: 'user' | 'administrator';
}

export const MOCK_API_ADMIN_USER: UserSession = {
  id: 'debug-api-admin-user',
  username: 'DebugApiAdmin',
  role: 'administrator',
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
    const user = await db.get('SELECT id, username, role FROM users WHERE id = ?', sessionId);
    
    if (!user) {
      return null;
    }
    if (user.role !== 'user' && user.role !== 'administrator') {
        console.warn(`User ${user.id} has an invalid role: ${user.role}. Defaulting to 'user'.`);
        user.role = 'user'; // Or handle as unauthorized appropriately
    }

    return user as UserSession;
  } catch (error) {
    console.error("Error fetching user from session cookie:", error);
    return null;
  }
}
