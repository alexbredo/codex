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
    
    // --- Pre-fetch all necessary data for efficient lookup ---
    const allModels: Model[] = await db.all('SELECT id, name, displayPropertyNames FROM models');
    for (const model of allModels) {
        try { model.displayPropertyNames = model.displayPropertyNames ? JSON.parse(model.displayPropertyNames as any) : []; } 
        catch { model.displayPropertyNames = []; }
        model.properties = await db.all('SELECT * FROM properties WHERE model_id = ?', model.id);
    }
    
    // FIX: Fetch all objects, including deleted ones, and get the isDeleted flag.
    const allObjectsRaw = await db.all('SELECT id, model_id, data, isDeleted FROM data_objects');
    const allObjectsMap: Record<string, DataObject[]> = {};
    const allDbObjectsMap = new Map<string, DataObject & {modelId: string}>();

    for(const row of allObjectsRaw) {
        if (!allObjectsMap[row.model_id]) { allObjectsMap[row.model_id] = []; }
        // FIX: Include isDeleted when parsing the object.
        const objData = { id: row.id, isDeleted: !!row.isDeleted, ...JSON.parse(row.data) };
        allObjectsMap[row.model_id].push(objData);
        allDbObjectsMap.set(row.id, { ...objData, modelId: row.model_id });
    }

    const batchObjectIdsSet = new Set(batchObjectIds);
    const batchObjects = batchObjectIds.map(id => allDbObjectsMap.get(id)).filter(Boolean) as (DataObject & { modelId: string })[];
    const allModelsMap = new Map(allModels.map(m => [m.id, m]));

    // 1. Find all potentially related objects first
    const uniqueRelationsMap = new Map<string, RelationInfo>();

    for (const targetObject of batchObjects) {
      const targetModel = allModelsMap.get(targetObject.modelId);
      if (!targetModel) continue;

      const targetObjectDisplay = getObjectDisplayValue(targetObject, targetModel, allModels, allObjectsMap);

      // Find Incoming Relationships to targetObject
      for (const model of allModels) {
        for (const prop of model.properties) {
          if (prop.type === 'relationship' && prop.relatedModelId === targetObject.modelId) {
            for (const obj of (allObjectsMap[model.id] || [])) {
              if (batchObjectIdsSet.has(obj.id)) continue;
              const propValue = obj[prop.name];
              const isLinked = (prop.relationshipType === 'many' && Array.isArray(propValue) && propValue.includes(targetObject.id)) || (typeof propValue === 'string' && propValue === targetObject.id);
              if (isLinked) {
                const existingRelation = uniqueRelationsMap.get(obj.id);
                const linkDetail = { sourceObjectId: targetObject.id, sourceObjectDisplay: targetObjectDisplay, propertyName: prop.name };
                if (existingRelation) {
                  existingRelation.linkedVia.push(linkDetail);
                } else {
                  uniqueRelationsMap.set(obj.id, {
                    objectId: obj.id, objectDisplayValue: getObjectDisplayValue(obj, model, allModels, allObjectsMap), modelId: model.id, modelName: model.name,
                    relationType: 'incoming', linkedVia: [linkDetail]
                  });
                }
              }
            }
          }
        }
      }

      // Find Outgoing Relationships from targetObject
      for (const prop of targetModel.properties) {
        if (prop.type === 'relationship' && prop.relatedModelId && targetObject[prop.name]) {
          const relatedIds = Array.isArray(targetObject[prop.name]) ? targetObject[prop.name] : [targetObject[prop.name]];
          const relatedModel = allModelsMap.get(prop.relatedModelId);
          if (relatedModel) {
            for (const relId of relatedIds) {
              if (batchObjectIdsSet.has(relId)) continue;
              const relatedObjectData = allDbObjectsMap.get(relId);
              if (relatedObjectData) {
                const existingRelation = uniqueRelationsMap.get(relatedObjectData.id);
                const linkDetail = { sourceObjectId: targetObject.id, sourceObjectDisplay: targetObjectDisplay, propertyName: prop.name };
                if (existingRelation) {
                    existingRelation.linkedVia.push(linkDetail);
                } else {
                    uniqueRelationsMap.set(relatedObjectData.id, {
                        objectId: relatedObjectData.id, objectDisplayValue: getObjectDisplayValue(relatedObjectData, relatedModel, allModels, allObjectsMap),
                        modelId: relatedModel.id, modelName: relatedModel.name,
                        relationType: 'outgoing', linkedVia: [linkDetail]
                    });
                }
              }
            }
          }
        }
      }
    }
    
    // Convert map to array for the response, without filtering for orphans
    const finalRelations = Array.from(uniqueRelationsMap.values());

    return NextResponse.json({ relations: finalRelations.sort((a,b) => a.objectDisplayValue.localeCompare(b.objectDisplayValue)) });

  } catch (error: any) {
    console.error(`API Error fetching batch dependencies:`, error);
    return NextResponse.json({ error: 'Failed to fetch object dependencies', details: error.message }, { status: 500 });
  }
}
