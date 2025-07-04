

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import type { MarketplaceItem, MarketplaceItemType, PublishToMarketplaceFormValues, ValidationRuleset, WorkflowWithDetails, ExportedModelGroupBundle, Model } from '@/lib/types';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import semver from 'semver';

const MARKETPLACE_DIR = path.join(process.cwd(), 'data', 'marketplace');
const LEGACY_MARKETPLACE_FILE = path.join(MARKETPLACE_DIR, 'index.json');

async function getAllLocalMarketplaceItems(): Promise<MarketplaceItem[]> {
  await fs.mkdir(MARKETPLACE_DIR, { recursive: true });
  const itemMap = new Map<string, MarketplaceItem>();

  // 1. Read from new individual .json files
  const files = await fs.readdir(MARKETPLACE_DIR);
  for (const file of files) {
    if (file.endsWith('.json') && file !== 'index.json' && file !== 'remote_cache.json') {
      try {
        const filePath = path.join(MARKETPLACE_DIR, file);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const item = JSON.parse(fileContent) as MarketplaceItem;
        if (item.id) {
          itemMap.set(item.id, item);
        }
      } catch (e) {
        console.error(`Failed to parse marketplace item ${file}:`, e);
      }
    }
  }
  
  // 2. Read from legacy index.json and add if not already present from individual files
  try {
    const legacyContent = await fs.readFile(LEGACY_MARKETPLACE_FILE, 'utf-8');
    const legacyItems = JSON.parse(legacyContent) as MarketplaceItem[];
    for (const item of legacyItems) {
      if (item.id && !itemMap.has(item.id)) {
        itemMap.set(item.id, item);
      }
    }
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.error('Error reading legacy marketplace index:', error);
    }
  }
  
  return Array.from(itemMap.values());
}

async function saveMarketplaceItemToFile(item: MarketplaceItem): Promise<void> {
  const filePath = path.join(MARKETPLACE_DIR, `${item.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(item, null, 2));
}


export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  const canPublish = currentUser?.permissionIds.includes('*') || currentUser?.permissionIds.includes('marketplace:manage_local');

  if (!currentUser || !canPublish) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { itemType, itemPayload, metadata }: { itemType: MarketplaceItemType, itemPayload: ValidationRuleset | WorkflowWithDetails | ExportedModelGroupBundle | Model, metadata: PublishToMarketplaceFormValues } = await request.json();

    const allLocalItems = await getAllLocalMarketplaceItems();
    
    // Find item by its content ID (e.g., the ID of the workflow or validation rule itself)
    const payloadId = ('group' in itemPayload) ? itemPayload.group.id : itemPayload.id;
    let existingItem: MarketplaceItem | undefined = undefined;

    for (const item of allLocalItems) {
        if (item.versions.some(v => (v.payload as any).id === payloadId)) {
            existingItem = item;
            break;
        }
    }
    
    const now = new Date().toISOString();
    
    if (existingItem) {
      // Update existing item
      if (semver.gte(existingItem.latestVersion, metadata.version)) {
        return NextResponse.json({ error: `Version ${metadata.version} is not greater than the latest version ${existingItem.latestVersion}.` }, { status: 400 });
      }
      if (existingItem.versions.some(v => v.version === metadata.version)) {
        return NextResponse.json({ error: `Version ${metadata.version} already exists for this item.` }, { status: 400 });
      }

      existingItem.name = metadata.name;
      existingItem.description = metadata.description;
      existingItem.author = metadata.author;
      existingItem.latestVersion = metadata.version;
      existingItem.updatedAt = now;
      existingItem.versions.push({
        version: metadata.version,
        changelog: metadata.changelog,
        publishedAt: now,
        payload: itemPayload,
      });
      existingItem.versions.sort((a,b) => semver.rcompare(a.version, b.version));
      
      await saveMarketplaceItemToFile(existingItem);

    } else {
      // Create new item
      const newItem: MarketplaceItem = {
        id: uuidv4(),
        type: itemType,
        name: metadata.name,
        description: metadata.description,
        author: metadata.author,
        latestVersion: metadata.version,
        createdAt: now,
        updatedAt: now,
        downloadCount: 0,
        versions: [{
          version: metadata.version,
          changelog: metadata.changelog,
          publishedAt: now,
          payload: itemPayload,
        }],
      };
      await saveMarketplaceItemToFile(newItem);
    }
    
    return NextResponse.json({ success: true, message: 'Item published successfully.' });
  } catch (error: any) {
    console.error("Marketplace Publish API Error:", error);
    return NextResponse.json({ error: 'Failed to publish item.', details: error.message }, { status: 500 });
  }
}
