 'use server';

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: { modelId: string } }
) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { modelId } = params;

  try {
    const db = await getDb();
    const dataObjects = await db.all(
      'SELECT * FROM data_objects WHERE model_id = ?',
      modelId
    );

    return NextResponse.json(dataObjects);
  } catch (error: any) {
    console.error('API Error (GET /data-weaver/models/[modelId]/objects/all):', error);
    return NextResponse.json({ error: 'Failed to fetch data objects', details: error.message }, { status: 500 });
  }
}
