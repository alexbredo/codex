
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { DataObject, Property, SharedObjectLink } from '@/lib/types';
import { z } from 'zod';
import { createObjectFormSchema } from '@/components/objects/object-form-schema';

const submitSchema = z.object({
  linkId: z.string().uuid(),
  formData: z.record(z.any()),
});

// This is a simplified validation function. A real implementation would be more robust.
// For now, it just ensures required fields are present.
async function validateFormData(db: any, modelId: string, formData: Record<string, any>): Promise<{ valid: boolean, errors: Record<string, string> }> {
    const modelProperties: Property[] = await db.all('SELECT * FROM properties WHERE model_id = ?', modelId);
    const validationRulesets = await db.all('SELECT * FROM validation_rulesets');
    const dynamicSchema = createObjectFormSchema({ properties: modelProperties } as any, validationRulesets);
    const result = dynamicSchema.safeParse(formData);

    if (result.success) {
        return { valid: true, errors: {} };
    }

    const errors = result.error.flatten().fieldErrors;
    return { valid: false, errors: errors as Record<string, string> };
}

// Public POST endpoint for form submissions
export async function POST(request: Request) {
  try {
    const db = await getDb();
    const body = await request.json();
    const validation = submitSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid submission format', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const { linkId, formData } = validation.data;

    const link: SharedObjectLink | undefined = await db.get('SELECT * FROM shared_object_links WHERE id = ?', linkId);
    if (!link) {
      return NextResponse.json({ error: 'Invalid share link.' }, { status: 404 });
    }
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This share link has expired.' }, { status: 410 });
    }
    if (link.link_type !== 'create' && link.link_type !== 'update') {
      return NextResponse.json({ error: 'This share link does not accept submissions.' }, { status: 403 });
    }

    // Validate the submitted data against the model's schema
    const { valid, errors } = await validateFormData(db, link.model_id, formData);
    if (!valid) {
        return NextResponse.json({ error: 'Validation failed', fieldErrors: errors }, { status: 400 });
    }

    const currentTimestamp = new Date().toISOString();

    if (link.link_type === 'create') {
      const newObjectId = crypto.randomUUID();
      const objectDataToStore = { ...formData, createdAt: currentTimestamp, updatedAt: currentTimestamp };
      
      // Note: We are not setting an ownerId or currentStateId for public submissions for now.
      await db.run(
        'INSERT INTO data_objects (id, model_id, data, isDeleted) VALUES (?, ?, ?, 0)',
        newObjectId, link.model_id, JSON.stringify(objectDataToStore)
      );

      return NextResponse.json({ message: 'Submission successful! Your new entry has been created.', objectId: newObjectId }, { status: 201 });
    }

    if (link.link_type === 'update' && link.data_object_id) {
      const existingObjectRow = await db.get('SELECT data FROM data_objects WHERE id = ?', link.data_object_id);
      if (!existingObjectRow) {
        return NextResponse.json({ error: 'The object you are trying to update does not exist.' }, { status: 404 });
      }

      const existingData = JSON.parse(existingObjectRow.data);
      const updatedData = { ...existingData, ...formData, updatedAt: currentTimestamp };

      await db.run('UPDATE data_objects SET data = ? WHERE id = ?', JSON.stringify(updatedData), link.data_object_id);
      
      return NextResponse.json({ message: 'Update successful! Your changes have been saved.' }, { status: 200 });
    }

    // Should not be reached
    return NextResponse.json({ error: 'An unexpected error occurred during submission.' }, { status: 500 });

  } catch (error: any) {
    console.error('API Error (POST /public/share/submit):', error);
    return NextResponse.json({ error: 'Failed to process submission', details: error.message }, { status: 500 });
  }
}
