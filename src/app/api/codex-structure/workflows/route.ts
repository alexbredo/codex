
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { WorkflowWithDetails, WorkflowStateInput } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth';

// GET all workflows with their states and transitions
export async function GET(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const db = await getDb();
    const workflowsFromDb = await db.all('SELECT * FROM workflows ORDER BY name ASC');
    const workflows: WorkflowWithDetails[] = [];

    for (const wf of workflowsFromDb) {
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
          isInitial: !!s.isInitial,
          orderIndex: s.orderIndex, // Ensure orderIndex is included
          successorStateIds: transitions.map((t) => t.toStateId),
        });
      }
      workflows.push({ ...wf, states: statesWithSuccessors, initialStateId });
    }
    return NextResponse.json(workflows);
  } catch (error: any) {
    console.error('API Error (GET /workflows):', error);
    return NextResponse.json({ error: 'Failed to fetch workflows', details: error.message }, { status: 500 });
  }
}

// POST a new workflow with its states and transitions
export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { name, description, states: statesInput }: { name: string; description?: string; states: WorkflowStateInput[] } = await request.json();
    const db = await getDb();

    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'Workflow name cannot be empty.' }, { status: 400 });
    }
    if (!statesInput || statesInput.length === 0) {
        return NextResponse.json({ error: 'Workflow must have at least one state.' }, { status: 400 });
    }

    const initialStates = statesInput.filter(s => s.isInitial);
    if (initialStates.length === 0 && statesInput.length > 0) { // Ensure at least one initial state if states are present
        return NextResponse.json({ error: 'Workflow must have one initial state defined.' }, { status: 400 });
    }
    if (initialStates.length > 1) {
        return NextResponse.json({ error: 'Workflow can only have one initial state.' }, { status: 400 });
    }


    await db.run('BEGIN TRANSACTION');

    const workflowId = crypto.randomUUID();
    await db.run(
      'INSERT INTO workflows (id, name, description) VALUES (?, ?, ?)',
      workflowId, name.trim(), description
    );

    // Map state names to their newly created IDs for setting up transitions
    const stateNameToIdMap: Record<string, string> = {};
    const createdStatesForResponse = [];

    for (const [index, sInput] of statesInput.entries()) {
      if (!sInput.name || sInput.name.trim() === '') {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: `State name cannot be empty.` }, { status: 400 });
      }
      const stateId = crypto.randomUUID();
      stateNameToIdMap[sInput.name.trim()] = stateId;
      const orderIndex = sInput.orderIndex !== undefined ? sInput.orderIndex : index;

      await db.run(
        'INSERT INTO workflow_states (id, workflowId, name, description, isInitial, orderIndex) VALUES (?, ?, ?, ?, ?, ?)',
        stateId, workflowId, sInput.name.trim(), sInput.description, sInput.isInitial ? 1 : 0, orderIndex
      );
      createdStatesForResponse.push({
        id: stateId,
        workflowId,
        name: sInput.name.trim(),
        description: sInput.description,
        isInitial: !!sInput.isInitial,
        orderIndex: orderIndex,
        successorStateIds: [], // Will be populated below
      });
    }

    // Create transitions
    for (const sInput of statesInput) {
      const fromStateId = stateNameToIdMap[sInput.name.trim()];
      const currentCreatedState = createdStatesForResponse.find(s => s.id === fromStateId);

      if (sInput.successorStateNames && sInput.successorStateNames.length > 0) {
        for (const successorName of sInput.successorStateNames) {
          const toStateId = stateNameToIdMap[successorName.trim()];
          if (!toStateId) {
            await db.run('ROLLBACK');
            return NextResponse.json({ error: `Successor state "${successorName}" not found for state "${sInput.name}".` }, { status: 400 });
          }
          const transitionId = crypto.randomUUID();
          await db.run(
            'INSERT INTO workflow_state_transitions (id, workflowId, fromStateId, toStateId) VALUES (?, ?, ?, ?)',
            transitionId, workflowId, fromStateId, toStateId
          );
          if (currentCreatedState) {
            currentCreatedState.successorStateIds.push(toStateId);
          }
        }
      }
    }

    await db.run('COMMIT');

    const initialDbState = await db.get('SELECT id FROM workflow_states WHERE workflowId = ? AND isInitial = 1', workflowId);
    // Re-fetch states in correct order to return
    const finalStatesForResponse = await db.all('SELECT * FROM workflow_states WHERE workflowId = ? ORDER BY orderIndex ASC', workflowId);
    const finalStatesWithSuccessors = [];
    for (const s of finalStatesForResponse) {
        const transitions = await db.all('SELECT toStateId FROM workflow_state_transitions WHERE fromStateId = ? AND workflowId = ?', s.id, workflowId);
        finalStatesWithSuccessors.push({...s, isInitial: !!s.isInitial, successorStateIds: transitions.map(t => t.toStateId)});
    }


    const createdWorkflow: WorkflowWithDetails = {
      id: workflowId,
      name: name.trim(),
      description,
      states: finalStatesWithSuccessors,
      initialStateId: initialDbState?.id || null,
    };

    return NextResponse.json(createdWorkflow, { status: 201 });

  } catch (error: any) {
    const db = await getDb();
    await db.run('ROLLBACK');
    console.error('API Error (POST /workflows):', error);
    if (error.message && error.message.includes('UNIQUE constraint failed: workflows.name')) {
      return NextResponse.json({ error: 'A workflow with this name already exists.', details: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create workflow', details: error.message }, { status: 500 });
  }
}
