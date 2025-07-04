
import { NextResponse } from 'next/server';
import type { MarketplaceItem } from '@/lib/types';
import path from 'path';
import fs from 'fs/promises';

const MARKETPLACE_DIR = path.join(process.cwd(), 'data', 'marketplace');
const MARKETPLACE_FILE = path.join(MARKETPLACE_DIR, 'index.json');

interface Params {
  params: { itemId: string };
}

// Public endpoint to get full details of a single item
export async function GET(request: Request, { params }: Params) {
  const { itemId } = params;
  try {
    const fileContent = await fs.readFile(MARKETPLACE_FILE, 'utf-8');
    const items = JSON.parse(fileContent) as MarketplaceItem[];
    const item = items.find(i => i.id === itemId);

    if (item) {
      return NextResponse.json(item);
    } else {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return NextResponse.json({ error: 'Marketplace not found or empty' }, { status: 404 });
    }
    console.error(`Marketplace Item Fetch API Error for ID ${itemId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch marketplace item.' }, { status: 500 });
  }
}
