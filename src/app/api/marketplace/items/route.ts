
import { NextResponse } from 'next/server';
import type { MarketplaceItem } from '@/lib/types';
import path from 'path';
import fs from 'fs/promises';

const MARKETPLACE_DIR = path.join(process.cwd(), 'data', 'marketplace');
const MARKETPLACE_FILE = path.join(MARKETPLACE_DIR, 'index.json');

// This is a public endpoint, no auth needed to browse.
export async function GET() {
  try {
    await fs.mkdir(MARKETPLACE_DIR, { recursive: true });
    const fileContent = await fs.readFile(MARKETPLACE_FILE, 'utf-8');
    const items = JSON.parse(fileContent) as MarketplaceItem[];
    // Return metadata and latest payload for the list view for efficiency
    const metadataWithPayload = items.map(item => {
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
      }
    });
    return NextResponse.json(metadataWithPayload);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, which is a valid state for an empty marketplace
      return NextResponse.json([]);
    }
    console.error("Marketplace List API Error:", error);
    return NextResponse.json({ error: 'Failed to fetch marketplace items.' }, { status: 500 });
  }
}
