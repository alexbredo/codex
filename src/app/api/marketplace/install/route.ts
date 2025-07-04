
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import type { MarketplaceItem, ValidationRuleset, WorkflowWithDetails, ExportedModelGroupBundle, Model, DataObject } from '@/lib/types';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import axios from 'axios';

const MARKETPLACE_DIR = path.join(process.cwd(), 'data', 'marketplace');
const REMOTE_CACHE_FILE = path.join(MARKETPLACE_DIR, 'remote_cache.json');

export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  const canInstall = currentUser?.permissionIds.includes('*') || currentUser?.permissionIds.includes('marketplace:install');

  if (!currentUser || !canInstall) {
    return NextResponse.json({ error: 'Unauthorized to install marketplace items.' }, { status: 403 });
  }

  const db = await getDb();
  
  try {
    const { itemId, source }: { itemId: string, source: 'local' | 'remote' } = await request.json();

    if (!itemId || !source) {
      return NextResponse.json({ error: 'itemId and source are required.' }, { status: 400 });
    }

    let item: MarketplaceItem;

    if (source === 'local') {
      const itemFilePath = path.join(MARKETPLACE_DIR, `${itemId}.json`);
      try {
        const fileContent = await fs.readFile(itemFilePath, 'utf-8');
        item = JSON.parse(fileContent);
        // Increment download count for local items
        item.downloadCount = (item.downloadCount || 0) + 1;
        await fs.writeFile(itemFilePath, JSON.stringify(item, null, 2));
      } catch(e) {
        return NextResponse.json({ error: 'Local marketplace item not found.' }, { status: 404 });
      }
    } else if (source === 'remote') {
      // 1. Read remote cache to find the item's source repository
      const remoteCacheContent = await fs.readFile(REMOTE_CACHE_FILE, 'utf-8');
      const remoteItems: MarketplaceItem[] = JSON.parse(remoteCacheContent);
      const remoteItemInfo = remoteItems.find(i => i.id === itemId);

      if (!remoteItemInfo || !remoteItemInfo.sourceRepository) {
        return NextResponse.json({ error: 'Remote item not found in cache.' }, { status: 404 });
      }

      // 2. Get repository details (including API key) from DB
      const repoDetails = await db.get(
        'SELECT * FROM marketplace_repositories WHERE url = ?',
        remoteItemInfo.sourceRepository.url
      );

      if (!repoDetails) {
        return NextResponse.json({ error: 'Source repository configuration not found.' }, { status: 404 });
      }

      // 3. Fetch full item details from the remote URL
      const detailUrl = repoDetails.url.endsWith('/') ? `${repoDetails.url}${itemId}` : `${repoDetails.url}/${itemId}`;
      
      const http = axios.create({
        headers: {
          'User-Agent': 'CodexStructure-Install/1.0',
          'Accept': 'application/json',
          ...(repoDetails.api_key ? { 'Authorization': `Bearer ${repoDetails.api_key}` } : {})
        }
      });
      
      const response = await http.get(detailUrl);
      item = response.data; // This is the full MarketplaceItem object

    } else {
      return NextResponse.json({ error: 'Invalid source specified.' }, { status: 400 });
    }

    const latestVersionDetails = item.versions.find(v => v.version === item.latestVersion);

    if (!latestVersionDetails) {
      return NextResponse.json({ error: 'Latest version payload not found in marketplace item.' }, { status: 400 });
    }

    switch (item.type) {
      case 'validation_rule': {
        const payload = latestVersionDetails.payload as ValidationRuleset;
        const result = await db.run(
          `INSERT INTO validation_rulesets (id, name, description, regexPattern, marketplaceVersion) 
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             description = excluded.description,
             regexPattern = excluded.regexPattern,
             marketplaceVersion = excluded.marketplaceVersion`,
          payload.id,
          payload.name,
          payload.description,
          payload.regexPattern,
          latestVersionDetails.version
        );
        if (result.changes > 0) {
            return NextResponse.json({ success: true, message: `Successfully installed/updated validation rule "${payload.name}".` });
        } else {
            return NextResponse.json({ success: true, message: `Validation rule "${payload.name}" is already up to date.` });
        }
      }
      
      case 'workflow': {
        await db.run('BEGIN TRANSACTION');
        try {
            const payload = latestVersionDetails.payload as WorkflowWithDetails;
            
            await db.run(
              `INSERT INTO workflows (id, name, description, marketplaceVersion) 
               VALUES (?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 name = excluded.name,
                 description = excluded.description,
                 marketplaceVersion = excluded.marketplaceVersion`,
              payload.id,
              payload.name,
              payload.description,
              latestVersionDetails.version
            );

            await db.run('DELETE FROM workflow_state_transitions WHERE workflowId = ?', payload.id);
            await db.run('DELETE FROM workflow_states WHERE workflowId = ?', payload.id);
            
            for (const state of payload.states) {
                 await db.run(
                    'INSERT INTO workflow_states (id, workflowId, name, description, color, isInitial, orderIndex) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    state.id, payload.id, state.name, state.description, state.color, state.isInitial ? 1 : 0, state.orderIndex
                 );
            }

            for (const state of payload.states) {
                if(state.successorStateIds && state.successorStateIds.length > 0) {
                    for(const successorId of state.successorStateIds) {
                        await db.run(
                            'INSERT INTO workflow_state_transitions (id, workflowId, fromStateId, toStateId) VALUES (?, ?, ?, ?)',
                            crypto.randomUUID(), payload.id, state.id, successorId
                        );
                    }
                }
            }
            
            await db.run('COMMIT');
            return NextResponse.json({ success: true, message: `Successfully installed/updated workflow "${payload.name}".` });
        } catch (installError: any) {
            await db.run('ROLLBACK');
            console.error(`Marketplace Install API Error for workflow:`, installError);
            return NextResponse.json({ error: 'Failed to install workflow item.', details: installError.message }, { status: 500 });
        }
      }

      case 'model_group': {
        await db.run('BEGIN TRANSACTION');
        try {
            const payload = latestVersionDetails.payload as ExportedModelGroupBundle;
            const groupToInstall = payload.group;
            
            const existingGroup = await db.get('SELECT id FROM model_groups WHERE id = ?', groupToInstall.id);
            if (existingGroup) {
                const modelsInBundle = payload.models.map(m => m.model.id);
                for (const modelId of modelsInBundle) {
                    await db.run('DELETE FROM data_objects WHERE model_id = ?', modelId);
                }
            }
            
            await db.run('INSERT OR REPLACE INTO model_groups (id, name, description, marketplaceVersion) VALUES (?, ?, ?, ?)',
                groupToInstall.id, groupToInstall.name, groupToInstall.description, latestVersionDetails.version
            );

            for (const modelBundle of payload.models) {
                const modelToInstall = modelBundle.model;
                await db.run('DELETE FROM properties WHERE model_id = ?', modelToInstall.id);

                await db.run('INSERT OR REPLACE INTO models (id, name, description, model_group_id, displayPropertyNames, workflowId) VALUES (?, ?, ?, ?, ?, ?)',
                    modelToInstall.id, modelToInstall.name, modelToInstall.description, groupToInstall.id, 
                    JSON.stringify(modelToInstall.displayPropertyNames || []), modelToInstall.workflowId || null
                );
                
                for (const prop of modelToInstall.properties) {
                     await db.run(
                        'INSERT INTO properties (id, model_id, name, type, relatedModelId, required, relationshipType, unit, precision, autoSetOnCreate, autoSetOnUpdate, isUnique, orderIndex, defaultValue, validationRulesetId, minValue, maxValue) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        prop.id, prop.model_id, prop.name, prop.type, prop.relatedModelId,
                        prop.required ? 1 : 0, prop.relationshipType, prop.unit, prop.precision,
                        prop.autoSetOnCreate ? 1 : 0, prop.autoSetOnUpdate ? 1 : 0,
                        prop.isUnique ? 1 : 0, prop.orderIndex, prop.defaultValue,
                        prop.validationRulesetId, prop.minValue, prop.maxValue
                      );
                }

                for (const obj of modelBundle.dataObjects) {
                     const dataToInsert = { ...obj };
                     delete (dataToInsert as any).id;
                     delete (dataToInsert as any).currentStateId;
                     delete (dataToInsert as any).ownerId;
                     delete (dataToInsert as any).isDeleted;
                     delete (dataToInsert as any).deletedAt;

                     await db.run(
                        'INSERT INTO data_objects (id, model_id, data, currentStateId, ownerId, isDeleted, deletedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        obj.id, modelToInstall.id, JSON.stringify(dataToInsert), obj.currentStateId, obj.ownerId, 
                        obj.isDeleted ? 1 : 0, obj.deletedAt
                    );
                }
            }

            await db.run('COMMIT');
            return NextResponse.json({ success: true, message: `Successfully installed/updated model group "${groupToInstall.name}".` });
        } catch (installError: any) {
            await db.run('ROLLBACK');
            console.error(`Marketplace Install API Error for model_group:`, installError);
            return NextResponse.json({ error: 'Failed to install model group item.', details: installError.message }, { status: 500 });
        }
      }

      default:
        return NextResponse.json({ error: `Unsupported item type: ${item.type}` }, { status: 400 });
    }

  } catch (error: any) {
    console.error("Marketplace Install API Error:", error);
    if (axios.isAxiosError(error)) {
      return NextResponse.json({ error: `Failed to fetch remote item details: ${error.response?.statusText || error.message}` }, { status: 500 });
    }
    return NextResponse.json({ error: 'Failed to install item.', details: error.message }, { status: 500 });
  }
}
