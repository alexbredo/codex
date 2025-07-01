
'use server';

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { PublicShareData, DataObject, ChangelogEventData } from '@/lib/types';
import { z } from 'zod';
import { createObjectFormSchema } from '@/components/objects/object-form-schema';

const submissionSchema = z.object({
  linkId: z.string().uuid(),
  formData: z.record(z.any()),
});

export async function POST(request: Request) {
  const db = await getDb();

  try {
    const body = await request.json();
    const submissionValidation = submissionSchema.safeParse(body);
    if (!submissionValidation.success) {
      return NextResponse.json({ error: 'Invalid submission format.', details: submissionValidation.error.flatten() }, { status: 400 });
    }

    const { linkId, formData } = submissionValidation.data;

    // 1. Validate the link
    const link: PublicShareData['link'] | undefined = await db.get(
      `SELECT * FROM shared_object_links WHERE id = ?`,
      linkId
    );

    if (!link) {
      return NextResponse.json({ error: 'Share link not found.' }, { status: 404 });
    }
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This share link has expired.' }, { status: 410 });
    }
    if (link.link_type === 'view') {
        return NextResponse.json({ error: 'This is a view-only link and cannot be used for submission.' }, { status: 403 });
    }

    // 2. Fetch model and validate form data
    const model = await db.get('SELECT * FROM models WHERE id = ?', link.model_id);
    if (!model) {
      return NextResponse.json({ error: `Could not find model associated with this link.` }, { status: 500 });
    }
    model.properties = await db.all('SELECT * FROM properties WHERE model_id = ?', model.id);
    const validationRulesets = await db.all('SELECT * FROM validation_rulesets');

    const formSchema = createObjectFormSchema(model, validationRulesets);
    const formValidation = formSchema.safeParse(formData);

    if (!formValidation.success) {
      return NextResponse.json({ error: 'Invalid form data.', details: formValidation.error.flatten() }, { status: 400 });
    }
    
    const validatedData = formValidation.data;
    const currentTimestamp = new Date().toISOString();

    // 3. Perform Create or Update operation
    await db.run('BEGIN TRANSACTION');
    let message = '';
    
    if (link.link_type === 'create') {
      const newObjectId = crypto.randomUUID();
      const objectToStore = {
        createdAt: currentTimestamp,
        updatedAt: currentTimestamp,
        ...validatedData
      };
      await db.run(
        'INSERT INTO data_objects (id, model_id, data, ownerId) VALUES (?, ?, ?, ?)',
        newObjectId, link.model_id, JSON.stringify(objectToStore), link.created_by_user_id
      );
      message = `${model.name} created successfully.`;

    } else if (link.link_type === 'update' && link.data_object_id) {
      const existingObject = await db.get('SELECT data FROM data_objects WHERE id = ?', link.data_object_id);
      if (!existingObject) {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: 'The object you are trying to update does not exist.' }, { status: 404 });
      }
      const existingDataParsed = JSON.parse(existingObject.data);
      const updatedData = { ...existingDataParsed, ...validatedData, updatedAt: currentTimestamp };
      
      await db.run(
        'UPDATE data_objects SET data = ? WHERE id = ?',
        JSON.stringify(updatedData), link.data_object_id
      );
      message = `${model.name} updated successfully.`;
    } else {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: 'Invalid link type or missing object ID for update.' }, { status: 400 });
    }
    
    await db.run('COMMIT');

    // 4. Invalidate the link if it's single-use
    if (link.expires_on_submit) {
      await db.run('DELETE FROM shared_object_links WHERE id = ?', linkId);
    }
    
    return NextResponse.json({ message });

  } catch (error: any) {
    await db.run('ROLLBACK').catch(rbError => console.error("Rollback failed:", rbError));
    console.error('[API /public/share/submit] Error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred during submission.', details: error.message }, { status: 500 });
  }
}
