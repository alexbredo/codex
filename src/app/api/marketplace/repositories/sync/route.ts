

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
    let successfulRepoCount = 0;

    for (const repo of repositories) {
      try {
        // FIX: Explicitly create a new Headers object to prevent any automatic
        // header forwarding (like Cookies) by Next.js during server-to-server fetch.
        const fetchHeaders = new Headers();
        fetchHeaders.append('User-Agent', 'CodexStructure-Sync/1.0');

        // Step 1: Fetch the list of item metadata from the repository URL
        const listResponse = await fetch(repo.url, {
          headers: fetchHeaders,
          cache: 'no-store', // Ensure we get fresh data
        });

        if (!listResponse.ok) {
          throw new Error(`Failed to fetch from ${repo.name}: Status ${listResponse.status}`);
        }
        const itemsMetadata: { id: string }[] = await listResponse.json();
        
        // Step 2: Fetch the full details for each item
        for (const meta of itemsMetadata) {
          try {
            const detailUrl = repo.url.endsWith('/') ? `${repo.url}${meta.id}` : `${repo.url}/${meta.id}`;
            const detailResponse = await fetch(detailUrl, {
                headers: fetchHeaders, // Reuse the clean headers for this request as well
                cache: 'no-store',
            });
            if (!detailResponse.ok) {
                console.warn(`Could not fetch details for item ${meta.id} from ${repo.name}. Status: ${detailResponse.status}`);
                continue; // Skip this item, but continue with the repo
            }
            const fullItem: MarketplaceItem = await detailResponse.json();

            const itemWithSource = {
              ...fullItem,
              source: 'remote' as const, // Ensure literal type
              sourceRepository: {
                name: repo.name,
                url: repo.url,
              },
            };
            allRemoteItems.push(itemWithSource);
          } catch (itemError: any) {
             console.error(`Error fetching detail for item ${meta.id} from ${repo.name}:`, itemError.message);
          }
        }
        
        // Step 3: Update last checked time for the repo if we successfully processed the list
        await db.run('UPDATE marketplace_repositories SET lastCheckedAt = ? WHERE id = ?', new Date().toISOString(), repo.id);
        successfulRepoCount++;

      } catch (error: any) {
        console.error(`Error syncing repository ${repo.name} (${repo.url}):`, error.message);
        errors.push({ name: repo.name, error: error.message });
      }
    }

    // Step 4: Write aggregated items to the remote cache file
    await fs.mkdir(MARKETPLACE_DIR, { recursive: true });
    await fs.writeFile(REMOTE_CACHE_FILE, JSON.stringify(allRemoteItems, null, 2));

    const message = `Sync process finished.`;
    return NextResponse.json({ 
        success: true, 
        message: message,
        syncedRepos: successfulRepoCount,
        totalItems: allRemoteItems.length,
        errors: errors,
    });
    
  } catch (error: any) {
    console.error("API Error (POST /marketplace/repositories/sync):", error);
    return NextResponse.json({ error: 'Failed to sync repositories.', details: error.message }, { status: 500 });
  }
}
