
'use server';

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { z } from 'zod';
import type { MarketplaceRepository } from '@/lib/types';

export const dynamic = 'force-dynamic';

const repositorySchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters."),
  url: z.string().url("Must be a valid URL."),
  api_key: z.string().optional(),
});

// GET all repositories
export async function GET(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !currentUser.permissionIds.includes('*') && !currentUser.permissionIds.includes('marketplace:manage_repositories')) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
  }

  try {
    const db = await getDb();
    const repositories = await db.all('SELECT * FROM marketplace_repositories ORDER BY name ASC');
    return NextResponse.json(repositories);
  } catch (error: any) {
    console.error("API Error (GET /marketplace/repositories):", error);
    return NextResponse.json({ error: 'Failed to fetch repositories.', details: error.message }, { status: 500 });
  }
}

// POST a new repository
export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !currentUser.permissionIds.includes('*') && !currentUser.permissionIds.includes('marketplace:manage_repositories')) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const validation = repositorySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input.', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const { name, url, api_key } = validation.data;
    const db = await getDb();

    // Check for duplicate URL
    const existing = await db.get('SELECT id FROM marketplace_repositories WHERE url = ?', url);
    if (existing) {
      return NextResponse.json({ error: 'A repository with this URL already exists.' }, { status: 409 });
    }

    const newRepo: Omit<MarketplaceRepository, 'lastCheckedAt'> = {
      id: crypto.randomUUID(),
      name,
      url,
      api_key: api_key || undefined,
      createdAt: new Date().toISOString(),
      addedByUserId: currentUser.id,
    };

    await db.run(
      'INSERT INTO marketplace_repositories (id, name, url, api_key, createdAt, addedByUserId) VALUES (?, ?, ?, ?, ?, ?)',
      newRepo.id, newRepo.name, newRepo.url, newRepo.api_key || null, newRepo.createdAt, newRepo.addedByUserId
    );

    return NextResponse.json(newRepo, { status: 201 });
  } catch (error: any) {
    console.error("API Error (POST /marketplace/repositories):", error);
    return NextResponse.json({ error: 'Failed to add repository.', details: error.message }, { status: 500 });
  }
}
