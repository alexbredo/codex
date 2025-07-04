
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import type { MarketplaceItem, ValidationRuleset, WorkflowWithDetails } from '@/lib/types';
import crypto from 'crypto';


export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  const canInstall = currentUser?.permissionIds.includes('*') || currentUser?.permissionIds.includes('marketplace:install');

  if (!currentUser || !canInstall) {
    return NextResponse.json({ error: 'Unauthorized to install marketplace items.' }, { status: 403 });
  }

  const db = await getDb();
  
  try {
    const item: MarketplaceItem = await request.json();
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
            
            // 1. Insert/update workflow definition
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

            // 2. Clear out old states and transitions for this workflow to ensure clean import
            await db.run('DELETE FROM workflow_state_transitions WHERE workflowId = ?', payload.id);
            await db.run('DELETE FROM workflow_states WHERE workflowId = ?', payload.id);
            
            // 3. Insert new states
            for (const state of payload.states) {
                 await db.run(
                    'INSERT INTO workflow_states (id, workflowId, name, description, color, isInitial, orderIndex) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    state.id, payload.id, state.name, state.description, state.color, state.isInitial ? 1 : 0, state.orderIndex
                 );
            }

            // 4. Insert new transitions (assuming payload has successor IDs)
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
      default:
        return NextResponse.json({ error: `Unsupported item type: ${item.type}` }, { status: 400 });
    }

  } catch (error: any) {
    console.error("Marketplace Install API Error:", error);
    return NextResponse.json({ error: 'Failed to install item.', details: error.message }, { status: 500 });
  }
}
