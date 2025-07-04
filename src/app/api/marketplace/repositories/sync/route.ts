
'use server';

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import type { MarketplaceRepository, MarketplaceItem } from '@/lib/types';
import path from 'path';
import fs from 'fs/promises';

const MARKETPLACE_DIR = path.join(process.cwd(), 'data', 'marketplace');
const REMOTE_CACHE_FILE = path.join(MARKETPLACE_DIR, 'remote_cache.json');

export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !currentUser.permissionIds.includes('*') && !currentUser.permissionIds.includes('marketplace:manage_repositories')) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
  }

  try {
    const db = await getDb();
    const repositories: MarketplaceRepository[] = await db.all('SELECT * FROM marketplace_repositories');
    
    let allRemoteItems: MarketplaceItem[] = [];
    const errors: { name: string, error: string }[] = [];

    for (const repo of repositories) {
      try {
        const response = await fetch(repo.url, {
          signal: AbortSignal.timeout(10000), // 10-second timeout
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch from ${repo.name}: Status ${response.status}`);
        }
        const items: MarketplaceItem[] = await response.json();
        
        // Add source information to each item
        const itemsWithSource = items.map(item => ({
          ...item,
          source: 'remote',
          sourceRepository: {
            name: repo.name,
            url: repo.url,
          },
        }));

        allRemoteItems.push(...itemsWithSource);
        
        // Update last checked time on success
        await db.run('UPDATE marketplace_repositories SET lastCheckedAt = ? WHERE id = ?', new Date().toISOString(), repo.id);

      } catch (error: any) {
        console.error(`Error syncing repository ${repo.name} (${repo.url}):`, error.message);
        errors.push({ name: repo.name, error: error.message });
      }
    }

    // Write aggregated items to the remote cache file
    await fs.mkdir(MARKETPLACE_DIR, { recursive: true });
    await fs.writeFile(REMOTE_CACHE_FILE, JSON.stringify(allRemoteItems, null, 2));

    const message = `Sync complete. Found ${allRemoteItems.length} items across ${repositories.length - errors.length} repositories.`;
    return NextResponse.json({ 
        success: true, 
        message: message,
        syncedRepos: repositories.length - errors.length,
        totalItems: allRemoteItems.length,
        errors: errors,
    });
    
  } catch (error: any) {
    console.error("API Error (POST /marketplace/repositories/sync):", error);
    return NextResponse.json({ error: 'Failed to sync repositories.', details: error.message }, { status: 500 });
  }
}

    