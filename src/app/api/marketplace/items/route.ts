

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
    // --- Start extensive logging for debugging ---
    console.log("--- Marketplace Items API (List) Request Received ---");
    console.log("Timestamp:", new Date().toISOString());
    console.log("Request URL:", request.url);
    const headersObject: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      // Avoid logging full cookie or auth tokens in production logs if possible
      if (key.toLowerCase() === 'cookie' || key.toLowerCase() === 'authorization') {
        headersObject[key] = `[Present, length=${value.length}]`;
      } else {
        headersObject[key] = value;
      }
    });
    console.log("Request Headers:", JSON.stringify(headersObject, null, 2));
    console.log("--- End Marketplace Items API (List) Logging ---");
    // --- End logging ---

    await fs.mkdir(MARKETPLACE_DIR, { recursive: true });
    const combinedItemsMap = new Map<string, MarketplaceItem>();

    // 1. Read remote items first, so they can be overridden by local
    try {
        const remoteFileContent = await fs.readFile(REMOTE_CACHE_FILE, 'utf-8');
        const remoteItems = JSON.parse(remoteFileContent) as MarketplaceItem[];
        remoteItems.forEach(item => {
            (item as any).source = 'remote';
            combinedItemsMap.set(item.id, item);
        });
    } catch (error: any) {
        if (error.code !== 'ENOENT') console.error("Error reading remote cache:", error);
    }

    // 2. Read legacy local items
    try {
      const localFileContent = await fs.readFile(LEGACY_MARKETPLACE_FILE, 'utf-8');
      const localItems = JSON.parse(localFileContent) as MarketplaceItem[];
      localItems.forEach(item => {
        (item as any).source = 'local';
        combinedItemsMap.set(item.id, item); // Will overwrite remote if ID conflicts
      });
    } catch (error: any) {
      if (error.code !== 'ENOENT') console.error("Error reading local legacy marketplace:", error);
    }

    // 3. Read new individual local item files (these have highest priority)
    const files = await fs.readdir(MARKETPLACE_DIR);
    for (const file of files) {
        if (file.endsWith('.json') && file !== 'index.json' && file !== 'remote_cache.json') {
            try {
                const filePath = path.join(MARKETPLACE_DIR, file);
                const fileContent = await fs.readFile(filePath, 'utf-8');
                const item = JSON.parse(fileContent) as MarketplaceItem;
                if (item.id) {
                    (item as any).source = 'local';
                    combinedItemsMap.set(item.id, item); // Will overwrite any previous entry
                }
            } catch (e) {
                console.error(`Failed to parse local marketplace item ${file}:`, e);
            }
        }
    }


    const finalItems = Array.from(combinedItemsMap.values());
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
        latestVersionPayload: payloadForList, // Send the potentially lighter payload
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
