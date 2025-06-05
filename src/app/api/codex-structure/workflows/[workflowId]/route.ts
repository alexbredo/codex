
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
      'SELECT * FROM workflow_states WHERE workflowId = ? ORDER BY name ASC',
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
        isInitial: !!s.isInitial,
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
    if (initialStatesInput.length > 1) { // Can be 0 temporarily if user unchecks the only initial one
        return NextResponse.json({ error: 'Workflow can only have one initial state.' }, { status: 400 });
    }
    if (initialStatesInput.length === 0 && statesInput.length > 0) {
        // If no state is marked as initial, this is an invalid setup unless it's a temporary state during form editing.
        // However, on final submission, an initial state should ideally be present.
        // For now, we'll let it through but the client form should enforce this or API can double check.
        // The schema validation on the client already checks this, but good to be aware.
    }


    await db.run('BEGIN TRANSACTION');

    // Update workflow details
    await db.run(
      'UPDATE workflows SET name = ?, description = ? WHERE id = ?',
      name.trim(), description, workflowId
    );
    
    const existingDbStates: WorkflowState[] = await db.all('SELECT * FROM workflow_states WHERE workflowId = ?', workflowId);
    const inputStateClientIds = new Set(statesInput.map(s => s.id).filter(Boolean)); // IDs provided by client (could be existing or temp)

    // States to delete: those in DB but not in the final input state set (matched by actual DB ID)
    const inputStateDbIdsToKeep = new Set(statesInput.filter(s => s.id && !s.id.startsWith('temp-') && existingDbStates.some(dbS => dbS.id === s.id)).map(s => s.id!));
    for (const dbState of existingDbStates) {
      if (!inputStateDbIdsToKeep.has(dbState.id)) {
        await db.run('DELETE FROM workflow_states WHERE id = ?', dbState.id);
        // Related data_objects.currentStateId will be set to NULL due to ON DELETE SET NULL
      }
    }
    
    const stateNameToFinalIdMap: Record<string, string> = {};
    const finalStatesForResponse: WorkflowStateWithSuccessors[] = [];

    // Update existing states and insert new states
    for (const sInput of statesInput) {
      if (!sInput.name || sInput.name.trim() === '') {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: `State name cannot be empty.` }, { status: 400 });
      }
      const stateNameTrimmed = sInput.name.trim();
      let stateId = sInput.id && existingDbStates.some(dbS => dbS.id === sInput.id) ? sInput.id : crypto.randomUUID();
      
      stateNameToFinalIdMap[stateNameTrimmed] = stateId; // Map name to its final ID (new or existing)

      const isExistingStateById = existingDbStates.some(dbS => dbS.id === sInput.id);

      if (isExistingStateById && sInput.id) { // Update existing state
        stateId = sInput.id; // Use the provided existing ID
        await db.run(
          'UPDATE workflow_states SET name = ?, description = ?, isInitial = ? WHERE id = ? AND workflowId = ?',
          stateNameTrimmed, sInput.description, sInput.isInitial ? 1 : 0, stateId, workflowId
        );
      } else { // Insert new state
        // stateId is already a new UUID if sInput.id was not a valid existing ID
        await db.run(
          'INSERT INTO workflow_states (id, workflowId, name, description, isInitial) VALUES (?, ?, ?, ?, ?)',
          stateId, workflowId, stateNameTrimmed, sInput.description, sInput.isInitial ? 1 : 0
        );
      }
      finalStatesForResponse.push({
        id: stateId,
        workflowId,
        name: stateNameTrimmed,
        description: sInput.description,
        isInitial: !!sInput.isInitial,
        successorStateIds: [], // Will be populated next
      });
    }

    // Clear all existing transitions for this workflow and re-create them
    await db.run('DELETE FROM workflow_state_transitions WHERE workflowId = ?', workflowId);

    for (const sInput of statesInput) {
      const fromStateNameTrimmed = sInput.name.trim();
      const fromStateId = stateNameToFinalIdMap[fromStateNameTrimmed]; // Get the final ID for this state name
      const currentFinalState = finalStatesForResponse.find(s => s.id === fromStateId);

      if (sInput.successorStateNames && sInput.successorStateNames.length > 0) {
        for (const successorName of sInput.successorStateNames) {
          const toStateId = stateNameToFinalIdMap[successorName.trim()]; // Get final ID for successor
          if (!toStateId) {
            await db.run('ROLLBACK');
            return NextResponse.json({ error: `Successor state name "${successorName}" for state "${fromStateNameTrimmed}" is invalid or refers to a state not being processed.` }, { status: 400 });
          }
          // Optional: Add check to prevent self-transitions if needed
          // if (fromStateId === toStateId) continue; 
          
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

    const updatedWorkflow: WorkflowWithDetails = {
      id: workflowId,
      name: name.trim(),
      description,
      states: finalStatesForResponse.sort((a,b) => a.name.localeCompare(b.name)), // Sort for consistent response
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

    