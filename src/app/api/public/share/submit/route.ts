

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { SharedObjectLink, Model, Property, DataObject, ChangelogEventData, PropertyChangeDetail } from '@/lib/types';
import { z, ZodObject, ZodTypeAny } from 'zod';
import { createObjectFormSchema } from '@/components/objects/object-form-schema';
import crypto from 'crypto';

// Reusable handler to create a zod schema from model properties
function buildValidationSchema(model: Model): ZodObject<Record<string, ZodTypeAny>> {
  const shape: Record<string, ZodTypeAny> = {};
  model.properties.forEach((prop: Property) => {
    // This is a simplified validation for the public API.
    // For a more robust solution, reuse or adapt `createObjectFormSchema`.
    switch (prop.type) {
      case 'string':
      case 'markdown':
      case 'image':
      case 'url':
      case 'fileAttachment':
        shape[prop.name] = z.any(); // Allow flexible string/object inputs for these
        break;
      case 'number':
      case 'rating':
        shape[prop.name] = z.number().nullable().optional();
        break;
      case 'boolean':
        shape[prop.name] = z.boolean().nullable().optional();
        break;
      case 'date':
      case 'time':
      case 'datetime':
        shape[prop.name] = z.string().nullable().optional();
        break;
      case 'relationship':
        if (prop.relationshipType === 'many') {
          shape[prop.name] = z.array(z.string()).nullable().optional();
        } else {
          shape[prop.name] = z.string().nullable().optional();
        }
        break;
      default:
        shape[prop.name] = z.any();
    }
  });
  return z.object(shape);
}

const submitPayloadSchema = z.object({
  linkId: z.string().uuid(),
  formData: z.record(z.any()),
});

export async function POST(request: Request) {
  const db = await getDb();
  await db.run('BEGIN TRANSACTION');

  try {
    const body = await request.json();
    const payloadValidation = submitPayloadSchema.safeParse(body);
    if (!payloadValidation.success) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Invalid payload structure.', details: payloadValidation.error.flatten().fieldErrors }, { status: 400 });
    }
    const { linkId, formData } = payloadValidation.data;

    // 1. Fetch and validate the link
    const link: SharedObjectLink | undefined = await db.get(
      'SELECT * FROM shared_object_links WHERE id = ?',
      linkId
    );

    if (!link) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Share link not found.' }, { status: 404 });
    }
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'This share link has expired.' }, { status: 410 });
    }

    // 2. Fetch the associated model and properties
    const model: Model | undefined = await db.get('SELECT * FROM models WHERE id = ?', link.model_id);
    if (!model) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Associated model not found.' }, { status: 500 });
    }
    model.properties = await db.all('SELECT * FROM properties WHERE model_id = ?', model.id);
    
    // 3. Validate form data against model properties
    const modelValidationSchema = buildValidationSchema(model);
    const formDataValidation = modelValidationSchema.safeParse(formData);
    if (!formDataValidation.success) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Submitted data is invalid.', details: formDataValidation.error.flatten().fieldErrors }, { status: 400 });
    }
    const validatedData = formDataValidation.data;
    const currentTimestamp = new Date().toISOString();


    // 4. Perform create or update action
    if (link.link_type === 'create') {
        const newObjectId = crypto.randomUUID();
        const finalObjectData = { ...validatedData, createdAt: currentTimestamp, updatedAt: currentTimestamp };
        
        let finalCurrentStateId: string | null = null;
        if (model.workflowId) {
            const initialState = await db.get('SELECT id FROM workflow_states WHERE workflowId = ? AND isInitial = 1', model.workflowId);
            finalCurrentStateId = initialState?.id || null;
        }

        await db.run(
            'INSERT INTO data_objects (id, model_id, data, currentStateId, ownerId, isDeleted, deletedAt) VALUES (?, ?, ?, ?, ?, 0, NULL)',
            newObjectId, model.id, JSON.stringify(finalObjectData), finalCurrentStateId, null // Owner is null for public submissions
        );

        // Log data object creation
        const changelogId = crypto.randomUUID();
        const changelogEventData: ChangelogEventData = {
            type: 'CREATE',
            initialData: { ...finalObjectData },
            viaShareLinkId: link.id,
        };
        delete changelogEventData.initialData?.createdAt;
        delete changelogEventData.initialData?.updatedAt;
        
        await db.run(
            'INSERT INTO data_object_changelog (id, dataObjectId, modelId, changedAt, changedByUserId, changeType, changes) VALUES (?, ?, ?, ?, ?, ?, ?)',
            changelogId, newObjectId, model.id, currentTimestamp, null, 'CREATE', JSON.stringify(changelogEventData)
        );

    } else if (link.link_type === 'update' && link.data_object_id) {
        const objectId = link.data_object_id;
        const existingObjectRow = await db.get('SELECT data FROM data_objects WHERE id = ?', objectId);
        if (!existingObjectRow) {
            await db.run('ROLLBACK');
            return NextResponse.json({ error: 'Object to update not found.' }, { status: 404 });
        }
        
        const oldDataParsed = JSON.parse(existingObjectRow.data);
        const newData = { ...oldDataParsed, ...validatedData, updatedAt: currentTimestamp };
        
        await db.run('UPDATE data_objects SET data = ? WHERE id = ?', JSON.stringify(newData), objectId);
        
        const propertyChanges: PropertyChangeDetail[] = Object.keys(validatedData).map(key => ({
            propertyName: key,
            oldValue: oldDataParsed[key],
            newValue: validatedData[key],
        }));

        if (propertyChanges.length > 0) {
            const changelogId = crypto.randomUUID();
            const changelogEventData: ChangelogEventData = {
                type: 'UPDATE',
                modifiedProperties: propertyChanges,
                viaShareLinkId: link.id,
            };
            await db.run(
                'INSERT INTO data_object_changelog (id, dataObjectId, modelId, changedAt, changedByUserId, changeType, changes) VALUES (?, ?, ?, ?, ?, ?, ?)',
                changelogId, objectId, model.id, currentTimestamp, null, 'UPDATE', JSON.stringify(changelogEventData)
            );
        }

    } else {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: `Link type "${link.link_type}" is not a valid submission type or is missing required data.` }, { status: 400 });
    }

    // 5. Expire link if it's single-use
    if (link.expires_on_submit) {
      await db.run('DELETE FROM shared_object_links WHERE id = ?', linkId);
    }

    await db.run('COMMIT');

    return NextResponse.json({ message: `Your submission for "${model.name}" has been received. Thank you!` });

  } catch (error: any) {
    try {
      await db.run('ROLLBACK');
    } catch (rbError: any) {
        console.error("CRITICAL: Failed to rollback transaction in public submit API:", rbError.message);
    }
    console.error('[API /public/share/submit] Unhandled Error:', error);
    return NextResponse.json({ error: 'An unexpected server error occurred.', details: error.message }, { status: 500 });
  }
}
