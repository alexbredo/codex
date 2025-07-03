
'use server';

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import type { Model, DataObject } from '@/lib/types';
import { getObjectDisplayValue } from '@/lib/utils';

export interface RelationInfo {
  objectId: string;
  objectDisplayValue: string;
  modelId: string;
  modelName: string;
  viaPropertyName: string;
}

export interface DependencyCheckResult {
  incoming: RelationInfo[];
  outgoing: RelationInfo[];
}

export async function GET(request: Request, { params }: { params: { objectId: string } }) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { objectId } = params;

  try {
    const db = await getDb();
    
    const targetObjectRaw = await db.get('SELECT id, model_id, data FROM data_objects WHERE id = ?', objectId);
    if (!targetObjectRaw) {
        return NextResponse.json({ error: 'Object to check not found' }, { status: 404 });
    }
    const targetObject = { id: targetObjectRaw.id, modelId: targetObjectRaw.model_id, ...JSON.parse(targetObjectRaw.data) };
    const targetModelId = targetObject.modelId;

    // --- Permission Check ---
    if (!currentUser.permissionIds.includes('*') && !currentUser.permissionIds.includes(`model:view:${targetModelId}`)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    // --- Pre-fetch all necessary data for efficient lookup ---
    const allModels: Model[] = await db.all('SELECT id, name, displayPropertyNames FROM models');
    for (const model of allModels) {
        try {
            model.displayPropertyNames = model.displayPropertyNames ? JSON.parse(model.displayPropertyNames as any) : [];
        } catch {
            model.displayPropertyNames = [];
        }
        model.properties = await db.all('SELECT * FROM properties WHERE model_id = ?', model.id);
    }
    const allObjectsRaw = await db.all('SELECT id, model_id, data FROM data_objects WHERE isDeleted = 0 OR isDeleted IS NULL');
    const allObjectsMap: Record<string, DataObject[]> = {};
     for(const row of allObjectsRaw) {
        if (!allObjectsMap[row.model_id]) {
            allObjectsMap[row.model_id] = [];
        }
        allObjectsMap[row.model_id].push({ id: row.id, ...JSON.parse(row.data) });
    }
    // --- End Pre-fetch ---

    const result: DependencyCheckResult = { incoming: [], outgoing: [] };

    // --- Find Incoming Relationships ---
    for (const model of allModels) {
      const relationshipProperties = model.properties.filter(p => p.type === 'relationship' && p.relatedModelId === targetModelId);
      
      for (const prop of relationshipProperties) {
         const allObjectsInModel = allObjectsMap[model.id] || [];
         for (const obj of allObjectsInModel) {
            const propValue = obj[prop.name];
            let isLinked = false;
            if (prop.relationshipType === 'many' && Array.isArray(propValue)) {
                if (propValue.includes(objectId)) isLinked = true;
            } else if (typeof propValue === 'string') {
                if (propValue === objectId) isLinked = true;
            }
            if (isLinked) {
                result.incoming.push({
                    objectId: obj.id,
                    objectDisplayValue: getObjectDisplayValue(obj, model, allModels, allObjectsMap),
                    modelId: model.id,
                    modelName: model.name,
                    viaPropertyName: prop.name,
                });
            }
         }
      }
    }

    // --- Find Outgoing Relationships ---
    const targetModel = allModels.find(m => m.id === targetModelId);
    if (targetModel) {
        const data = targetObject; // Already parsed
        for (const prop of targetModel.properties) {
            if (prop.type === 'relationship' && prop.relatedModelId && data[prop.name]) {
                const relatedIds = Array.isArray(data[prop.name]) ? data[prop.name] : [data[prop.name]];
                const relatedModel = allModels.find(m => m.id === prop.relatedModelId);
                if (relatedModel) {
                    for (const relId of relatedIds) {
                        const relatedObjectData = (allObjectsMap[relatedModel.id] || []).find(o => o.id === relId);
                        if (relatedObjectData) {
                        result.outgoing.push({
                            objectId: relatedObjectData.id,
                            objectDisplayValue: getObjectDisplayValue(relatedObjectData, relatedModel, allModels, allObjectsMap),
                            modelId: relatedModel.id,
                            modelName: relatedModel.name,
                            viaPropertyName: prop.name,
                        });
                        }
                    }
                }
            }
        }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error(`API Error fetching dependencies for object ${objectId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch object dependencies', details: error.message }, { status: 500 });
  }
}
