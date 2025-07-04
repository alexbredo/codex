
'use server';

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import type { MarketplaceRepository, MarketplaceItem } from '@/lib/types';
import path from 'path';
import fs from 'fs/promises';
import axios from 'axios';

const MARKETPLACE_DIR = path.join(process.cwd(), 'data', 'marketplace');
const REMOTE_CACHE_FILE = path.join(MARKETPLACE_DIR, 'remote_cache.json');

export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !currentUser.permissionIds.includes('*') && !currentUser.permissionIds.includes('marketplace:manage_repositories')) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
  }

  // Create a dedicated, clean axios instance for outbound requests.
  // This prevents any implicit forwarding of headers (like cookies) from the
  // incoming Next.js request.
  const http = axios.create({
    headers: {
      'User-Agent': 'CodexStructure-Sync/1.0',
      'Accept': 'application/json',
    },
    // Explicitly disable credentials to ensure anonymous requests
    withCredentials: false,
  });

  try {
    const db = await getDb();
    const repositories: MarketplaceRepository[] = await db.all('SELECT * FROM marketplace_repositories');
    
    let allRemoteItems: MarketplaceItem[] = [];
    const errors: { name: string, error: string }[] = [];
    let successfulRepoCount = 0;

    for (const repo of repositories) {
      try {
        const listResponse = await http.get(repo.url);
        const itemsMetadata: { id: string }[] = listResponse.data;
        
        for (const meta of itemsMetadata) {
          try {
            const detailUrl = repo.url.endsWith('/') ? `${repo.url}${meta.id}` : `${repo.url}/${meta.id}`;
            const detailResponse = await http.get(detailUrl);

            const fullItem: MarketplaceItem = detailResponse.data;

            const itemWithSource = {
              ...fullItem,
              source: 'remote' as const,
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
        
        await db.run('UPDATE marketplace_repositories SET lastCheckedAt = ? WHERE id = ?', new Date().toISOString(), repo.id);
        successfulRepoCount++;

      } catch (error: any) {
        let errorMessage = error.message;
        if (axios.isAxiosError(error)) {
            errorMessage = `Failed to fetch from ${repo.name}: Status ${error.response?.status || 'Unknown'}`;
        }
        console.error(`Error syncing repository ${repo.name} (${repo.url}):`, errorMessage);
        errors.push({ name: repo.name, error: errorMessage });
      }
    }

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
