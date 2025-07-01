
'use server';

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { PublicShareData, DataObject } from '@/lib/types';
import { mapDbModelToClientModel } from '@/lib/utils'; // Correct import path

interface Params {
  params: { linkId: string };
}

// GET a share link's data
export async function GET(request: Request, { params }: Params) {
  const { linkId } = params;

  if (!linkId) {
    return NextResponse.json({ error: 'Share link ID is missing.' }, { status: 400 });
  }

  try {
    const db = await getDb();

    // 1. Fetch the link
    const link = await db.get('SELECT * FROM shared_object_links WHERE id = ?', linkId);

    if (!link) {
      return NextResponse.json({ error: 'Share link not found.' }, { status: 404 });
    }

    // 2. Check for expiration
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This share link has expired.' }, { status: 410 }); // 410 Gone
    }

    // 3. Fetch the associated model
    const modelRow = await db.get('SELECT * FROM models WHERE id = ?', link.model_id);
    if (!modelRow) {
      return NextResponse.json({ error: 'The data model associated with this link could not be found.' }, { status: 404 });
    }
    const modelProperties = await db.all('SELECT * FROM properties WHERE model_id = ? ORDER BY orderIndex ASC', modelRow.id);
    const model = mapDbModelToClientModel({ ...modelRow, properties: modelProperties });

    // 4. Fetch the object if it's a view or update link
    let objectData: DataObject | undefined = undefined;
    if ((link.link_type === 'view' || link.link_type === 'update') && link.data_object_id) {
      const objectRow = await db.get('SELECT * FROM data_objects WHERE id = ? AND model_id = ? AND (isDeleted = 0 OR isDeleted IS NULL)', link.data_object_id, link.model_id);
      if (!objectRow) {
        return NextResponse.json({ error: 'The data object associated with this link is not available.' }, { status: 404 });
      }
      objectData = {
        id: objectRow.id,
        currentStateId: objectRow.currentStateId,
        ownerId: objectRow.ownerId,
        ...JSON.parse(objectRow.data),
      };
    } else if ((link.link_type === 'view' || link.link_type === 'update') && !link.data_object_id) {
       return NextResponse.json({ error: 'This share link is misconfigured and does not point to a valid object.' }, { status: 500 });
    }


    const responsePayload: PublicShareData = {
      link,
      model,
      object: objectData,
    };

    return NextResponse.json(responsePayload);

  } catch (error: any) {
    console.error(`[API PUBLIC] Failed to fetch share link ${linkId}:`, error);
    // Be careful not to leak detailed error messages to the public
    return NextResponse.json({ error: 'An unexpected error occurred while trying to load the shared content.' }, { status: 500 });
  }
}
