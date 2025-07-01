
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { PublicShareData, SharedObjectLink } from '@/lib/types';
import { mapDbModelToClientModel } from '@/lib/utils'; // Correct import from shared utils

interface Params {
  params: { linkId: string };
}

// Public GET endpoint to fetch data for a share link
export async function GET(request: Request, { params }: Params) {
  const { linkId } = params;
  
  if (!linkId) {
    return NextResponse.json({ error: 'Share link ID is required.' }, { status: 400 });
  }

  try {
    const db = await getDb();
    const link: SharedObjectLink | undefined = await db.get('SELECT * FROM shared_object_links WHERE id = ?', linkId);

    if (!link) {
      return NextResponse.json({ error: 'Share link not found.' }, { status: 404 });
    }

    // Check for expiration
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This share link has expired.' }, { status: 410 }); // 410 Gone
    }

    // Fetch the model structure
    const modelRow = await db.get('SELECT * FROM models WHERE id = ?', link.model_id);
    if (!modelRow) {
      return NextResponse.json({ error: 'The associated data model could not be found.' }, { status: 404 });
    }
    const propertiesFromDb = await db.all('SELECT * FROM properties WHERE model_id = ? ORDER BY orderIndex ASC', link.model_id);
    const model = mapDbModelToClientModel({ ...modelRow, properties: propertiesFromDb });


    let objectData = null;
    if ((link.link_type === 'view' || link.link_type === 'update') && link.data_object_id) {
      const objectRow = await db.get('SELECT * FROM data_objects WHERE id = ? AND (isDeleted = 0 OR isDeleted IS NULL)', link.data_object_id);
      if (!objectRow) {
        return NextResponse.json({ error: 'The shared data object could not be found or has been deleted.' }, { status: 404 });
      }
      objectData = {
        id: objectRow.id,
        currentStateId: objectRow.currentStateId,
        ownerId: objectRow.ownerId,
        ...JSON.parse(objectRow.data),
      };
    }
    
    const responsePayload: PublicShareData = {
      link,
      model,
      object: objectData,
    };
    
    return NextResponse.json(responsePayload);

  } catch (error: any) {
    console.error(`API Error (GET /public/share/${linkId}):`, error.message, { stack: error.stack });
    return NextResponse.json({ error: 'Failed to fetch shared data', details: error.message }, { status: 500 });
  }
}
