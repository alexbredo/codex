
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { WorkflowWithDetails, WorkflowStateInput, StructuralChangeDetail } from '@/lib/types';
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
          color: s.color ?? null,
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

  const db = await getDb();
  await db.run('BEGIN TRANSACTION');

  try {
    const { name, description, states: statesInput }: { name: string; description?: string; states: WorkflowStateInput[] } = await request.json();
    const currentTimestamp = new Date().toISOString();

    if (!name || name.trim() === '') {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Workflow name cannot be empty.' }, { status: 400 });
    }
    if (!statesInput || statesInput.length === 0) {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: 'Workflow must have at least one state.' }, { status: 400 });
    }

    const initialStates = statesInput.filter(s => s.isInitial);
    if (initialStates.length === 0 && statesInput.length > 0) {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: 'Workflow must have one initial state defined.' }, { status: 400 });
    }
    if (initialStates.length > 1) {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: 'Workflow can only have one initial state.' }, { status: 400 });
    }

    const workflowId = crypto.randomUUID();
    await db.run(
      'INSERT INTO workflows (id, name, description) VALUES (?, ?, ?)',
      workflowId, name.trim(), description
    );

    const stateNameToIdMap: Record<string, string> = {};
    const createdStatesForResponseAndLog = [];

    for (const [index, sInput] of statesInput.entries()) {
      if (!sInput.name || sInput.name.trim() === '') {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: `State name cannot be empty.` }, { status: 400 });
      }
      const stateId = crypto.randomUUID();
      stateNameToIdMap[sInput.name.trim()] = stateId;
      const orderIndex = sInput.orderIndex !== undefined ? sInput.orderIndex : index;

      await db.run(
        'INSERT INTO workflow_states (id, workflowId, name, description, color, isInitial, orderIndex) VALUES (?, ?, ?, ?, ?, ?, ?)',
        stateId, workflowId, sInput.name.trim(), sInput.description, sInput.color ?? null, sInput.isInitial ? 1 : 0, orderIndex
      );
      createdStatesForResponseAndLog.push({
        id: stateId,
        workflowId,
        name: sInput.name.trim(),
        description: sInput.description,
        color: sInput.color ?? null,
        isInitial: !!sInput.isInitial,
        orderIndex: orderIndex,
        successorStateIds: [], // Will be populated below by name then mapped to IDs for response
        successorStateNames: sInput.successorStateNames || [], // Store names for logging snapshot
      });
    }

    for (const sState of createdStatesForResponseAndLog) {
      if (sState.successorStateNames && sState.successorStateNames.length > 0) {
        for (const successorName of sState.successorStateNames) {
          const toStateId = stateNameToIdMap[successorName.trim()];
          if (!toStateId) {
            await db.run('ROLLBACK');
            return NextResponse.json({ error: `Successor state "${successorName}" not found for state "${sState.name}".` }, { status: 400 });
          }
          const transitionId = crypto.randomUUID();
          await db.run(
            'INSERT INTO workflow_state_transitions (id, workflowId, fromStateId, toStateId) VALUES (?, ?, ?, ?)',
            transitionId, workflowId, sState.id, toStateId
          );
          sState.successorStateIds.push(toStateId); // Populate IDs for direct response if needed
        }
      }
    }
    
    // Log structural change for workflow creation
    const changelogId = crypto.randomUUID();
    const createdWorkflowSnapshot = {
      id: workflowId,
      name: name.trim(),
      description,
      states: createdStatesForResponseAndLog.map(s => ({ // Log simplified state info
        name: s.name,
        description: s.description,
        color: s.color,
        isInitial: s.isInitial,
        orderIndex: s.orderIndex,
        successorStateNames: s.successorStateNames,
      })),
    };

    await db.run(
      'INSERT INTO structural_changelog (id, timestamp, userId, entityType, entityId, entityName, action, changes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      changelogId,
      currentTimestamp,
      currentUser.id,
      'Workflow',
      workflowId,
      name.trim(),
      'CREATE',
      JSON.stringify(createdWorkflowSnapshot)
    );

    await db.run('COMMIT');

    const initialDbState = await db.get('SELECT id FROM workflow_states WHERE workflowId = ? AND isInitial = 1', workflowId);
    const finalStatesForResponse = createdStatesForResponseAndLog.map(s => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { successorStateNames, ...rest } = s; // Remove names from final API response, keep IDs
      return rest;
    });

    const createdWorkflow: WorkflowWithDetails = {
      id: workflowId,
      name: name.trim(),
      description,
      states: finalStatesForResponse,
      initialStateId: initialDbState?.id || null,
    };

    return NextResponse.json(createdWorkflow, { status: 201 });

  } catch (error: any) {
    await db.run('ROLLBACK');
    console.error('API Error (POST /workflows):', error);
    if (error.message && error.message.includes('UNIQUE constraint failed: workflows.name')) {
      return NextResponse.json({ error: 'A workflow with this name already exists.', details: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create workflow', details: error.message }, { status: 500 });
  }
}

    