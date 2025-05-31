
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { DataObject, Property, Model, WorkflowWithDetails, WorkflowStateWithSuccessors } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth'; // Auth helper

interface Params {
  params: { modelId: string; objectId: string };
}

// GET a single object
export async function GET(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !['user', 'administrator'].includes(currentUser.role)) {
    return NextResponse.json({ error: 'Unauthorized to view object' }, { status: 403 });
  }
  try {
    const db = await getDb();
    const row = await db.get('SELECT id, data, currentStateId FROM data_objects WHERE id = ? AND model_id = ?', params.objectId, params.modelId);

    if (!row) {
      return NextResponse.json({ error: 'Object not found' }, { status: 404 });
    }
    const object: DataObject = { id: row.id, currentStateId: row.currentStateId, ...JSON.parse(row.data) };
    return NextResponse.json(object);
  } catch (error) {
    console.error(`Failed to fetch object ${params.objectId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch object' }, { status: 500 });
  }
}

// PUT (update) an object
export async function PUT(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !['user', 'administrator'].includes(currentUser.role)) {
    return NextResponse.json({ error: 'Unauthorized to update object' }, { status: 403 });
  }
  try {
    const { id: _id, model_id: _model_id, currentStateId: newCurrentStateIdFromRequest, ...updates }: Partial<DataObject> & {id?: string, model_id?:string} = await request.json();
    const db = await getDb();

    const existingObjectRecord = await db.get('SELECT data, currentStateId, model_id FROM data_objects WHERE id = ? AND model_id = ?', params.objectId, params.modelId);
    if (!existingObjectRecord) {
      return NextResponse.json({ error: 'Object not found' }, { status: 404 });
    }
    const currentObjectStateId = existingObjectRecord.currentStateId;
    
    const properties: Property[] = await db.all('SELECT name, type, isUnique FROM properties WHERE model_id = ?', params.modelId);
    const currentData = JSON.parse(existingObjectRecord.data);

    for (const prop of properties) {
      if (prop.type === 'string' && prop.isUnique && updates.hasOwnProperty(prop.name)) {
        const newValue = updates[prop.name];
        if (newValue !== currentData[prop.name] && newValue !== null && typeof newValue !== 'undefined' && String(newValue).trim() !== '') {
          const conflictingObject = await db.get(
            `SELECT id FROM data_objects WHERE model_id = ? AND id != ? AND json_extract(data, '$.${prop.name}') = ?`,
            params.modelId,
            params.objectId,
            newValue
          );
          if (conflictingObject) {
            return NextResponse.json({ 
              error: `Value '${newValue}' for property '${prop.name}' must be unique. It already exists.`,
              field: prop.name
            }, { status: 409 }); 
          }
        }
      }
    }
    
    let finalCurrentStateIdToSave: string | null = currentObjectStateId; // Default to existing state

    if (Object.prototype.hasOwnProperty.call(updates, 'currentStateId') || Object.prototype.hasOwnProperty.call(await request.clone().json(), 'currentStateId')) { // Check if currentStateId was explicitly sent
        const modelDetails: Model | undefined = await db.get('SELECT workflowId FROM models WHERE id = ?', params.modelId);
        if (modelDetails && modelDetails.workflowId) {
            const workflow: WorkflowWithDetails | undefined = await db.get('SELECT * FROM workflows WHERE id = ?', modelDetails.workflowId);
             if (workflow) {
                const workflowStates: WorkflowStateWithSuccessors[] = await db.all(
                    'SELECT s.*, GROUP_CONCAT(t.toStateId) as successorStateIdsStr FROM workflow_states s LEFT JOIN workflow_state_transitions t ON s.id = t.fromStateId WHERE s.workflowId = ? GROUP BY s.id', workflow.id
                );
                
                const currentObjectState = workflowStates.find(s => s.id === currentObjectStateId);
                const targetState = workflowStates.find(s => s.id === newCurrentStateIdFromRequest);

                if (!targetState && newCurrentStateIdFromRequest !== null) { // Trying to move to a non-existent state
                     return NextResponse.json({ error: `Invalid target state ID: ${newCurrentStateIdFromRequest}. State does not exist in workflow.` }, { status: 400 });
                }

                if (newCurrentStateIdFromRequest !== currentObjectStateId && newCurrentStateIdFromRequest !== null) { // If it's a state change
                    if (!currentObjectState) { // Current object doesn't have a state in this workflow (e.g. workflow newly assigned)
                        // Allow moving to any state if current object has no state or an invalid one
                        finalCurrentStateIdToSave = newCurrentStateIdFromRequest;
                    } else {
                        const validSuccessorIds = currentObjectState.successorStateIdsStr ? currentObjectState.successorStateIdsStr.split(',') : [];
                        if (!validSuccessorIds.includes(newCurrentStateIdFromRequest)) {
                            return NextResponse.json({ error: `Invalid state transition from '${currentObjectState.name}' to '${targetState ? targetState.name : 'Unknown State'}'. Not a valid successor.` }, { status: 400 });
                        }
                        finalCurrentStateIdToSave = newCurrentStateIdFromRequest;
                    }
                } else if (newCurrentStateIdFromRequest === null) { // Clearing the state (explicitly setting to null)
                    finalCurrentStateIdToSave = null;
                } else { // No change in state or staying in the same state
                     finalCurrentStateIdToSave = currentObjectStateId;
                }
            } else {
                 // Model has workflowId but workflow not found - should not happen if DB is consistent
                console.warn(`Workflow ${modelDetails.workflowId} for model ${params.modelId} not found during object update. State not changed.`);
            }
        } else {
            // Model has no workflow, so state should be null
            finalCurrentStateIdToSave = null;
        }
    }


    const newData = { ...currentData, ...updates };
    if (Object.prototype.hasOwnProperty.call(updates, 'currentStateId')) {
      delete newData.currentStateId; // Don't store it in the JSON data blob
    }


    await db.run(
      'UPDATE data_objects SET data = ?, currentStateId = ? WHERE id = ? AND model_id = ?',
      JSON.stringify(newData),
      finalCurrentStateIdToSave,
      params.objectId,
      params.modelId
    );
    
    const updatedObject: DataObject = { id: params.objectId, currentStateId: finalCurrentStateIdToSave, ...newData };
    return NextResponse.json(updatedObject);
  } catch (error: any) {
    console.error(`Failed to update object ${params.objectId}:`, error);
    let errorMessage = 'Failed to update object';
    if (error.message) {
        errorMessage += `: ${error.message}`;
    }
    return NextResponse.json({ error: errorMessage, details: error.message }, { status: 500 });
  }
}

// DELETE an object
export async function DELETE(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !['user', 'administrator'].includes(currentUser.role)) {
    return NextResponse.json({ error: 'Unauthorized to delete object' }, { status: 403 });
  }
  try {
    const db = await getDb();
    const result = await db.run('DELETE FROM data_objects WHERE id = ? AND model_id = ?', params.objectId, params.modelId);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Object not found' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Object deleted successfully' });
  } catch (error) {
    console.error(`Failed to delete object ${params.objectId}:`, error);
    return NextResponse.json({ error: 'Failed to delete object' }, { status: 500 });
  }
}
