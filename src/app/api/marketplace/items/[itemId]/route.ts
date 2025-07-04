

import { NextResponse } from 'next/server';
import type { MarketplaceItem } from '@/lib/types';
import path from 'path';
import fs from 'fs/promises';
import { getCurrentUserFromCookie } from '@/lib/auth';

const MARKETPLACE_DIR = path.join(process.cwd(), 'data', 'marketplace');
const LEGACY_MARKETPLACE_FILE = path.join(MARKETPLACE_DIR, 'index.json');

interface Params {
  params: { itemId: string };
}

// Public endpoint to get full details of a single item
export async function GET(request: Request, { params }: Params) {
  const { itemId } = params;
  try {
    const itemFilePath = path.join(MARKETPLACE_DIR, `${itemId}.json`);
    try {
      // First, try to read the individual file
      const fileContent = await fs.readFile(itemFilePath, 'utf-8');
      const item = JSON.parse(fileContent);
      return NextResponse.json(item);
    } catch (fileError: any) {
      if (fileError.code === 'ENOENT') {
        // If individual file doesn't exist, fall back to legacy index.json
        const indexFileContent = await fs.readFile(LEGACY_MARKETPLACE_FILE, 'utf-8');
        const items = JSON.parse(indexFileContent) as MarketplaceItem[];
        const item = items.find(i => i.id === itemId);
        if (item) {
          return NextResponse.json(item);
        }
      } else {
        // Another error occurred while reading the individual file
        throw fileError;
      }
    }

    return NextResponse.json({ error: 'Item not found' }, { status: 404 });

  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return NextResponse.json({ error: 'Marketplace not found or empty' }, { status: 404 });
    }
    console.error(`Marketplace Item Fetch API Error for ID ${itemId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch marketplace item.' }, { status: 500 });
  }
}


// DELETE a local marketplace item
export async function DELETE(request: Request, { params }: { params: { itemId: string } }) {
  const currentUser = await getCurrentUserFromCookie();
  const canManage = currentUser?.permissionIds.includes('*') || currentUser?.permissionIds.includes('marketplace:manage_local');

  if (!currentUser || !canManage) {
    return NextResponse.json({ error: 'Unauthorized to delete local marketplace items.' }, { status: 403 });
  }

  const { itemId } = params;
  try {
    const itemFilePath = path.join(MARKETPLACE_DIR, `${itemId}.json`);

    // Check if file exists before trying to delete
    await fs.access(itemFilePath);

    await fs.unlink(itemFilePath);
    
    return NextResponse.json({ message: 'Marketplace item deleted successfully.' });

  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return NextResponse.json({ error: 'Item not found in local marketplace.' }, { status: 404 });
    }
    console.error(`Marketplace Item Delete API Error for ID ${itemId}:`, error);
    return NextResponse.json({ error: 'Failed to delete marketplace item.' }, { status: 500 });
  }
}
