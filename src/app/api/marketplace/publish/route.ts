
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import type { MarketplaceItem, PublishToMarketplaceFormValues, ValidationRuleset } from '@/lib/types';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import semver from 'semver';

const MARKETPLACE_DIR = path.join(process.cwd(), 'data', 'marketplace');
const MARKETPLACE_FILE = path.join(MARKETPLACE_DIR, 'index.json');

async function getLocalMarketplace(): Promise<MarketplaceItem[]> {
  try {
    await fs.mkdir(MARKETPLACE_DIR, { recursive: true });
    const fileContent = await fs.readFile(MARKETPLACE_FILE, 'utf-8');
    return JSON.parse(fileContent) as MarketplaceItem[];
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return []; // File doesn't exist, return empty array
    }
    throw error;
  }
}

async function saveLocalMarketplace(items: MarketplaceItem[]): Promise<void> {
  await fs.writeFile(MARKETPLACE_FILE, JSON.stringify(items, null, 2));
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  const canPublish = currentUser?.permissionIds.includes('*') || currentUser?.permissionIds.includes('marketplace:manage_local');

  if (!currentUser || !canPublish) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { itemType, itemPayload, metadata }: { itemType: 'validation_rule', itemPayload: ValidationRuleset, metadata: PublishToMarketplaceFormValues } = await request.json();

    const marketplaceItems = await getLocalMarketplace();
    const existingItemIndex = marketplaceItems.findIndex(item => item.versions.some(v => (v.payload as ValidationRuleset).id === itemPayload.id));
    
    const now = new Date().toISOString();
    
    if (existingItemIndex !== -1) {
      // Update existing item
      const existingItem = marketplaceItems[existingItemIndex];
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
        versions: [{
          version: metadata.version,
          changelog: metadata.changelog,
          publishedAt: now,
          payload: itemPayload,
        }],
      };
      marketplaceItems.push(newItem);
    }

    await saveLocalMarketplace(marketplaceItems);
    
    return NextResponse.json({ success: true, message: 'Item published successfully.' });
  } catch (error: any) {
    console.error("Marketplace Publish API Error:", error);
    return NextResponse.json({ error: 'Failed to publish item.', details: error.message }, { status: 500 });
  }
}
