
'use server';

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import type { Model, DataObject } from '@/lib/types';
import { getObjectDisplayValue } from '@/lib/utils';
import { z } from 'zod';

export interface RelationInfo {
  objectId: string; // The ID of the related object
  objectDisplayValue: string; // The display name of the related object
  modelId: string; // The model ID of the related object
  modelName: string; // The model name of the related object
  relationType: 'incoming' | 'outgoing'; // How it's related to the batch
  linkedVia: { // Info about the link itself
    sourceObjectId: string; // Which object in the batch it's linked to
    sourceObjectDisplay: string;
    propertyName: string;
  }[];
}

const batchIdsSchema = z.object({
  objectIds: z.array(z.string().uuid()).min(1),
});

export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const validation = batchIdsSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
  }
  
  const { objectIds: batchObjectIds } = validation.data;

  try {
    const db = await getDb();
    
    // Pre-fetch all necessary data for efficient lookup
    const allModels: Model[] = await db.all('SELECT id, name, displayPropertyNames FROM models');
    for (const model of allModels) {
        try { model.displayPropertyNames = model.displayPropertyNames ? JSON.parse(model.displayPropertyNames as any) : []; } 
        catch { model.displayPropertyNames = []; }
        model.properties = await db.all('SELECT * FROM properties WHERE model_id = ?', model.id);
    }

    const allObjectsRaw = await db.all('SELECT id, model_id, data FROM data_objects WHERE isDeleted = 0 OR isDeleted IS NULL');
    const allObjectsMap: Record<string, DataObject[]> = {};
     for(const row of allObjectsRaw) {
        if (!allObjectsMap[row.model_id]) { allObjectsMap[row.model_id] = []; }
        allObjectsMap[row.model_id].push({ id: row.id, ...JSON.parse(row.data) });
    }

    const batchObjects = batchObjectIds.map(id => {
        for (const modelId in allObjectsMap) {
            const obj = allObjectsMap[modelId].find(o => o.id === id);
            if (obj) return { ...obj, modelId };
        }
        return null;
    }).filter(Boolean) as (DataObject & { modelId: string })[];

    const uniqueRelationsMap = new Map<string, RelationInfo>();

    for (const targetObject of batchObjects) {
        const targetModel = allModels.find(m => m.id === targetObject.modelId);
        if (!targetModel) continue;

        const targetObjectDisplay = getObjectDisplayValue(targetObject, targetModel, allModels, allObjectsMap);

        // --- Find Incoming Relationships ---
        for (const model of allModels) {
            const relationshipProperties = model.properties.filter(p => p.type === 'relationship' && p.relatedModelId === targetObject.modelId);
            for (const prop of relationshipProperties) {
                for (const obj of (allObjectsMap[model.id] || [])) {
                    if (batchObjectIds.includes(obj.id)) continue; // Don't show relations between items in the batch
                    const propValue = obj[prop.name];
                    const isLinked = (prop.relationshipType === 'many' && Array.isArray(propValue) && propValue.includes(targetObject.id)) || (typeof propValue === 'string' && propValue === targetObject.id);
                    if (isLinked) {
                        const existingRelation = uniqueRelationsMap.get(obj.id);
                        if (existingRelation) {
                            existingRelation.linkedVia.push({ sourceObjectId: targetObject.id, sourceObjectDisplay: targetObjectDisplay, propertyName: prop.name });
                        } else {
                            uniqueRelationsMap.set(obj.id, {
                                objectId: obj.id, objectDisplayValue: getObjectDisplayValue(obj, model, allModels, allObjectsMap), modelId: model.id, modelName: model.name,
                                relationType: 'incoming',
                                linkedVia: [{ sourceObjectId: targetObject.id, sourceObjectDisplay: targetObjectDisplay, propertyName: prop.name }]
                            });
                        }
                    }
                }
            }
        }

        // --- Find Outgoing Relationships ---
        for (const prop of targetModel.properties) {
            if (prop.type === 'relationship' && prop.relatedModelId && targetObject[prop.name]) {
                const relatedIds = Array.isArray(targetObject[prop.name]) ? targetObject[prop.name] : [targetObject[prop.name]];
                const relatedModel = allModels.find(m => m.id === prop.relatedModelId);
                if (relatedModel) {
                    for (const relId of relatedIds) {
                        if (batchObjectIds.includes(relId)) continue; // Don't show relations between items in the batch
                        const relatedObjectData = (allObjectsMap[relatedModel.id] || []).find(o => o.id === relId);
                        if (relatedObjectData) {
                             const existingRelation = uniqueRelationsMap.get(relatedObjectData.id);
                            if (existingRelation) {
                                existingRelation.linkedVia.push({ sourceObjectId: targetObject.id, sourceObjectDisplay: targetObjectDisplay, propertyName: prop.name });
                            } else {
                                uniqueRelationsMap.set(relatedObjectData.id, {
                                    objectId: relatedObjectData.id, objectDisplayValue: getObjectDisplayValue(relatedObjectData, relatedModel, allModels, allObjectsMap),
                                    modelId: relatedModel.id, modelName: relatedModel.name,
                                    relationType: 'outgoing',
                                    linkedVia: [{ sourceObjectId: targetObject.id, sourceObjectDisplay: targetObjectDisplay, propertyName: prop.name }]
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    const relations = Array.from(uniqueRelationsMap.values());
    return NextResponse.json({ relations });

  } catch (error: any) {
    console.error(`API Error fetching batch dependencies:`, error);
    return NextResponse.json({ error: 'Failed to fetch object dependencies', details: error.message }, { status: 500 });
  }
}
