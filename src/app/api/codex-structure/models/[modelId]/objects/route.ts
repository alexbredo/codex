
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { DataObject, Model, Property, WorkflowWithDetails, WorkflowStateWithSuccessors } from '@/lib/types';
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

    // Include currentStateId in the SELECT statement
    const rows = await db.all('SELECT id, data, currentStateId FROM data_objects WHERE model_id = ?', params.modelId);
    const objects: DataObject[] = rows.map(row => ({
      id: row.id,
      currentStateId: row.currentStateId, // Add currentStateId here
      ...JSON.parse(row.data),
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
  try {
    const { id: objectId, currentStateId: _clientSuppliedStateId, ...objectData }: Omit<DataObject, 'id'> & { id: string } = await request.json();
    const db = await getDb();

    const modelRow: Model | undefined = await db.get('SELECT id, workflowId FROM models WHERE id = ?', params.modelId);
    if (!modelRow) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    const properties: Property[] = await db.all('SELECT name, type, isUnique FROM properties WHERE model_id = ?', params.modelId);

    // Uniqueness check
    for (const prop of properties) {
      if (prop.type === 'string' && prop.isUnique) {
        const valueToCheck = objectData[prop.name];
        if (valueToCheck !== null && typeof valueToCheck !== 'undefined' && String(valueToCheck).trim() !== '') {
          const existingObject = await db.get(
            `SELECT id FROM data_objects WHERE model_id = ? AND json_extract(data, '$.${prop.name}') = ?`,
            params.modelId,
            valueToCheck
          );
          if (existingObject) {
            return NextResponse.json({ 
              error: `Value '${valueToCheck}' for property '${prop.name}' must be unique. It already exists.`,
              field: prop.name 
            }, { status: 409 });
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
            const initialState = statesFromDb.find(s => s.isInitial === 1 || s.isInitial === true); // Ensure boolean check for SQLite
            if (initialState) {
                finalCurrentStateId = initialState.id;
            } else {
                console.warn(`Workflow ${workflow.id} for model ${modelRow.id} has no initial state defined. Object will have no initial state.`);
            }
        } else {
             console.warn(`Workflow ID ${modelRow.workflowId} defined on model ${modelRow.id} not found. Object will have no initial state.`);
        }
    }


    await db.run(
      'INSERT INTO data_objects (id, model_id, data, currentStateId) VALUES (?, ?, ?, ?)',
      objectId,
      params.modelId,
      JSON.stringify(objectData),
      finalCurrentStateId
    );
    
    const createdObject: DataObject = { id: objectId, currentStateId: finalCurrentStateId, ...objectData };
    return NextResponse.json(createdObject, { status: 201 });
  } catch (error: any) {
    console.error(`Failed to create object for model ${params.modelId}:`, error);
    let errorMessage = 'Failed to create object';
    if (error.message) {
        errorMessage += `: ${error.message}`;
    }
    return NextResponse.json({ error: errorMessage, details: error.message }, { status: 500 });
  }
}

