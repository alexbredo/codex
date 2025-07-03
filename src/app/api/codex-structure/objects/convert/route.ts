
'use server';

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import type { Model, Property, DataObject, ChangelogEventData } from '@/lib/types';
import { z } from 'zod';

const conversionPayloadSchema = z.object({
  sourceModelId: z.string().uuid(),
  targetModelId: z.string().uuid(),
  objectIds: z.array(z.string().uuid()).min(1),
  mappings: z.record(z.string().uuid(), z.string().uuid().nullable()), // targetPropId -> sourcePropId | null
  defaultValues: z.record(z.string().uuid(), z.any()), // targetPropId -> defaultValue
  deleteOriginals: z.boolean(),
});

export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || (!currentUser.permissionIds.includes('objects:convert') && !currentUser.permissionIds.includes('*'))) {
    return NextResponse.json({ error: 'Unauthorized: You do not have permission to convert objects.' }, { status: 403 });
  }

  const db = await getDb();
  await db.run('BEGIN TRANSACTION');

  try {
    const body = await request.json();
    const validation = conversionPayloadSchema.safeParse(body);
    if (!validation.success) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Invalid conversion payload.', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }
    const { sourceModelId, targetModelId, objectIds, mappings, defaultValues, deleteOriginals } = validation.data;
    const currentTimestamp = new Date().toISOString();

    const sourceModel = await db.get<Model>('SELECT * FROM models WHERE id = ?', sourceModelId);
    const targetModel = await db.get<Model>('SELECT * FROM models WHERE id = ?', targetModelId);
    if (!sourceModel || !targetModel) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Source or target model not found.' }, { status: 404 });
    }
    
    sourceModel.properties = await db.all('SELECT * FROM properties WHERE model_id = ?', sourceModelId);
    targetModel.properties = await db.all('SELECT * FROM properties WHERE model_id = ?', targetModelId);

    const convertedIds: { sourceId: string, newId: string }[] = [];
    const errors: string[] = [];

    for (const sourceObjectId of objectIds) {
      const sourceObject = await db.get<DataObject>('SELECT * FROM data_objects WHERE id = ?', sourceObjectId);
      if (!sourceObject || sourceObject.model_id !== sourceModelId) {
        errors.push(`Object with ID ${sourceObjectId} not found or does not belong to the source model.`);
        continue;
      }
      const sourceObjectData = JSON.parse(sourceObject.data);
      const newObjectData: Record<string, any> = {};

      for (const targetProp of targetModel.properties) {
        const sourcePropId = mappings[targetProp.id];
        
        if (sourcePropId !== undefined && sourcePropId !== null) { // Direct mapping
          const sourceProp = sourceModel.properties.find(p => p.id === sourcePropId);
          if (sourceProp) {
            newObjectData[targetProp.name] = sourceObjectData[sourceProp.name];
          }
        } else if (defaultValues.hasOwnProperty(targetProp.id)) { // Default value
          newObjectData[targetProp.name] = defaultValues[targetProp.id];
        } else { // Unmapped
          if (targetProp.required) {
            await db.run('ROLLBACK');
            return NextResponse.json({ error: `Conversion failed: Required property "${targetProp.name}" on target model "${targetModel.name}" was not mapped and has no default value.` }, { status: 400 });
          }
          // Set to null or a sensible default if not required
          newObjectData[targetProp.name] = null;
        }
      }

      // Create new object
      const newObjectId = crypto.randomUUID();
      const finalObjectData = {
        ...newObjectData,
        createdAt: currentTimestamp,
        updatedAt: currentTimestamp,
      };

      await db.run(
        'INSERT INTO data_objects (id, model_id, data, ownerId, isDeleted) VALUES (?, ?, ?, ?, 0)',
        newObjectId,
        targetModelId,
        JSON.stringify(finalObjectData),
        sourceObject.ownerId // Preserve owner
      );

      // Log creation
      const changelogId = crypto.randomUUID();
      const changelogEvent: ChangelogEventData = {
        type: 'CREATE',
        initialData: { ...finalObjectData },
        details: `Converted from object ${sourceObjectId} of model ${sourceModel.name}.`
      };
      await db.run('INSERT INTO data_object_changelog (id, dataObjectId, modelId, changedAt, changedByUserId, changeType, changes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        changelogId, newObjectId, targetModelId, currentTimestamp, currentUser.id, 'CREATE', JSON.stringify(changelogEvent));
      
      convertedIds.push({ sourceId: sourceObjectId, newId: newObjectId });

      if (deleteOriginals) {
        await db.run('UPDATE data_objects SET isDeleted = 1, deletedAt = ? WHERE id = ?', currentTimestamp, sourceObjectId);
        const deleteLogId = crypto.randomUUID();
        const deleteLogEvent: ChangelogEventData = {
          type: 'DELETE', status: 'deleted', timestamp: currentTimestamp,
          snapshot: sourceObjectData,
          details: `Deleted after converting to new object ${newObjectId} of model ${targetModel.name}.`
        };
        await db.run('INSERT INTO data_object_changelog (id, dataObjectId, modelId, changedAt, changedByUserId, changeType, changes) VALUES (?, ?, ?, ?, ?, ?, ?)',
            deleteLogId, sourceObjectId, sourceModelId, currentTimestamp, currentUser.id, 'DELETE', JSON.stringify(deleteLogEvent));
      }
    }

    await db.run('COMMIT');

    return NextResponse.json({
      message: `Successfully converted ${convertedIds.length} object(s).`,
      convertedCount: convertedIds.length,
      errors
    }, { status: 200 });

  } catch (error: any) {
    await db.run('ROLLBACK').catch(rbError => console.error("API Convert - Rollback failed:", rbError));
    console.error('API Convert Error:', error);
    return NextResponse.json({ error: 'Failed to convert objects due to a server error.', details: error.message }, { status: 500 });
  }
}
