

import { NextResponse } from 'next/server';
import type { MarketplaceItem, ExportedModelBundle, ExportedModelGroupBundle } from '@/lib/types';
import path from 'path';
import fs from 'fs/promises';

const MARKETPLACE_DIR = path.join(process.cwd(), 'data', 'marketplace');
const LEGACY_MARKETPLACE_FILE = path.join(MARKETPLACE_DIR, 'index.json');
const REMOTE_CACHE_FILE = path.join(MARKETPLACE_DIR, 'remote_cache.json');

// This is a public endpoint, no auth needed to browse.
export async function GET(request: Request) {
  try {
    await fs.mkdir(MARKETPLACE_DIR, { recursive: true });
    const itemsMap = new Map<string, MarketplaceItem>();

    // --- Step 1: Load all LOCAL items first to establish precedence. ---

    // Read from new individual .json files first, as they are the most current format.
    const files = await fs.readdir(MARKETPLACE_DIR).catch(() => []);
    for (const file of files) {
        if (file.endsWith('.json') && file !== 'index.json' && file !== 'remote_cache.json') {
            try {
                const filePath = path.join(MARKETPLACE_DIR, file);
                const fileContent = await fs.readFile(filePath, 'utf-8');
                const item = JSON.parse(fileContent) as MarketplaceItem;
                if (item.id) {
                    (item as any).source = 'local';
                    itemsMap.set(item.id, item);
                }
            } catch (e) {
                console.error(`Failed to parse local marketplace item ${file}:`, e);
            }
        }
    }
    
    // Read from legacy index.json and add if not already present from individual files.
    try {
        const legacyContent = await fs.readFile(LEGACY_MARKETPLACE_FILE, 'utf-8');
        const legacyItems = JSON.parse(legacyContent) as MarketplaceItem[];
        for (const item of legacyItems) {
            if (item.id && !itemsMap.has(item.id)) { // Only add if not already loaded from a dedicated file
                (item as any).source = 'local';
                itemsMap.set(item.id, item);
            }
        }
    } catch (error: any) {
        if (error.code !== 'ENOENT') {
            console.error('Error reading legacy marketplace index:', error);
        }
    }

    // --- Step 2: Read remote items and only add them if a local version doesn't exist. ---
    try {
        const remoteFileContent = await fs.readFile(REMOTE_CACHE_FILE, 'utf-8');
        const remoteItems = JSON.parse(remoteFileContent) as MarketplaceItem[];
        remoteItems.forEach(item => {
            if (item.id && !itemsMap.has(item.id)) { // The crucial check: Do not add if a local item with the same ID exists.
                // The `item` from the cache should already have `source` and `sourceRepository` from the sync process.
                itemsMap.set(item.id, item);
            }
        });
    } catch (error: any) {
        if (error.code !== 'ENOENT') console.error("Error reading remote cache:", error);
    }
    
    // --- Step 3: Prepare the final list for the frontend. ---
    const finalItems = Array.from(itemsMap.values());
    finalItems.sort((a, b) => a.name.localeCompare(b.name));

    // Return metadata and latest payload for the list view for efficiency
    const metadataWithPayload = finalItems.map(item => {
      const latestVersionDetails = item.versions.find(v => v.version === item.latestVersion);
      let payloadForList = latestVersionDetails?.payload || null;

      // For model groups, strip out the heavy dataObjects to keep the listing API light.
      if (item.type === 'model_group' && payloadForList) {
          const lightPayload: ExportedModelGroupBundle = {
              group: payloadForList.group,
              models: (payloadForList.models || []).map((modelBundle: ExportedModelBundle) => ({
                  model: modelBundle.model, // Keep the model structure
                  dataObjects: [], // <<< STRIP OUT THE DATA OBJECTS
              })),
          };
          payloadForList = lightPayload;
      }
      
      return {
        id: item.id,
        type: item.type,
        name: item.name,
        description: item.description,
        author: item.author,
        latestVersion: item.latestVersion,
        tags: item.tags,
        updatedAt: item.updatedAt,
        downloadCount: item.downloadCount || 0,
        latestVersionPayload: payloadForList,
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
