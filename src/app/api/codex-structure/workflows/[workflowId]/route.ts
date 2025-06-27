
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { WorkflowWithDetails, WorkflowStateInput, WorkflowState, WorkflowStateWithSuccessors, StructuralChangeDetail } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth';

interface Params {
  params: { workflowId: string };
}

async function getWorkflowSnapshot(db: any, workflowId: string): Promise<any> {
    const wfRow = await db.get('SELECT * FROM workflows WHERE id = ?', workflowId);
    if (!wfRow) return null;

    const statesFromDb = await db.all('SELECT * FROM workflow_states WHERE workflowId = ? ORDER BY orderIndex ASC', workflowId);
    const statesForSnapshot = [];
    for (const s of statesFromDb) {
        const transitions = await db.all('SELECT toStateId FROM workflow_state_transitions WHERE fromStateId = ? AND workflowId = ?', s.id, workflowId);
        const successorStates = await db.all('SELECT name FROM workflow_states WHERE id IN (' + transitions.map(t => `'${t.toStateId}'`).join(',') + ')', []);
        
        statesForSnapshot.push({
            name: s.name,
            description: s.description,
            color: s.color ?? null,
            isInitial: !!s.isInitial,
            orderIndex: s.orderIndex,
            successorStateNames: transitions.length > 0 ? successorStates.map(ss => ss.name) : [],
        });
    }
    return {
        id: wfRow.id,
        name: wfRow.name,
        description: wfRow.description,
        states: statesForSnapshot,
    };
}


