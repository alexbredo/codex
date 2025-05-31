
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Model, Property, DataObject, PropertyType, WorkflowWithDetails, WorkflowStateWithSuccessors } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { isDateValid } from 'date-fns';

interface BatchUpdatePayload {
  objectIds: string[];
  propertyName: string;
  propertyType: PropertyType | 'workflow_state';
  newValue: any;
}

interface Params {
  params: { modelId: string };
}

export async function POST(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !['user', 'administrator'].includes(currentUser.role)) {
    return NextResponse.json({ error: 'Unauthorized to perform batch update' }, { status: 403 });
  }

  const { modelId } = params;
  let db;

  try {
    const payload: BatchUpdatePayload = await request.json();
    const { objectIds, propertyName, propertyType, newValue } = payload;

    if (!objectIds || !Array.isArray(objectIds) || objectIds.length === 0) {
      return NextResponse.json({ error: 'No object IDs provided or invalid format for batch update.' }, { status: 400 });
    }
    if (!propertyName || typeof propertyName !== 'string') {
      return NextResponse.json({ error: 'Property name not provided or invalid format for batch update.' }, { status: 400 });
    }
    if (!propertyType || typeof propertyType !== 'string') {
      return NextResponse.json({ error: 'Property type not provided or invalid format for batch update.' }, { status: 400 });
    }

    db = await getDb();
    await db.run('BEGIN TRANSACTION');

    const model: Model | undefined = await db.get('SELECT * FROM models WHERE id = ?', modelId);
    if (!model) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: `Model with ID ${modelId} not found.` }, { status: 404 });
    }

    let updatedCount = 0;
    const errors: string[] = [];

    if (propertyName === "__workflowStateUpdate__") {
      if (propertyType !== 'workflow_state') {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: `Invalid propertyType "${propertyType}" for workflow state update.` }, { status: 400 });
      }
      if (!model.workflowId) {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: `Model "${model.name}" does not have an assigned workflow.` }, { status: 400 });
      }
      const targetStateId = String(newValue);
      const workflow: WorkflowWithDetails | undefined = await db.get('SELECT * FROM workflows WHERE id = ?', model.workflowId);
      if (!workflow) {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: `Workflow with ID ${model.workflowId} not found.` }, { status: 404 });
      }
      
      const workflowStates: WorkflowStateWithSuccessors[] = await db.all(
        'SELECT s.*, GROUP_CONCAT(t.toStateId) as successorStateIdsStr FROM workflow_states s LEFT JOIN workflow_state_transitions t ON s.id = t.fromStateId WHERE s.workflowId = ? GROUP BY s.id',
        workflow.id
      );

      const targetStateDef = workflowStates.find(s => s.id === targetStateId);
      if (!targetStateDef) {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: `Target state ID "${targetStateId}" does not exist in workflow "${workflow.name}".` }, { status: 400 });
      }
      
      for (const objectId of objectIds) {
        const objToUpdate: { id: string, currentStateId: string | null } | undefined = await db.get(
            'SELECT id, currentStateId FROM data_objects WHERE id = ? AND model_id = ?', objectId, modelId
        );

        if (!objToUpdate) {
          errors.push(`Object ID ${objectId}: Not found.`);
          continue;
        }

        const currentObjectStateDef = objToUpdate.currentStateId ? workflowStates.find(s => s.id === objToUpdate.currentStateId) : null;
        let isValidTransition = false;

        if (!objToUpdate.currentStateId) { // Object is in no specific state
          if (targetStateDef.isInitial) {
            isValidTransition = true;
          } else {
            errors.push(`Object ID ${objectId}: Cannot move to non-initial state "${targetStateDef.name}" as object has no current state.`);
          }
        } else if (currentObjectStateDef) { // Object is in a defined state
          const validSuccessors = currentObjectStateDef.successorStateIdsStr ? currentObjectStateDef.successorStateIdsStr.split(',') : [];
          if (validSuccessors.includes(targetStateId)) {
            isValidTransition = true;
          } else {
            errors.push(`Object ID ${objectId}: Invalid transition from "${currentObjectStateDef.name}" to "${targetStateDef.name}".`);
          }
        } else { // Object has a currentStateId, but it's not found in the workflow (orphaned state)
            errors.push(`Object ID ${objectId}: Current state ID "${objToUpdate.currentStateId}" not found in workflow. Cannot validate transition.`);
        }
        
        if (isValidTransition) {
          try {
            await db.run('UPDATE data_objects SET currentStateId = ? WHERE id = ? AND model_id = ?', targetStateId, objectId, modelId);
            updatedCount++;
          } catch (err: any) {
            errors.push(`Object ID ${objectId}: DB error during state update - ${err.message}`);
          }
        }
      }
    } else {
      // Regular Property Update Logic
      const propertiesFromDb: Property[] = await db.all('SELECT * FROM properties WHERE model_id = ?', modelId);
      const propertyToUpdate = propertiesFromDb.find(p => p.name === propertyName);

      if (!propertyToUpdate) {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: `Property "${propertyName}" not found in model "${model.name}".` }, { status: 400 });
      }
      if (propertyToUpdate.type !== propertyType) {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: `Provided property type "${propertyType}" does not match actual type "${propertyToUpdate.type}" for property "${propertyName}".` }, { status: 400 });
      }

      for (const objectId of objectIds) {
        let coercedNewValue: any;
        let validationErrorForThisObjectLoop = false;

        switch (propertyToUpdate.type) {
          case 'string': case 'markdown': case 'image': 
            coercedNewValue = String(newValue); 
            break;
          case 'number': case 'rating':
            coercedNewValue = parseFloat(String(newValue));
            if (isNaN(coercedNewValue)) { 
              errors.push(`Object ID ${objectId}: Invalid number value "${newValue}" for property "${propertyName}".`); 
              validationErrorForThisObjectLoop = true;
            } else if (propertyToUpdate.type === 'rating' && (coercedNewValue < 0 || coercedNewValue > 5 || !Number.isInteger(coercedNewValue))) {
              errors.push(`Object ID ${objectId}: Rating for "${propertyName}" must be an integer between 0 and 5. Received "${newValue}".`);
              validationErrorForThisObjectLoop = true;
            }
            break;
          case 'boolean': 
            coercedNewValue = Boolean(newValue); 
            break;
          case 'date':
            if (!isDateValid(new Date(newValue))) {
              errors.push(`Object ID ${objectId}: Invalid date value "${newValue}" for property "${propertyName}".`);
              validationErrorForThisObjectLoop = true;
            } else {
              coercedNewValue = new Date(newValue).toISOString();
            }
            break;
          default:
            errors.push(`Object ID ${objectId}: Batch updates for property type "${propertyToUpdate.type}" on property "${propertyName}" are not currently supported.`);
            validationErrorForThisObjectLoop = true;
        }

        if (validationErrorForThisObjectLoop) {
          continue; 
        }
        
        const existingObject: { data: string } | undefined = await db.get('SELECT data FROM data_objects WHERE id = ? AND model_id = ?', objectId, modelId);
        if (!existingObject) { 
            errors.push(`Object with ID ${objectId} not found.`); 
            continue; 
        }
        
        const currentData = JSON.parse(existingObject.data);
        
        if (propertyToUpdate.isUnique && propertyToUpdate.type === 'string' && String(coercedNewValue).trim() !== '') {
          const conflictingObject = await db.get( `SELECT id FROM data_objects WHERE model_id = ? AND id != ? AND json_extract(data, '$.${propertyName}') = ?`, modelId, objectId, coercedNewValue );
          if (conflictingObject) { 
            errors.push(`Object ID ${objectId}: Value '${coercedNewValue}' for unique property '${propertyName}' already exists in another object (ID: ${conflictingObject.id}).`); 
            continue; 
          }
        }
        const newData = { ...currentData, [propertyName]: coercedNewValue };
        try {
           await db.run( 'UPDATE data_objects SET data = ? WHERE id = ? AND model_id = ?', JSON.stringify(newData), objectId, modelId );
          updatedCount++;
        } catch (err: any) { 
            errors.push(`Object ID ${objectId}: Failed to update property - ${err.message}`); 
        }
      }
    }

    if (errors.length > 0) {
      await db.run('ROLLBACK');
      return NextResponse.json({
        message: `Batch update failed or partially failed. ${updatedCount} of ${objectIds.length} objects processed before critical errors. No changes were applied due to validation errors or database issues.`,
        error: `Batch update failed. No changes were applied due to validation errors or database issues.`,
        errors
      }, { status: 400 });
    }
    
    await db.run('COMMIT');
    return NextResponse.json({ message: `Successfully updated ${updatedCount} objects.` });

  } catch (error: any) {
    if (db) { 
        try {
            console.log("Outer catch: Attempting ROLLBACK due to error:", error.message);
            await db.run('ROLLBACK'); 
        } catch (rollbackError: any) {
            console.error("CRITICAL: Error during ROLLBACK attempt in outer catch:", rollbackError.message);
             return NextResponse.json({ 
               error: 'Failed to perform batch update and also failed to rollback transaction.', 
               details: `Original error: ${String(error?.message || error)}. Rollback error: ${String(rollbackError?.message || rollbackError)}` 
             }, { status: 500 });
        }
    }
    
    let detailMessage = "Unknown server error.";
    if (error && typeof error.message === 'string') {
        detailMessage = error.message;
    } else if (typeof error === 'string') {
        detailMessage = error;
    } else {
        try {
            detailMessage = JSON.stringify(error);
        } catch (stringifyError) {
            detailMessage = "Complex error object that could not be stringified.";
        }
    }
    console.error('Batch Update API Error (Outer Catch Full):', error);
    return NextResponse.json({ 
      error: 'Failed to perform batch update due to a server error.', 
      details: detailMessage 
    }, { status: 500 });
  }
}

    
