
import { NextResponse } from 'next/server';
import type { MarketplaceItem } from '@/lib/types';
import path from 'path';
import fs from 'fs/promises';

const MARKETPLACE_DIR = path.join(process.cwd(), 'data', 'marketplace');
const LOCAL_MARKETPLACE_FILE = path.join(MARKETPLACE_DIR, 'index.json');
const REMOTE_CACHE_FILE = path.join(MARKETPLACE_DIR, 'remote_cache.json');

// This is a public endpoint, no auth needed to browse.
export async function GET() {
  try {
    await fs.mkdir(MARKETPLACE_DIR, { recursive: true });

    // 1. Read local items
    let localItems: MarketplaceItem[] = [];
    try {
      const localFileContent = await fs.readFile(LOCAL_MARKETPLACE_FILE, 'utf-8');
      localItems = JSON.parse(localFileContent) as MarketplaceItem[];
      localItems.forEach(item => (item as any).source = 'local');
    } catch (error: any) {
      if (error.code !== 'ENOENT') console.error("Error reading local marketplace:", error);
    }
    
    // 2. Read remote cached items
    let remoteItems: MarketplaceItem[] = [];
    try {
        const remoteFileContent = await fs.readFile(REMOTE_CACHE_FILE, 'utf-8');
        remoteItems = JSON.parse(remoteFileContent) as MarketplaceItem[];
        remoteItems.forEach(item => (item as any).source = 'remote');
    } catch (error: any) {
        if (error.code !== 'ENOENT') console.error("Error reading remote marketplace cache:", error);
    }
    
    // 3. Merge lists, giving local items precedence
    const combinedItemsMap = new Map<string, MarketplaceItem>();
    remoteItems.forEach(item => combinedItemsMap.set(item.id, item));
    localItems.forEach(item => combinedItemsMap.set(item.id, item));
    const finalItems = Array.from(combinedItemsMap.values());


    // Return metadata and latest payload for the list view for efficiency
    const metadataWithPayload = finalItems.map(item => {
      const latestVersionDetails = item.versions.find(v => v.version === item.latestVersion);
      
      return {
        id: item.id,
        type: item.type,
        name: item.name,
        description: item.description,
        author: item.author,
        latestVersion: item.latestVersion,
        tags: item.tags,
        updatedAt: item.updatedAt,
        latestVersionPayload: latestVersionDetails?.payload || null,
        source: (item as any).source,
        sourceRepositoryName: (item as any).sourceRepository?.name
      }
    });
    return NextResponse.json(metadataWithPayload);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // This is a valid state for an empty marketplace
      return NextResponse.json([]);
    }
    console.error("Marketplace List API Error:", error);
    return NextResponse.json({ error: 'Failed to fetch marketplace items.' }, { status: 500 });
  }
}

    