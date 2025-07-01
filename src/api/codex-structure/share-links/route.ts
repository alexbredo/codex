
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
});

// GET all share links for a specific object or model
export async function GET(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Robustly construct the full URL to prevent crashes from relative paths
    const host = request.headers.get('host') || 'localhost';
    const protocol = host.startsWith('localhost') ? 'http' : 'https';
    const requestUrl = new URL(request.url, `${protocol}://${host}`);

    const dataObjectId = requestUrl.searchParams.get('data_object_id');
    const modelId = requestUrl.searchParams.get('model_id');

    if (!dataObjectId && !modelId) {
      return NextResponse.json({ error: 'A data_object_id or model_id must be provided' }, { status: 400 });
    }

    const db = await getDb();
    let query: string;
    const queryParams: any[] = [];
    
    if (dataObjectId) {
      query = `
        SELECT sl.id, sl.link_type, sl.model_id, sl.data_object_id, sl.created_by_user_id, sl.created_at, sl.expires_at, u.username as created_by_username
        FROM shared_object_links sl
        LEFT JOIN users u ON sl.created_by_user_id = u.id
        WHERE sl.data_object_id = ?
        ORDER BY sl.created_at DESC
      `;
      queryParams.push(dataObjectId);
    } else { // modelId must be present
      query = `
        SELECT sl.id, sl.link_type, sl.model_id, sl.data_object_id, sl.created_by_user_id, sl.created_at, sl.expires_at, u.username as created_by_username
        FROM shared_object_links sl
        LEFT JOIN users u ON sl.created_by_user_id = u.id
        WHERE sl.model_id = ? AND sl.link_type = 'create'
        ORDER BY sl.created_at DESC
      `;
      queryParams.push(modelId);
    }
    
    const links: SharedObjectLink[] = await db.all(query, ...queryParams);
    return NextResponse.json(links);
  } catch (error: any) {
    console.error(`[CRITICAL API ERROR] at GET /api/codex-structure/share-links:`, {
        message: error.message,
        stack: error.stack,
        url: request.url,
    });
    return NextResponse.json({ error: 'Failed to fetch share links due to a server error.', details: error.message }, { status: 500 });
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

    const { link_type, model_id, data_object_id, expires_at } = validation.data;
    
    if ((link_type === 'view' || link_type === 'update') && !data_object_id) {
        return NextResponse.json({ error: 'data_object_id is required for view and update links.' }, { status: 400 });
    }
    
    const db = await getDb();
    const linkId = randomUUID();
    const createdAt = new Date().toISOString();

    const dataObjectIdToInsert = data_object_id || null;
    const expiresAtToInsert = expires_at || null;

    await db.run(
      'INSERT INTO shared_object_links (id, link_type, model_id, data_object_id, created_by_user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      linkId, link_type, model_id, dataObjectIdToInsert, currentUser.id, createdAt, expiresAtToInsert
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
