
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { WorkflowWithDetails, WorkflowStateInput, WorkflowState, WorkflowStateWithSuccessors } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth';

interface Params {
  params: { workflowId: string };
}

// GET a single workflow by ID
export async function GET(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const db = await getDb();
    const wf = await db.get('SELECT * FROM workflows WHERE id = ?', params.workflowId);

    if (!wf) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    const statesFromDb = await db.all(
      'SELECT * FROM workflow_states WHERE workflowId = ? ORDER BY orderIndex ASC', // Order by orderIndex
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
        orderIndex: s.orderIndex, // Ensure orderIndex is included
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
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { name, description, states: statesInput }: { name: string; description?: string; states: WorkflowStateInput[] } = await request.json();
    const db = await getDb();
    const workflowId = params.workflowId;

    const existingWorkflow = await db.get('SELECT id FROM workflows WHERE id = ?', workflowId);
    if (!existingWorkflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }
    if (!name || name.trim() === '') {
        return NextResponse.json({ error: 'Workflow name cannot be empty.' }, { status: 400 });
    }
    if (!statesInput || statesInput.length === 0) {
        return NextResponse.json({ error: 'Workflow must have at least one state.' }, { status: 400 });
    }
    const initialStatesInput = statesInput.filter(s => s.isInitial);
    if (initialStatesInput.length > 1) { 
        return NextResponse.json({ error: 'Workflow can only have one initial state.' }, { status: 400 });
    }
    if (initialStatesInput.length === 0 && statesInput.length > 0) {
         return NextResponse.json({ error: 'Workflow must have one initial state defined if states exist.' }, { status: 400 });
    }

    await db.run('BEGIN TRANSACTION');

    // Update workflow details
    await db.run(
      'UPDATE workflows SET name = ?, description = ? WHERE id = ?',
      name.trim(), description, workflowId
    );
    
    const existingDbStates: WorkflowState[] = await db.all('SELECT * FROM workflow_states WHERE workflowId = ?', workflowId);
    
    // States to delete: those in DB but not in the final input state set (matched by actual DB ID)
    const inputStateDbIdsToKeep = new Set(statesInput.filter(s => s.id && !s.id.startsWith('temp-') && existingDbStates.some(dbS => dbS.id === s.id)).map(s => s.id!));
    for (const dbState of existingDbStates) {
      if (!inputStateDbIdsToKeep.has(dbState.id)) {
        await db.run('DELETE FROM workflow_states WHERE id = ?', dbState.id);
      }
    }
    
    const stateNameToFinalIdMap: Record<string, string> = {};
    const finalStatesForResponse: WorkflowStateWithSuccessors[] = [];

    // Update existing states and insert new states
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

      if (isExistingStateById && sInput.id) { // Update existing state
        stateId = sInput.id; 
        await db.run(
          'UPDATE workflow_states SET name = ?, description = ?, color = ?, isInitial = ?, orderIndex = ? WHERE id = ? AND workflowId = ?',
          stateNameTrimmed, sInput.description, sInput.color ?? null, sInput.isInitial ? 1 : 0, orderIndex, stateId, workflowId
        );
      } else { // Insert new state
        await db.run(
          'INSERT INTO workflow_states (id, workflowId, name, description, color, isInitial, orderIndex) VALUES (?, ?, ?, ?, ?, ?, ?)',
          stateId, workflowId, stateNameTrimmed, sInput.description, sInput.color ?? null, sInput.isInitial ? 1 : 0, orderIndex
        );
      }
      finalStatesForResponse.push({
        id: stateId,
        workflowId,
        name: stateNameTrimmed,
        description: sInput.description,
        color: sInput.color ?? null,
        isInitial: !!sInput.isInitial,
        orderIndex: orderIndex,
        successorStateIds: [], // Will be populated next
      });
    }

    // Clear all existing transitions for this workflow and re-create them
    await db.run('DELETE FROM workflow_state_transitions WHERE workflowId = ?', workflowId);

    for (const sInput of statesInput) {
      const fromStateNameTrimmed = sInput.name.trim();
      const fromStateId = stateNameToFinalIdMap[fromStateNameTrimmed]; 
      const currentFinalState = finalStatesForResponse.find(s => s.id === fromStateId);

      if (sInput.successorStateNames && sInput.successorStateNames.length > 0) {
        for (const successorName of sInput.successorStateNames) {
          const toStateId = stateNameToFinalIdMap[successorName.trim()]; 
          if (!toStateId) {
            await db.run('ROLLBACK');
            return NextResponse.json({ error: `Successor state name "${successorName}" for state "${fromStateNameTrimmed}" is invalid or refers to a state not being processed.` }, { status: 400 });
          }
          
          const transitionId = crypto.randomUUID();
          await db.run(
            'INSERT INTO workflow_state_transitions (id, workflowId, fromStateId, toStateId) VALUES (?, ?, ?, ?)',
            transitionId, workflowId, fromStateId, toStateId
          );
          if (currentFinalState) {
            currentFinalState.successorStateIds.push(toStateId);
          }
        }
      }
    }

    await db.run('COMMIT');

    const initialDbStateAfterUpdate = await db.get('SELECT id FROM workflow_states WHERE workflowId = ? AND isInitial = 1', workflowId);
    const finalStatesDataFromDb = await db.all('SELECT * FROM workflow_states WHERE workflowId = ? ORDER BY orderIndex ASC', workflowId);
    
    const finalStatesWithSuccessors = [];
    for (const s of finalStatesDataFromDb) {
        const transitions = await db.all('SELECT toStateId FROM workflow_state_transitions WHERE fromStateId = ? AND workflowId = ?', s.id, workflowId);
        finalStatesWithSuccessors.push({...s, color: s.color ?? null, isInitial: !!s.isInitial, successorStateIds: transitions.map(t => t.toStateId)});
    }


    const updatedWorkflow: WorkflowWithDetails = {
      id: workflowId,
      name: name.trim(),
      description,
      states: finalStatesWithSuccessors,
      initialStateId: initialDbStateAfterUpdate?.id || null,
    };
    return NextResponse.json(updatedWorkflow);

  } catch (error: any) {
    const db = await getDb();
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
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const db = await getDb();
    const workflowId = params.workflowId;

    // Check if workflow is in use by any models
    const modelUsingWorkflow = await db.get('SELECT id FROM models WHERE workflowId = ?', workflowId);
    if (modelUsingWorkflow) {
      return NextResponse.json({ error: 'Cannot delete workflow. It is currently assigned to one or more models.' }, { status: 409 });
    }

    // CASCADE delete should handle states and transitions
    const result = await db.run('DELETE FROM workflows WHERE id = ?', workflowId);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Workflow deleted successfully' });
  } catch (error: any) {
    console.error(`API Error (DELETE /workflows/${params.workflowId}):`, error);
    return NextResponse.json({ error: 'Failed to delete workflow', details: error.message }, { status: 500 });
  }
}
