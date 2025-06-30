
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { z } from 'zod';
import crypto from 'crypto';

const createTokenSchema = z.object({
  name: z.string().min(3, "Token name must be at least 3 characters.").max(50),
});

// GET user's API tokens (metadata only)
export async function GET(request: Request, { params }: { params: { userId: string } }) {
  const currentUser = await getCurrentUserFromCookie();
  const { userId } = params;

  // A user can fetch their own tokens, or an admin can fetch any user's tokens.
  if (!currentUser || (currentUser.id !== userId && !currentUser.permissionIds.includes('*'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const db = await getDb();
    const tokens = await db.all(
      'SELECT id, name, createdAt, lastUsedAt FROM api_tokens WHERE userId = ? ORDER BY createdAt DESC',
      userId
    );
    return NextResponse.json(tokens);
  } catch (error: any) {
    console.error(`API Error (GET /users/${userId}/tokens):`, error);
    return NextResponse.json({ error: 'Failed to fetch API tokens', details: error.message }, { status: 500 });
  }
}

// POST to create a new API token
export async function POST(request: Request, { params }: { params: { userId: string } }) {
  const currentUser = await getCurrentUserFromCookie();
  const { userId } = params;

  // A user can create their own tokens, or an admin can create them for any user.
  if (!currentUser || (currentUser.id !== userId && !currentUser.permissionIds.includes('*'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  
  const db = await getDb();

  try {
    const body = await request.json();
    const validation = createTokenSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }
    const { name } = validation.data;

    // Generate a secure, unique token
    const tokenValue = `codex_${crypto.randomBytes(32).toString('hex')}`;
    const tokenId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await db.run(
      'INSERT INTO api_tokens (id, userId, token, name, createdAt) VALUES (?, ?, ?, ?, ?)',
      tokenId, userId, tokenValue, name, createdAt
    );

    // Return the full token value ONCE. It is not stored in a retrievable way.
    return NextResponse.json({ id: tokenId, name, createdAt, token: tokenValue }, { status: 201 });

  } catch (error: any) {
    console.error(`API Error (POST /users/${userId}/tokens):`, error);
    if (error.message.includes('UNIQUE constraint failed')) {
        return NextResponse.json({ error: 'Failed to create token due to a database conflict. Please try again.' }, { status: 500 });
    }
    return NextResponse.json({ error: 'Failed to create API token', details: error.message }, { status: 500 });
  }
}