// GET a single workflow by ID
export async function GET(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || (!currentUser.permissionIds.includes('admin:manage_workflows') && !currentUser.permissionIds.includes('*'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const db = await getDb();
    const wf = await db.get('SELECT * FROM workflows WHERE id = ?', params.workflowId);

    if (!wf) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    const statesFromDb = await db.all(
      'SELECT * FROM workflow_states WHERE workflowId = ? ORDER BY orderIndex ASC', 
      wf.id
    );

    let initialStateId: string | null = null;
    const statesWithSuccessors = [];
    for (const s of statesFromDb) {
      if (s.isInitial) {
        initialStateId = s.id;
      }
      const transitions = await db.all(
        'SELECT toStateId FROM workflow_state_transitions WHERE fromStateId = ? AND workflowId = ?',
        s.id, wf.id
      );
      statesWithSuccessors.push({
        ...s,
        color: s.color ?? null,
        isInitial: !!s.isInitial,
        orderIndex: s.orderIndex, 
        successorStateIds: transitions.map((t) => t.toStateId),
      });
    }

    const workflow: WorkflowWithDetails = { ...wf, states: statesWithSuccessors, initialStateId };
    return NextResponse.json(workflow);
  } catch (error: any) {
    console.error(`API Error (GET /workflows/${params.workflowId}):`, error);
    return NextResponse.json({ error: 'Failed to fetch workflow', details: error.message }, { status: 500 });
  }
}

// PUT (update) an existing workflow
export async function PUT(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || (!currentUser.permissionIds.includes('admin:manage_workflows') && !currentUser.permissionIds.includes('*'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const db = await getDb();
  await db.run('BEGIN TRANSACTION');

  try {
    const { name, description, states: statesInput }: { name: string; description?: string; states: WorkflowStateInput[] } = await request.json();
    const workflowId = params.workflowId;
    const currentTimestamp = new Date().toISOString();

    const existingWorkflowForLog = await getWorkflowSnapshot(db, workflowId);
    if (!existingWorkflowForLog) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }
    
    if (!name || name.trim() === '') {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: 'Workflow name cannot be empty.' }, { status: 400 });
    }
    if (!statesInput || statesInput.length === 0) {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: 'Workflow must have at least one state.' }, { status: 400 });
    }
    const initialStatesInput = statesInput.filter(s => s.isInitial);
    if (initialStatesInput.length > 1) { 
        await db.run('ROLLBACK');
        return NextResponse.json({ error: 'Workflow can only have one initial state.' }, { status: 400 });
    }
    if (initialStatesInput.length === 0 && statesInput.length > 0) {
         await db.run('ROLLBACK');
         return NextResponse.json({ error: 'Workflow must have one initial state defined if states exist.' }, { status: 400 });
    }

    await db.run(
      'UPDATE workflows SET name = ?, description = ? WHERE id = ?',
      name.trim(), description, workflowId
    );
    
    const existingDbStates: WorkflowState[] = await db.all('SELECT * FROM workflow_states WHERE workflowId = ?', workflowId);
    const inputStateDbIdsToKeep = new Set(statesInput.filter(s => s.id && !s.id.startsWith('temp-') && existingDbStates.some(dbS => dbS.id === s.id)).map(s => s.id!));
    for (const dbState of existingDbStates) {
      if (!inputStateDbIdsToKeep.has(dbState.id)) {
        await db.run('DELETE FROM workflow_states WHERE id = ?', dbState.id); // Cascade will delete transitions
      }
    }
    
    const stateNameToFinalIdMap: Record<string, string> = {};
    const finalStatesForResponseAndLog: Array<Omit<WorkflowStateWithSuccessors, 'workflowId'> & {successorStateNames: string[]}> = [];


    for (const [index, sInput] of statesInput.entries()) {
      if (!sInput.name || sInput.name.trim() === '') {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: `State name cannot be empty.` }, { status: 400 });
      }
      const stateNameTrimmed = sInput.name.trim();
      let stateId = (sInput.id && !sInput.id.startsWith('temp-') && existingDbStates.some(dbS => dbS.id === sInput.id)) ? sInput.id : crypto.randomUUID();
      const orderIndex = sInput.orderIndex !== undefined ? sInput.orderIndex : index;
      
      stateNameToFinalIdMap[stateNameTrimmed] = stateId;
      const isExistingStateById = existingDbStates.some(dbS => dbS.id === sInput.id && !sInput.id?.startsWith('temp-'));

      if (isExistingStateById && sInput.id) {
        stateId = sInput.id; 
        await db.run(
          'UPDATE workflow_states SET name = ?, description = ?, color = ?, isInitial = ?, orderIndex = ? WHERE id = ? AND workflowId = ?',
          stateNameTrimmed, sInput.description, sInput.color ?? null, sInput.isInitial ? 1 : 0, orderIndex, stateId, workflowId
        );
      } else {
        await db.run(
          'INSERT INTO workflow_states (id, workflowId, name, description, color, isInitial, orderIndex) VALUES (?, ?, ?, ?, ?, ?, ?)',
          stateId, workflowId, stateNameTrimmed, sInput.description, sInput.color ?? null, sInput.isInitial ? 1 : 0, orderIndex
        );
      }
      finalStatesForResponseAndLog.push({
        id: stateId,
        name: stateNameTrimmed,
        description: sInput.description,
        color: sInput.color ?? null,
        isInitial: !!sInput.isInitial,
        orderIndex: orderIndex,
        successorStateIds: [], 
        successorStateNames: sInput.successorStateNames || [],
      });
    }

    await db.run('DELETE FROM workflow_state_transitions WHERE workflowId = ?', workflowId);

    for (const sState of finalStatesForResponseAndLog) {
      const fromStateId = sState.id;
      if (sState.successorStateNames && sState.successorStateNames.length > 0) {
        for (const successorName of sState.successorStateNames) {
          const toStateId = stateNameToFinalIdMap[successorName.trim()]; 
          if (!toStateId) {
            await db.run('ROLLBACK');
            return NextResponse.json({ error: `Successor state name "${successorName}" for state "${sState.name}" is invalid or refers to a state not being processed.` }, { status: 400 });
          }
          const transitionId = crypto.randomUUID();
          await db.run(
            'INSERT INTO workflow_state_transitions (id, workflowId, fromStateId, toStateId) VALUES (?, ?, ?, ?)',
            transitionId, workflowId, fromStateId, toStateId
          );
          sState.successorStateIds.push(toStateId);
        }
      }
    }

    // Log structural change
    const changelogId = crypto.randomUUID();
    const changesDetail: StructuralChangeDetail[] = [];
    const newWorkflowDataForLog = { name: name.trim(), description, states: finalStatesForResponseAndLog.map(s => ({ name: s.name, description: s.description, color: s.color, isInitial: s.isInitial, orderIndex: s.orderIndex, successorStateNames: s.successorStateNames })) };

    if (newWorkflowDataForLog.name !== existingWorkflowForLog.name) changesDetail.push({ field: 'name', oldValue: existingWorkflowForLog.name, newValue: newWorkflowDataForLog.name });
    if (newWorkflowDataForLog.description !== existingWorkflowForLog.description) changesDetail.push({ field: 'description', oldValue: existingWorkflowForLog.description, newValue: newWorkflowDataForLog.description });
    
    // For states, log the before and after arrays due to potential re-creation/reordering
    changesDetail.push({ field: 'states', oldValue: existingWorkflowForLog.states, newValue: newWorkflowDataForLog.states });

    if (changesDetail.length > 0) {
        await db.run(
          'INSERT INTO structural_changelog (id, timestamp, userId, entityType, entityId, entityName, action, changes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          changelogId,
          currentTimestamp,
          currentUser.id,
          'Workflow',
          workflowId,
          newWorkflowDataForLog.name, 
          'UPDATE',
          JSON.stringify(changesDetail)
        );
    }
    
    await db.run('COMMIT');

    const initialDbStateAfterUpdate = await db.get('SELECT id FROM workflow_states WHERE workflowId = ? AND isInitial = 1', workflowId);
    const finalStatesDataFromDbForResponse = finalStatesForResponseAndLog.map(s => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { successorStateNames, ...rest } = s;
        return { ...rest, workflowId }; // Add workflowId back for the response type
    });

    const updatedWorkflowResponse: WorkflowWithDetails = {
      id: workflowId,
      name: name.trim(),
      description,
      states: finalStatesDataFromDbForResponse,
      initialStateId: initialDbStateAfterUpdate?.id || null,
    };
    return NextResponse.json(updatedWorkflowResponse);

  } catch (error: any) {
    try { await db.run('ROLLBACK'); } catch (rbError) { console.error("Rollback failed:", rbError); }
    console.error(`API Error (PUT /workflows/${params.workflowId}):`, error);
    if (error.message && error.message.includes('UNIQUE constraint failed: workflows.name')) {
      return NextResponse.json({ error: 'A workflow with this name already exists.', details: error.message }, { status: 409 });
    }
    if (error.message && error.message.includes('UNIQUE constraint failed: workflow_states.workflowId, workflow_states.name')) {
      return NextResponse.json({ error: 'State names must be unique within a workflow.', details: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to update workflow', details: error.message }, { status: 500 });
  }
}

// DELETE a workflow
export async function DELETE(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || (!currentUser.permissionIds.includes('admin:manage_workflows') && !currentUser.permissionIds.includes('*'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const db = await getDb();
  await db.run('BEGIN TRANSACTION');

  try {
    const workflowId = params.workflowId;
    const currentTimestamp = new Date().toISOString();

    const modelUsingWorkflow = await db.get('SELECT id FROM models WHERE workflowId = ?', workflowId);
    if (modelUsingWorkflow) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Cannot delete workflow. It is currently assigned to one or more models.' }, { status: 409 });
    }
    
    const workflowToDeleteSnapshot = await getWorkflowSnapshot(db, workflowId);
    if (!workflowToDeleteSnapshot) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    const result = await db.run('DELETE FROM workflows WHERE id = ?', workflowId); // Cascade will delete states and transitions
    if (result.changes === 0) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Workflow not found or already deleted' }, { status: 404 });
    }

    // Log structural change for workflow deletion
    const changelogId = crypto.randomUUID();
    await db.run(
      'INSERT INTO structural_changelog (id, timestamp, userId, entityType, entityId, entityName, action, changes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      changelogId,
      currentTimestamp,
      currentUser.id,
      'Workflow',
      workflowId,
      workflowToDeleteSnapshot.name, 
      'DELETE',
      JSON.stringify(workflowToDeleteSnapshot) 
    );
    
    await db.run('COMMIT');
    return NextResponse.json({ message: 'Workflow deleted successfully' });
  } catch (error: any) {
    try { await db.run('ROLLBACK'); } catch (rbError) { console.error("Rollback failed:", rbError); }
    console.error(`API Error (DELETE /workflows/${params.workflowId}):`, error);
    return NextResponse.json({ error: 'Failed to delete workflow', details: error.message }, { status: 500 });
  }
}
