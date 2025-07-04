

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
     // --- Start extensive logging for debugging ---
    console.log(`--- Marketplace Item Detail API (GET /items/${itemId}) Request Received ---`);
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
    console.log("--- End Marketplace Item Detail API (GET) Logging ---");
    // --- End logging ---

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
  let fileDeleted = false;
  let indexUpdated = false;

  try {
    // Attempt to delete individual file
    const itemFilePath = path.join(MARKETPLACE_DIR, `${itemId}.json`);
    try {
      await fs.unlink(itemFilePath);
      fileDeleted = true;
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    // Attempt to remove from legacy index.json
    try {
      const indexFileContent = await fs.readFile(LEGACY_MARKETPLACE_FILE, 'utf-8');
      const items = JSON.parse(indexFileContent) as MarketplaceItem[];
      const initialLength = items.length;
      const updatedItems = items.filter(i => i.id !== itemId);
      
      if (updatedItems.length < initialLength) {
        await fs.writeFile(LEGACY_MARKETPLACE_FILE, JSON.stringify(updatedItems, null, 2));
        indexUpdated = true;
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    if (fileDeleted || indexUpdated) {
        return NextResponse.json({ message: 'Marketplace item deleted successfully.' });
    } else {
        return NextResponse.json({ error: 'Item not found in local marketplace.' }, { status: 404 });
    }

  } catch (error: any) {
    console.error(`Marketplace Item Delete API Error for ID ${itemId}:`, error);
    return NextResponse.json({ error: 'Failed to delete marketplace item.' }, { status: 500 });
  }
}
