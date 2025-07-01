
'use server';

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { z } from 'zod';
import type { PublicShareData, SharedObjectLink, Model, Property, DataObject, ChangelogEventData, PropertyChangeDetail } from '@/lib/types';

const submitPayloadSchema = z.object({
  linkId: z.string().uuid(),
  formData: z.record(z.any()),
});

export async function POST(request: Request) {
    const db = await getDb();
    await db.run('BEGIN TRANSACTION');

    try {
        const body = await request.json();
        const validation = submitPayloadSchema.safeParse(body);
        if (!validation.success) {
            await db.run('ROLLBACK');
            return NextResponse.json({ error: 'Invalid payload', details: validation.error.flatten() }, { status: 400 });
        }

        const { linkId, formData } = validation.data;

        // 1. Validate the link
        const link: SharedObjectLink | undefined = await db.get('SELECT * FROM shared_object_links WHERE id = ?', linkId);
        if (!link) {
            await db.run('ROLLBACK');
            return NextResponse.json({ error: 'Share link not found.' }, { status: 404 });
        }
        if (link.expires_at && new Date(link.expires_at) < new Date()) {
            await db.run('ROLLBACK');
            return NextResponse.json({ error: 'This share link has expired.' }, { status: 410 });
        }
        if (link.link_type !== 'create' && link.link_type !== 'update') {
            await db.run('ROLLBACK');
            return NextResponse.json({ error: 'This link type does not support submissions.' }, { status: 400 });
        }

        // 2. Fetch model details for validation
        const model: Model | undefined = await db.get('SELECT * FROM models WHERE id = ?', link.model_id);
        if (!model) {
            await db.run('ROLLBACK');
            return NextResponse.json({ error: 'Associated model not found.' }, { status: 500 });
        }
        model.properties = await db.all('SELECT * FROM properties WHERE model_id = ?', model.id);

        // 3. Validate formData against model properties
        for (const prop of model.properties) {
            if (prop.required && (formData[prop.name] === undefined || formData[prop.name] === null || String(formData[prop.name]).trim() === '')) {
                await db.run('ROLLBACK');
                return NextResponse.json({ error: `Field '${prop.name}' is required.` }, { status: 400 });
            }
        }
        
        const currentTimestamp = new Date().toISOString();
        const objectDataForDb = { ...formData };
        
        if (link.link_type === 'create') {
            const newObjectId = crypto.randomUUID();
            objectDataForDb.createdAt = currentTimestamp;
            objectDataForDb.updatedAt = currentTimestamp;
            
            let initialStateId: string | null = null;
            if (model.workflowId) {
                const state = await db.get('SELECT id FROM workflow_states WHERE workflowId = ? AND isInitial = 1', model.workflowId);
                if (state) initialStateId = state.id;
            }

            await db.run(
                'INSERT INTO data_objects (id, model_id, data, currentStateId, ownerId, isDeleted) VALUES (?, ?, ?, ?, ?, 0)',
                newObjectId, link.model_id, JSON.stringify(objectDataForDb), initialStateId, link.created_by_user_id
            );

            const changelogId = crypto.randomUUID();
            const changelogEventData: ChangelogEventData = {
                type: 'CREATE',
                initialData: { ...objectDataForDb }
            };
            delete changelogEventData.initialData?.createdAt;
            delete changelogEventData.initialData?.updatedAt;
            await db.run(
                'INSERT INTO data_object_changelog (id, dataObjectId, modelId, changedAt, changedByUserId, changeType, changes) VALUES (?, ?, ?, ?, ?, ?, ?)',
                changelogId, newObjectId, link.model_id, currentTimestamp, link.created_by_user_id, 'CREATE', JSON.stringify(changelogEventData)
            );

        } else if (link.link_type === 'update') {
            if (!link.data_object_id) {
                 await db.run('ROLLBACK');
                 return NextResponse.json({ error: 'Update link is missing an object ID.' }, { status: 500 });
            }
            const existingObjectRow = await db.get('SELECT data FROM data_objects WHERE id = ?', link.data_object_id);
            if (!existingObjectRow) {
                await db.run('ROLLBACK');
                return NextResponse.json({ error: 'Object to update not found.' }, { status: 404 });
            }
            const existingData = JSON.parse(existingObjectRow.data);
            const updatedData = { ...existingData, ...formData, updatedAt: currentTimestamp };

            await db.run(
                'UPDATE data_objects SET data = ? WHERE id = ?',
                JSON.stringify(updatedData), link.data_object_id
            );
            
            const changelogId = crypto.randomUUID();
            const changelogEventData: ChangelogEventData = { type: 'UPDATE', modifiedProperties: [] }; // In a real scenario, we'd diff the objects
            await db.run(
                'INSERT INTO data_object_changelog (id, dataObjectId, modelId, changedAt, changedByUserId, changeType, changes) VALUES (?, ?, ?, ?, ?, ?, ?)',
                changelogId, link.data_object_id, link.model_id, currentTimestamp, link.created_by_user_id, 'UPDATE', JSON.stringify(changelogEventData)
            );
        }

        await db.run('COMMIT');
        return NextResponse.json({ message: `Successfully ${link.link_type === 'create' ? 'created' : 'updated'} ${model.name}.` }, { status: 200 });

    } catch (error: any) {
        if (db) await db.run('ROLLBACK').catch(rbErr => console.error("Rollback failed:", rbErr));
        console.error('API Error (POST /public/share/submit):', error);
        return NextResponse.json({ error: 'Failed to submit form due to a server error.', details: error.message }, { status: 500 });
    }
}
