
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { DataObject, Model, Property, WorkflowWithDetails, WorkflowStateWithSuccessors, ChangelogEventData } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth'; // Auth helper

interface Params {
  params: { modelId: string };
}

// GET all objects for a model
export async function GET(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !['user', 'administrator'].includes(currentUser.role)) {
    return NextResponse.json({ error: 'Unauthorized to view objects' }, { status: 403 });
  }
  try {
    const db = await getDb();
    const modelExists = await db.get('SELECT id FROM models WHERE id = ?', params.modelId);
    if (!modelExists) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    // Include currentStateId and ownerId in the SELECT statement
    const rows = await db.all('SELECT id, data, currentStateId, ownerId FROM data_objects WHERE model_id = ?', params.modelId);
    const objects: DataObject[] = rows.map(row => ({
      id: row.id,
      currentStateId: row.currentStateId,
      ownerId: row.ownerId,
      ...JSON.parse(row.data), // createdAt and updatedAt will be in here
    }));
    return NextResponse.json(objects);
  } catch (error) {
    console.error(`Failed to fetch objects for model ${params.modelId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch objects' }, { status: 500 });
  }
}

// POST a new object for a model
export async function POST(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !['user', 'administrator'].includes(currentUser.role)) {
    return NextResponse.json({ error: 'Unauthorized to create objects' }, { status: 403 });
  }
  const db = await getDb();
  await db.run('BEGIN TRANSACTION');

  try {
    const {
      id: objectId,
      currentStateId: _clientSuppliedStateId,
      ownerId: _clientSuppliedOwnerId,
      createdAt: _clientSuppliedCreatedAt, // Ignore client-supplied audit fields
      updatedAt: _clientSuppliedUpdatedAt, // Ignore client-supplied audit fields
      ...objectDataInput
    }: Omit<DataObject, 'id' | 'currentStateId' | 'ownerId'> & { id: string, currentStateId?: string, ownerId?: string, createdAt?: string, updatedAt?: string } = await request.json();

    const modelRow: Model | undefined = await db.get('SELECT id, workflowId FROM models WHERE id = ?', params.modelId);
    if (!modelRow) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    const properties: Property[] = await db.all('SELECT * FROM properties WHERE model_id = ?', params.modelId);

    // Validation loop (simplified for brevity, keep your existing validation)
    for (const prop of properties) {
      const valueToCheck = objectDataInput[prop.name];
      if (prop.type === 'string' && prop.isUnique) {
        if (valueToCheck !== null && typeof valueToCheck !== 'undefined' && String(valueToCheck).trim() !== '') {
          const existingObject = await db.get(
            `SELECT id FROM data_objects WHERE model_id = ? AND json_extract(data, '$.${prop.name}') = ?`,
            params.modelId,
            valueToCheck
          );
          if (existingObject) {
            await db.run('ROLLBACK');
            return NextResponse.json({
              error: `Value '${valueToCheck}' for property '${prop.name}' must be unique. It already exists.`,
              field: prop.name
            }, { status: 409 });
          }
        }
      }
       if (prop.type === 'number' && (valueToCheck !== null && typeof valueToCheck !== 'undefined')) {
        const numericValue = Number(valueToCheck);
        if (isNaN(numericValue) && prop.required) {
             await db.run('ROLLBACK');
             return NextResponse.json({
                error: `Property '${prop.name}' requires a valid number. Received: '${valueToCheck}'.`,
                field: prop.name
            }, { status: 400 });
        }
        if (!isNaN(numericValue)) {
            if (prop.minValue !== null && typeof prop.minValue === 'number' && numericValue < prop.minValue) {
            await db.run('ROLLBACK');
            return NextResponse.json({
                error: `Value '${numericValue}' for property '${prop.name}' is less than the minimum allowed value of ${prop.minValue}.`,
                field: prop.name
            }, { status: 400 });
            }
            if (prop.maxValue !== null && typeof prop.maxValue === 'number' && numericValue > prop.maxValue) {
            await db.run('ROLLBACK');
            return NextResponse.json({
                error: `Value '${numericValue}' for property '${prop.name}' is greater than the maximum allowed value of ${prop.maxValue}.`,
                field: prop.name
            }, { status: 400 });
            }
        }
      }
    }

    let finalCurrentStateId: string | null = null;
    if (modelRow.workflowId) {
        const workflow: WorkflowWithDetails | undefined = await db.get('SELECT * FROM workflows WHERE id = ?', modelRow.workflowId);
        if (workflow) {
            const statesFromDb: WorkflowStateWithSuccessors[] = await db.all(
                'SELECT * FROM workflow_states WHERE workflowId = ?', workflow.id
            );
            const initialState = statesFromDb.find(s => s.isInitial === 1 || s.isInitial === true);
            if (initialState) {
                finalCurrentStateId = initialState.id;
            } else {
                console.warn(`Workflow ${workflow.id} for model ${modelRow.id} has no initial state defined. Object will have no initial state.`);
            }
        } else {
             console.warn(`Workflow ID ${modelRow.workflowId} defined on model ${modelRow.id} not found. Object will have no initial state.`);
        }
    }

    const finalOwnerId = currentUser?.id || null;
    const currentTimestamp = new Date().toISOString();

    const finalObjectData = {
      ...objectDataInput,
      createdAt: currentTimestamp,
      updatedAt: currentTimestamp,
    };

    await db.run(
      'INSERT INTO data_objects (id, model_id, data, currentStateId, ownerId) VALUES (?, ?, ?, ?, ?)',
      objectId,
      params.modelId,
      JSON.stringify(finalObjectData),
      finalCurrentStateId,
      finalOwnerId
    );

    // Log creation event
    const changelogId = crypto.randomUUID();
    const changelogEventData: ChangelogEventData = {
      type: 'CREATE',
      initialData: { ...finalObjectData } // Store a copy
    };
    delete changelogEventData.initialData?.createdAt; // Don't log these as part of initial data diff
    delete changelogEventData.initialData?.updatedAt;

    await db.run(
      'INSERT INTO data_object_changelog (id, dataObjectId, modelId, changedAt, changedByUserId, changeType, changes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      changelogId,
      objectId,
      params.modelId,
      currentTimestamp,
      currentUser?.id || null,
      'CREATE',
      JSON.stringify(changelogEventData)
    );

    await db.run('COMMIT');

    const createdObject: DataObject = {
      id: objectId,
      currentStateId: finalCurrentStateId,
      ownerId: finalOwnerId,
      ...finalObjectData
    };
    return NextResponse.json(createdObject, { status: 201 });
  } catch (error: any) {
    await db.run('ROLLBACK');
    console.error(`Failed to create object for model ${params.modelId}:`, error);
    let errorMessage = 'Failed to create object';
    if (error.message) {
        errorMessage += `: ${error.message}`;
    }
    return NextResponse.json({ error: errorMessage, details: error.message }, { status: 500 });
  }
}
