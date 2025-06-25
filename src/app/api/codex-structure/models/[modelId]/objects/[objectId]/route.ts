
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { DataObject, Property, Model, WorkflowWithDetails, WorkflowStateWithSuccessors, ValidationRuleset, ChangelogEventData, PropertyChangeDetail } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth'; // Auth helper

interface Params {
  params: { modelId: string; objectId: string };
}

// GET a single object
export async function GET(request: Request, { params }: Params) {
  const { modelId, objectId } = params;
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !['user', 'administrator'].includes(currentUser.role)) {
    return NextResponse.json({ error: 'Unauthorized to view object' }, { status: 403 });
  }
  try {
    const db = await getDb();
    // Also fetch isDeleted and deletedAt
    const row = await db.get('SELECT id, data, currentStateId, ownerId, isDeleted, deletedAt FROM data_objects WHERE id = ? AND model_id = ?', objectId, modelId);

    if (!row) {
      return NextResponse.json({ error: 'Object not found' }, { status: 404 });
    }
    const object: DataObject = {
      id: row.id,
      currentStateId: row.currentStateId,
      ownerId: row.ownerId,
      isDeleted: !!row.isDeleted,
      deletedAt: row.deletedAt,
      ...JSON.parse(row.data) // createdAt and updatedAt will be in here
    };
    return NextResponse.json(object);
  } catch (error: any) {
    console.error(`API Error (GET /models/${modelId}/objects/${objectId}): Failed to fetch object.`, error);
    return NextResponse.json({ error: 'Failed to fetch object', details: error.message }, { status: 500 });
  }
}

