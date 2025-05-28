
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { WorkflowWithDetails, WorkflowStateInput } from '@/lib/types';
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
    if (initialStatesInput.length === 0) {
        return NextResponse.json({ error: 'Workflow must have one initial state defined.' }, { status: 400 });
    }
    if (initialStatesInput.length > 1) {
        return NextResponse.json({ error: 'Workflow can only have one initial state.' }, { status: 400 });
    }

    await db.run('BEGIN TRANSACTION');

    // Update workflow details
    await db.run(
      'UPDATE workflows SET name = ?, description = ? WHERE id = ?',
      name.trim(), description, workflowId
    );

    // Clear existing states and transitions for this workflow
    // CASCADE constraints should handle deletion from workflow_state_transitions
    await db.run('DELETE FROM workflow_states WHERE workflowId = ?', workflowId);
    // Explicitly delete transitions just in case CASCADE is not fully relied upon or for clarity
    await db.run('DELETE FROM workflow_state_transitions WHERE workflowId = ?', workflowId);


    // Map state names to their newly created IDs for setting up transitions
    const stateNameToIdMap: Record<string, string> = {};
    const createdStatesForResponse = [];
    const newStatesToCreate: Array<Omit<WorkflowStateInput, 'successorStateNames'> & { id: string, successorStateNames?: string[]}> = [];


    for (const sInput of statesInput) {
       if (!sInput.name || sInput.name.trim() === '') {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: `State name cannot be empty.` }, { status: 400 });
      }
      const stateId = sInput.id || crypto.randomUUID(); // Use existing ID if provided and valid, else new
      stateNameToIdMap[sInput.name.trim()] = stateId;
      newStatesToCreate.push({ ...sInput, id: stateId, name: sInput.name.trim() });

      await db.run(
        'INSERT INTO workflow_states (id, workflowId, name, description, isInitial) VALUES (?, ?, ?, ?, ?)',
        stateId, workflowId, sInput.name.trim(), sInput.description, sInput.isInitial ? 1 : 0
      );
       createdStatesForResponse.push({
        id: stateId,
        workflowId,
        name: sInput.name.trim(),
        description: sInput.description,
        isInitial: !!sInput.isInitial,
        successorStateIds: [],
      });
    }

    // Create transitions
    for (const sData of newStatesToCreate) {
      const fromStateId = sData.id;
      const currentCreatedState = createdStatesForResponse.find(s => s.id === fromStateId);

      if (sData.successorStateNames && sData.successorStateNames.length > 0) {
        for (const successorName of sData.successorStateNames) {
          const toStateId = stateNameToIdMap[successorName.trim()];
          if (!toStateId) {
            await db.run('ROLLBACK');
            return NextResponse.json({ error: `Successor state "${successorName}" not found for state "${sData.name}". Ensure all successor state names exist within this workflow.` }, { status: 400 });
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

    const updatedWorkflow: WorkflowWithDetails = {
      id: workflowId,
      name: name.trim(),
      description,
      states: createdStatesForResponse,
      initialStateId: initialDbState?.id || null,
    };
    return NextResponse.json(updatedWorkflow);

  } catch (error: any) {
    const db = await getDb();
    await db.run('ROLLBACK');
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
