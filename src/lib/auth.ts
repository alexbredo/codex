
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';

interface UserSession {
  id: string;
  username: string;
  role: 'user' | 'administrator';
}

export async function getCurrentUserFromCookie(): Promise<UserSession | null> {
  const cookieStore = cookies();
  const sessionId = cookieStore.get('codex_structure_session')?.value;

  if (!sessionId) {
    return null;
  }

  try {
    const db = await getDb();
    // Ensure you select all necessary fields for UserSession
    const user = await db.get('SELECT id, username, role FROM users WHERE id = ?', sessionId);
    
    if (!user) {
      return null;
    }
    // Ensure the role is one of the expected values
    if (user.role !== 'user' && user.role !== 'administrator') {
        console.warn(`User ${user.id} has an invalid role: ${user.role}. Defaulting to 'user'.`);
        user.role = 'user'; // Or handle as an error
    }

    return user as UserSession;
  } catch (error) {
    console.error("Error fetching user from session cookie:", error);
    return null;
  }
}
