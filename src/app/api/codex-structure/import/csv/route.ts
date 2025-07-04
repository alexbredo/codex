
'use server';

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { z } from 'zod';
import type { Model, Property, DataObject, ChangelogEventData, ValidationRuleset } from '@/lib/types';
import { getObjectDisplayValue } from '@/lib/utils';

const importPayloadSchema = z.object({
  targetModelId: z.string().uuid(),
  dataToImport: z.array(z.record(z.string())),
  mappings: z.record(z.string()), // targetPropId -> sourceCsvHeader
  relationshipLookups: z.record(z.string()), // targetPropId -> lookupPropertyId
});

export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || (!currentUser.permissionIds.includes('models:import_export') && !currentUser.permissionIds.includes('*'))) {
    return NextResponse.json({ error: 'Unauthorized: You do not have permission to import data.' }, { status: 403 });
  }

  const db = await getDb();
  await db.run('BEGIN TRANSACTION');

  try {
    const body = await request.json();
    const validation = importPayloadSchema.safeParse(body);
    if (!validation.success) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Invalid import payload.', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const { targetModelId, dataToImport, mappings, relationshipLookups } = validation.data;
    const currentTimestamp = new Date().toISOString();
    
    const targetModel = await db.get<Model>('SELECT * FROM models WHERE id = ?', targetModelId);
    if (!targetModel) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Target model not found.' }, { status: 404 });
    }
    targetModel.properties = await db.all('SELECT * FROM properties WHERE model_id = ?', targetModelId);
    const validationRulesets: ValidationRuleset[] = await db.all('SELECT * FROM validation_rulesets');


    const errors: { row: number; field: string; message: string; value: any }[] = [];
    let successes = 0;

    for (const [index, csvRow] of dataToImport.entries()) {
      const newObjectData: Record<string, any> = {};
      let rowHasErrors = false;

      for (const targetProp of targetModel.properties) {
        const sourceCsvHeader = mappings[targetProp.id];
        let value = sourceCsvHeader ? csvRow[sourceCsvHeader] : undefined;
        
        if (value === undefined || value === null || String(value).trim() === '') {
          if (targetProp.required) {
            errors.push({ row: index + 2, field: targetProp.name, message: 'Required field is missing.', value: value });
            rowHasErrors = true;
          }
          continue; // Move to next property
        }
        
        // --- Type Coercion & Validation ---
        try {
            switch(targetProp.type) {
                case 'number':
                    const num = parseFloat(value);
                    if (isNaN(num)) throw new Error('is not a valid number.');
                    if (targetProp.minValue !== null && num < targetProp.minValue) throw new Error(`must be at least ${targetProp.minValue}.`);
                    if (targetProp.maxValue !== null && num > targetProp.maxValue) throw new Error(`must be no more than ${targetProp.maxValue}.`);
                    newObjectData[targetProp.name] = num;
                    break;
                case 'boolean': newObjectData[targetProp.name] = ['true', '1', 'yes'].includes(String(value).toLowerCase()); break;
                case 'date': newObjectData[targetProp.name] = new Date(value).toISOString().split('T')[0]; break;
                case 'rating':
                    const rating = parseInt(value, 10);
                    if (isNaN(rating) || rating < 0 || rating > 5) throw new Error('must be an integer between 0 and 5.');
                    newObjectData[targetProp.name] = rating;
                    break;
                case 'relationship':
                    const lookupPropertyId = relationshipLookups[targetProp.id];
                    if (!lookupPropertyId || !targetProp.relatedModelId) throw new Error('relationship lookup is misconfigured.');
                    const relatedModelProperties = await db.all<Property>('SELECT * FROM properties WHERE model_id = ?', targetProp.relatedModelId);
                    const lookupProperty = relatedModelProperties.find(p => p.id === lookupPropertyId);
                    if (!lookupProperty) throw new Error(`lookup property (ID: ${lookupPropertyId}) not found on related model.`);
                    
                    const relatedObject = await db.get(`SELECT id FROM data_objects WHERE model_id = ? AND json_extract(data, '$.${lookupProperty.name}') = ?`, targetProp.relatedModelId, value);
                    if (!relatedObject) throw new Error(`no related object found where '${lookupProperty.name}' is '${value}'.`);
                    newObjectData[targetProp.name] = relatedObject.id;
                    break;
                default: // string, markdown, etc.
                    if (targetProp.validationRulesetId) {
                        const ruleset = validationRulesets.find(rs => rs.id === targetProp.validationRulesetId);
                        if (ruleset && !new RegExp(ruleset.regexPattern).test(value)) {
                            throw new Error(`does not match the required format: ${ruleset.name}.`);
                        }
                    }
                    newObjectData[targetProp.name] = value;
                    break;
            }
        } catch (e: any) {
            errors.push({ row: index + 2, field: targetProp.name, message: e.message, value });
            rowHasErrors = true;
        }
      }

      if (rowHasErrors) continue; // Skip to next row if errors were found

      // --- Uniqueness Check (after all fields are populated) ---
      for (const prop of targetModel.properties) {
          if (prop.isUnique && newObjectData[prop.name]) {
              const existing = await db.get(`SELECT id FROM data_objects WHERE model_id = ? AND json_extract(data, '$.${prop.name}') = ?`, targetModelId, newObjectData[prop.name]);
              if (existing) {
                  errors.push({ row: index + 2, field: prop.name, message: 'Value must be unique, but it already exists.', value: newObjectData[prop.name] });
                  rowHasErrors = true;
                  break; // Stop checking this row
              }
          }
      }
      if (rowHasErrors) continue;
      
      // --- Create Object ---
      const newObjectId = crypto.randomUUID();
      const finalObjectData = { ...newObjectData, createdAt: currentTimestamp, updatedAt: currentTimestamp };
      await db.run('INSERT INTO data_objects (id, model_id, data, ownerId, isDeleted) VALUES (?, ?, ?, ?, 0)',
        newObjectId, targetModelId, JSON.stringify(finalObjectData), currentUser.id);

      const changelogEvent: ChangelogEventData = { type: 'CREATE', initialData: finalObjectData, details: 'Imported from CSV.' };
      await db.run('INSERT INTO data_object_changelog (id, dataObjectId, modelId, changedAt, changedByUserId, changeType, changes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        crypto.randomUUID(), newObjectId, targetModelId, currentTimestamp, currentUser.id, 'CREATE', JSON.stringify(changelogEvent));
      
      successes++;
    }

    if (errors.length > 0) {
      await db.run('ROLLBACK');
      return NextResponse.json({
        message: `Import failed due to ${errors.length} error(s). No objects were created.`,
        successCount: 0,
        errorCount: errors.length,
        errors,
      }, { status: 400 });
    }

    await db.run('COMMIT');

    return NextResponse.json({
      message: `Successfully imported ${successes} objects.`,
      successCount: successes,
      errorCount: 0,
      errors: [],
    });

  } catch (error: any) {
    await db.run('ROLLBACK').catch(rbError => console.error("API CSV Import - Rollback failed:", rbError));
    console.error('API CSV Import Error:', error);
    return NextResponse.json({ error: 'Failed to import data due to a server error.', details: error.message }, { status: 500 });
  }
}
