
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Model, DataObject, SharedObjectLink, PublicShareData } from '@/lib/types';
import { mapDbModelToClientModel } from '@/lib/utils';

// This route is public, so no auth check is performed.

interface Params {
  params: { linkId: string };
}

export async function GET(request: Request, { params }: Params) {
  const { linkId } = params;
  if (!linkId) {
    return NextResponse.json({ error: 'Link ID is required.' }, { status: 400 });
  }

  try {
    const db = await getDb();
    const link: SharedObjectLink | undefined = await db.get(
      'SELECT * FROM shared_object_links WHERE id = ?',
      linkId
    );

    if (!link) {
      return NextResponse.json({ error: 'Share link not found.' }, { status: 404 });
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This share link has expired.' }, { status: 410 }); // 410 Gone
    }

    const modelFromDb = await db.get('SELECT * FROM models WHERE id = ?', link.model_id);
    if (!modelFromDb) {
      return NextResponse.json({ error: 'Associated model not found.' }, { status: 404 });
    }
    const modelProperties = await db.all('SELECT * FROM properties WHERE model_id = ?', modelFromDb.id);
    const model = mapDbModelToClientModel({ ...modelFromDb, properties: modelProperties });

    let object: DataObject | undefined = undefined;
    if (link.data_object_id && (link.link_type === 'view' || link.link_type === 'update')) {
      const objectRow = await db.get('SELECT * FROM data_objects WHERE id = ? AND model_id = ?', link.data_object_id, link.model_id);
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
    }
    
    if (link.link_type !== 'create' && !object) {
        return NextResponse.json({ error: 'Data object is required for this link type but was not found.' }, { status: 404 });
    }

    const responseData: PublicShareData = {
      link,
      model,
      object,
    };

    return NextResponse.json(responseData);

  } catch (error: any) {
    console.error(`[API /public/share/${linkId}] GET Error:`, error);
    return NextResponse.json({ error: 'Failed to retrieve shared data due to a server error.', details: error.message }, { status: 500 });
  }
}