// PUT (update) an object
export async function PUT(request: Request, { params }: Params) {
  const { modelId, objectId } = params;
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !['user', 'administrator'].includes(currentUser.role)) {
    return NextResponse.json({ error: 'Unauthorized to update object' }, { status: 403 });
  }

  const db = await getDb();
  await db.run('BEGIN TRANSACTION');

  try {
    const requestBody = await request.clone().json();
    const {
      id: _id,
      model_id: _model_id,
      currentStateId: newCurrentStateIdFromRequest,
      ownerId: newOwnerIdFromRequest,
      createdAt: _clientSuppliedCreatedAt, 
      updatedAt: _clientSuppliedUpdatedAt, 
      isDeleted: _clientSuppliedIsDeleted, // Ignore client-supplied soft delete fields
      deletedAt: _clientSuppliedDeletedAt, // Ignore client-supplied soft delete fields
      ...updates
    }: Partial<DataObject> & {id?: string, model_id?:string, currentStateId?: string | null, ownerId?: string | null, createdAt?:string, updatedAt?:string, isDeleted?: boolean, deletedAt?: string | null} = requestBody;


    const existingObjectRecord = await db.get('SELECT data, currentStateId, ownerId, model_id, isDeleted FROM data_objects WHERE id = ? AND model_id = ?', objectId, modelId);
    if (!existingObjectRecord) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Object not found' }, { status: 404 });
    }
    if (existingObjectRecord.isDeleted) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Cannot update a deleted object. Please restore it first.' }, { status: 400 });
    }


    const oldDataParsed = JSON.parse(existingObjectRecord.data);
    const oldCurrentStateId = existingObjectRecord.currentStateId;
    const oldOwnerId = existingObjectRecord.ownerId;

    const properties: Property[] = await db.all('SELECT * FROM properties WHERE model_id = ?', modelId);
    const validationRulesets: ValidationRuleset[] = await db.all('SELECT * FROM validation_rulesets');


    // Validation loop (keep your existing comprehensive validation)
    for (const prop of properties) {
      if (updates.hasOwnProperty(prop.name)) {
        const newValue = updates[prop.name];

        // Regex validation for strings
        if (prop.type === 'string' && prop.validationRulesetId && (newValue !== null && typeof newValue !== 'undefined' && String(newValue).trim() !== '')) {
            const ruleset = validationRulesets.find(rs => rs.id === prop.validationRulesetId);
            if (ruleset) {
                try {
                    const regex = new RegExp(ruleset.regexPattern);
                    if (!regex.test(String(newValue))) {
                        await db.run('ROLLBACK');
                        return NextResponse.json({
                            error: `Value for '${prop.name}' does not match the required format: ${ruleset.name}. (Pattern: ${ruleset.regexPattern})`,
                            field: prop.name
                        }, { status: 400 });
                    }
                } catch (e: any) {
                    console.warn(`API PUT Object: Invalid regex pattern for ruleset ${ruleset.name} (ID: ${ruleset.id}): ${ruleset.regexPattern}. Skipping validation for this rule.`);
                }
            }
        }

        // Uniqueness check for strings
        if (prop.type === 'string' && prop.isUnique && newValue !== oldDataParsed[prop.name]) {
          if (newValue !== null && typeof newValue !== 'undefined' && String(newValue).trim() !== '') {
            const conflictingObject = await db.get(
              `SELECT id FROM data_objects WHERE model_id = ? AND id != ? AND json_extract(data, '$.${prop.name}') = ? AND (isDeleted = 0 OR isDeleted IS NULL)`, // Check only non-deleted
              modelId,
              objectId,
              newValue
            );
            if (conflictingObject) {
              await db.run('ROLLBACK');
              return NextResponse.json({
                error: `Value '${newValue}' for property '${prop.name}' must be unique. It already exists.`,
                field: prop.name
              }, { status: 409 });
            }
          }
        }
        // Min/Max check for numbers
        if (prop.type === 'number' && (newValue !== null && typeof newValue !== 'undefined')) {
          const numericValue = Number(newValue);
          if (isNaN(numericValue) && prop.required) {
             await db.run('ROLLBACK');
             return NextResponse.json({
                error: `Property '${prop.name}' requires a valid number. Received: '${newValue}'.`,
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
    }

    let finalCurrentStateIdToSave: string | null = oldCurrentStateId;
    let modelDetails: Model | undefined;
    let workflow: WorkflowWithDetails | undefined;
    let workflowStates: WorkflowStateWithSuccessors[] = [];


    if (Object.prototype.hasOwnProperty.call(requestBody, 'currentStateId')) {
        modelDetails = await db.get('SELECT workflowId FROM models WHERE id = ?', modelId);
        if (modelDetails && modelDetails.workflowId) {
            workflow = await db.get('SELECT * FROM workflows WHERE id = ?', modelDetails.workflowId);
             if (workflow) {
                workflowStates = await db.all(
                    'SELECT s.*, GROUP_CONCAT(t.toStateId) as successorStateIdsStr FROM workflow_states s LEFT JOIN workflow_state_transitions t ON s.id = t.fromStateId WHERE s.workflowId = ? GROUP BY s.id', workflow.id
                );

                const currentObjectState = workflowStates.find(s => s.id === oldCurrentStateId);
                const targetState = workflowStates.find(s => s.id === newCurrentStateIdFromRequest);

                if (!targetState && newCurrentStateIdFromRequest !== null) {
                     await db.run('ROLLBACK');
                     return NextResponse.json({ error: `Invalid target state ID: ${newCurrentStateIdFromRequest}. State does not exist in workflow.` }, { status: 400 });
                }

                if (newCurrentStateIdFromRequest !== oldCurrentStateId && newCurrentStateIdFromRequest !== null) {
                    if (!currentObjectState) {
                        finalCurrentStateIdToSave = newCurrentStateIdFromRequest;
                    } else {
                        const validSuccessorIds = currentObjectState.successorStateIdsStr ? currentObjectState.successorStateIdsStr.split(',') : [];
                        if (!validSuccessorIds.includes(newCurrentStateIdFromRequest)) {
                            await db.run('ROLLBACK');
                            return NextResponse.json({ error: `Invalid state transition from '${currentObjectState.name}' to '${targetState ? targetState.name : 'Unknown State'}'. Not a valid successor.` }, { status: 400 });
                        }
                        finalCurrentStateIdToSave = newCurrentStateIdFromRequest;
                    }
                } else if (newCurrentStateIdFromRequest === null) {
                    finalCurrentStateIdToSave = null;
                }
            } else {
                console.warn(`Workflow ${modelDetails.workflowId} for model ${modelId} not found during object update. State not changed.`);
            }
        } else {
            finalCurrentStateIdToSave = null;
        }
    }

    let finalOwnerIdToSave: string | null = oldOwnerId;
    if (currentUser.role === 'administrator' && Object.prototype.hasOwnProperty.call(requestBody, 'ownerId')) {
      if (newOwnerIdFromRequest === null || newOwnerIdFromRequest === '') {
        finalOwnerIdToSave = null;
      } else {
        const userExists = await db.get('SELECT id FROM users WHERE id = ?', newOwnerIdFromRequest);
        if (!userExists) {
          await db.run('ROLLBACK');
          return NextResponse.json({ error: `Invalid user ID provided for owner: ${newOwnerIdFromRequest}. User does not exist.` }, { status: 400 });
        }
        finalOwnerIdToSave = newOwnerIdFromRequest;
      }
    } else if (Object.prototype.hasOwnProperty.call(requestBody, 'ownerId')) {
      console.warn(`User ${currentUser.username} (not admin) attempted to change ownerId for object ${objectId}. Change ignored.`);
    }

    const currentTimestamp = new Date().toISOString();
    const preservedCreatedAt = oldDataParsed.createdAt || currentTimestamp;

    const newData = {
      ...oldDataParsed,
      ...updates,
      createdAt: preservedCreatedAt,
      updatedAt: currentTimestamp,
    };

    if (Object.prototype.hasOwnProperty.call(requestBody, 'currentStateId')) delete newData.currentStateId;
    if (Object.prototype.hasOwnProperty.call(requestBody, 'ownerId')) delete newData.ownerId;


    // --- Changelog Logic ---
    const propertyChanges: PropertyChangeDetail[] = [];
    const allPropertiesIncludingMeta = [...properties,
        { name: '__workflowState__', type: 'string' } as Property, 
        { name: '__owner__', type: 'string' } as Property 
    ];

    for (const prop of allPropertiesIncludingMeta) {
        const propName = prop.name;
        let oldValue: any;
        let newValue: any;
        let oldLabel: string | undefined;
        let newLabel: string | undefined;

        if (propName === '__workflowState__') {
            oldValue = oldCurrentStateId;
            newValue = finalCurrentStateIdToSave;
            if (oldValue !== newValue && workflow && workflowStates.length > 0) {
                const oldStateDef = workflowStates.find(s => s.id === oldValue);
                const newStateDef = workflowStates.find(s => s.id === newValue);
                oldLabel = oldStateDef ? oldStateDef.name : (oldValue ? 'Unknown State' : 'None');
                newLabel = newStateDef ? newStateDef.name : (newValue ? 'Unknown State' : 'None');
            }
        } else if (propName === '__owner__') {
            oldValue = oldOwnerId;
            newValue = finalOwnerIdToSave;
            if (oldValue !== newValue) {
                const oldOwnerUser = oldValue ? await db.get('SELECT username FROM users WHERE id = ?', oldValue) : null;
                const newOwnerUser = newValue ? await db.get('SELECT username FROM users WHERE id = ?', newValue) : null;
                oldLabel = oldOwnerUser ? oldOwnerUser.username : (oldValue ? 'Unknown User' : 'None');
                newLabel = newOwnerUser ? newOwnerUser.username : (newValue ? 'Unknown User' : 'None');
            }
        } else if (updates.hasOwnProperty(propName)) {
            oldValue = oldDataParsed[propName];
            newValue = newData[propName];
        } else {
            continue; 
        }

        
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            propertyChanges.push({ propertyName: propName, oldValue, newValue, oldLabel, newLabel });
        }
    }

    if (propertyChanges.length > 0) {
      const changelogId = crypto.randomUUID();
      const changelogEventData: ChangelogEventData = {
        type: 'UPDATE',
        modifiedProperties: propertyChanges
      };
      await db.run(
        'INSERT INTO data_object_changelog (id, dataObjectId, modelId, changedAt, changedByUserId, changeType, changes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        changelogId,
        objectId,
        modelId,
        currentTimestamp,
        currentUser?.id || null,
        'UPDATE',
        JSON.stringify(changelogEventData)
      );
    }
    // --- End Changelog Logic ---


    await db.run(
      'UPDATE data_objects SET data = ?, currentStateId = ?, ownerId = ? WHERE id = ? AND model_id = ?',
      JSON.stringify(newData),
      finalCurrentStateIdToSave,
      finalOwnerIdToSave,
      objectId,
      modelId
    );

    await db.run('COMMIT');

    const updatedObject: DataObject = {
      id: objectId,
      currentStateId: finalCurrentStateIdToSave,
      ownerId: finalOwnerIdToSave,
      isDeleted: false, // Since this is an update, it must be active
      deletedAt: null,
      ...newData
    };
    return NextResponse.json(updatedObject);
  } catch (error: any) {
    await db.run('ROLLBACK');
    console.error(`API Error (PUT /models/${modelId}/objects/${objectId}): Error updating object.`, {
      errorMessage: error.message,
      stack: error.stack,
      requestBody: await request.text().catch(() => 'Could not read request body'),
    });
    return NextResponse.json({
      error: `Failed to update object. ${error.message}`,
      details: error.stack,
    }, { status: 500 });
  }
}

// DELETE an object (now soft delete)
export async function DELETE(request: Request, { params }: Params) {
  const { modelId, objectId } = params;
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !['user', 'administrator'].includes(currentUser.role)) {
    return NextResponse.json({ error: 'Unauthorized to delete object' }, { status: 403 });
  }
  
  const db = await getDb();
  await db.run('BEGIN TRANSACTION');
  try {
    const currentTimestamp = new Date().toISOString();
    const objectToSoftDelete = await db.get('SELECT data FROM data_objects WHERE id = ? AND model_id = ? AND (isDeleted = 0 OR isDeleted IS NULL)', objectId, modelId);

    if (!objectToSoftDelete) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Object not found or already deleted' }, { status: 404 });
    }

    const result = await db.run(
      'UPDATE data_objects SET isDeleted = 1, deletedAt = ? WHERE id = ? AND model_id = ?',
      currentTimestamp,
      objectId,
      modelId
    );

    if (result.changes === 0) {
      await db.run('ROLLBACK'); // Should be caught by the check above, but as safeguard
      return NextResponse.json({ error: 'Object not found or failed to soft delete' }, { status: 404 });
    }

    // Log soft delete event
    const changelogId = crypto.randomUUID();
    const changelogEventData: ChangelogEventData = {
      type: 'DELETE',
      status: 'deleted',
      timestamp: currentTimestamp,
      snapshot: JSON.parse(objectToSoftDelete.data), // Store snapshot of data before deletion
    };
    await db.run(
      'INSERT INTO data_object_changelog (id, dataObjectId, modelId, changedAt, changedByUserId, changeType, changes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      changelogId,
      objectId,
      modelId,
      currentTimestamp,
      currentUser?.id || null,
      'DELETE',
      JSON.stringify(changelogEventData)
    );

    await db.run('COMMIT');
    return NextResponse.json({ message: 'Object soft deleted successfully' });
  } catch (error: any) {
    await db.run('ROLLBACK');
    console.error(`API Error (DELETE /models/${modelId}/objects/${objectId}): Failed to soft delete object.`, error);
    return NextResponse.json({ error: 'Failed to soft delete object', details: error.message }, { status: 500 });
  }
}
