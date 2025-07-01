
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { PublicShareData, SharedObjectLink, Model, DataObject } from '@/lib/types';
import { mapDbModelToClientModel } from '@/lib/utils'; // Correct import

interface Params {
  params: { linkId: string };
}

export async function GET(request: Request, { params }: Params) {
  const { linkId } = params;

  if (!linkId) {
    return NextResponse.json({ error: 'Share link ID is missing.' }, { status: 400 });
  }

  try {
    const db = await getDb();

    // 1. Fetch the share link
    const link: SharedObjectLink | undefined = await db.get(
      'SELECT * FROM shared_object_links WHERE id = ?',
      linkId
    );

    if (!link) {
      return NextResponse.json({ error: 'Share link not found.' }, { status: 404 });
    }

    // 2. Check for expiration
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This share link has expired.' }, { status: 410 });
    }

    // 3. Fetch the associated model
    const modelRow = await db.get('SELECT * FROM models WHERE id = ?', link.model_id);
    if (!modelRow) {
      return NextResponse.json({ error: 'Associated model not found.' }, { status: 404 });
    }
    const modelProperties = await db.all('SELECT * FROM properties WHERE model_id = ?', link.model_id);
    modelRow.properties = modelProperties;
    const model = mapDbModelToClientModel(modelRow);


    let object: DataObject | undefined = undefined;

    // 4. If it's a view or update link, fetch the associated object
    if ((link.link_type === 'view' || link.link_type === 'update') && link.data_object_id) {
      const objectRow = await db.get('SELECT * FROM data_objects WHERE id = ?', link.data_object_id);
      if (!objectRow) {
        return NextResponse.json({ error: 'Associated data object not found.' }, { status: 404 });
      }
      if (objectRow.isDeleted) {
        return NextResponse.json({ error: 'The shared object has been deleted.' }, { status: 410 });
      }
      object = {
        id: objectRow.id,
        currentStateId: objectRow.currentStateId,
        ownerId: objectRow.ownerId,
        isDeleted: !!objectRow.isDeleted,
        deletedAt: objectRow.deletedAt,
        ...JSON.parse(objectRow.data),
      };
    } else if ((link.link_type === 'view' || link.link_type === 'update') && !link.data_object_id) {
        return NextResponse.json({ error: 'Link is for a specific object, but no object ID was provided.' }, { status: 500 });
    }
    
    const responsePayload: PublicShareData = {
      link: link,
      model: model,
      object: object,
    };

    return NextResponse.json(responsePayload);

  } catch (error: any) {
    console.error(`[API /public/share/${linkId}] Error fetching shared data:`, error);
    return NextResponse.json({ error: 'Failed to fetch shared data', details: error.message }, { status: 500 });
  }
}
