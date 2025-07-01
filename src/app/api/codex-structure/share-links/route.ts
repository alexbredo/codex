
'use server';

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { z } from 'zod';
import type { SharedObjectLink } from '@/lib/types';
import { randomUUID } from 'crypto';

const createLinkSchema = z.object({
  link_type: z.enum(['view', 'create', 'update']),
  model_id: z.string().uuid(),
  data_object_id: z.string().uuid().optional().nullable(),
  expires_at: z.string().datetime({ offset: true }).optional().nullable(),
  expires_on_submit: z.boolean().optional().default(false),
});

// GET all share links for a specific object or model
export async function GET(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const modelId = searchParams.get('model_id');
    const objectId = searchParams.get('data_object_id');

    const db = await getDb();
    let query = `
      SELECT sl.*, u.username as created_by_username
      FROM shared_object_links sl
      LEFT JOIN users u ON sl.created_by_user_id = u.id
    `;
    const params: any[] = [];
    const whereClauses: string[] = [];
    
    // Links can only be viewed by the user who created them, or an admin
    if (!currentUser.permissionIds.includes('*')) {
        whereClauses.push('sl.created_by_user_id = ?');
        params.push(currentUser.id);
    }
    
    if (objectId) {
      whereClauses.push('sl.data_object_id = ?');
      params.push(objectId);
    } else if (modelId) {
      whereClauses.push('sl.model_id = ?');
      params.push(modelId);
    } else {
        // If neither is provided, return an empty array as it's an invalid request for this logic
        return NextResponse.json([]);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')} ORDER BY sl.created_at DESC`;
    }

    const links: SharedObjectLink[] = await db.all(query, ...params);
    return NextResponse.json(links);
  } catch (error: any) {
    console.error(`[API /share-links] GET Error:`, {
        message: error.message,
        stack: error.stack,
        url: request.url,
    });
    return NextResponse.json({ error: 'Failed to fetch share links', details: error.message }, { status: 500 });
  }
}


// POST to create a new share link
export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validation = createLinkSchema.safeParse(body);
    if (!validation.success) {
      console.error('[API /share-links] Validation failed:', validation.error.flatten());
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const { link_type, model_id, data_object_id, expires_at, expires_on_submit } = validation.data;
    
    if ((link_type === 'view' || link_type === 'update') && !data_object_id) {
        return NextResponse.json({ error: 'data_object_id is required for view and update links.' }, { status: 400 });
    }
    
    const db = await getDb();
    const linkId = randomUUID();
    const createdAt = new Date().toISOString();

    const dataObjectIdToInsert = data_object_id || null;
    const expiresAtToInsert = expires_at || null;

    await db.run(
      'INSERT INTO shared_object_links (id, link_type, model_id, data_object_id, created_by_user_id, created_at, expires_at, expires_on_submit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      linkId, link_type, model_id, dataObjectIdToInsert, currentUser.id, createdAt, expiresAtToInsert, expires_on_submit ? 1 : 0
    );

    const newLink: SharedObjectLink = {
      id: linkId,
      link_type,
      model_id,
      data_object_id: dataObjectIdToInsert,
      created_by_user_id: currentUser.id,
      created_by_username: currentUser.username,
      created_at: createdAt,
      expires_at: expiresAtToInsert,
      expires_on_submit: expires_on_submit,
    };
    
    return NextResponse.json(newLink, { status: 201 });
  } catch (error: any) {
    console.error(`[CRITICAL API ERROR] at POST /api/codex-structure/share-links:`, {
        message: error.message,
        stack: error.stack,
        url: request.url,
    });
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Failed to create share link', details: errorMessage }, { status: 500 });
  }
}
