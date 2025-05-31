
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Model, Property, DataObject, PropertyType } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth';

interface BatchUpdatePayload {
  objectIds: string[];
  propertyName: string;
  propertyType: PropertyType; // Added to help with type coercion
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

  try {
    const payload: BatchUpdatePayload = await request.json();
    const { objectIds, propertyName, propertyType, newValue } = payload;

    if (!objectIds || objectIds.length === 0) {
      return NextResponse.json({ error: 'No object IDs provided for batch update.' }, { status: 400 });
    }
    if (!propertyName) {
      return NextResponse.json({ error: 'Property name not provided for batch update.' }, { status: 400 });
    }
     if (!propertyType) {
      return NextResponse.json({ error: 'Property type not provided for batch update.' }, { status: 400 });
    }


    const db = await getDb();

    // Validate the model and property
    const model: Model | undefined = await db.get('SELECT * FROM models WHERE id = ?', modelId);
    if (!model) {
      return NextResponse.json({ error: `Model with ID ${modelId} not found.` }, { status: 404 });
    }
    const properties: Property[] = await db.all('SELECT * FROM properties WHERE model_id = ?', modelId);
    const propertyToUpdate = properties.find(p => p.name === propertyName);

    if (!propertyToUpdate) {
      return NextResponse.json({ error: `Property "${propertyName}" not found in model "${model.name}".` }, { status: 400 });
    }
    
    // Ensure the provided propertyType matches the actual property's type
    if (propertyToUpdate.type !== propertyType) {
        return NextResponse.json({ error: `Provided property type "${propertyType}" does not match actual type "${propertyToUpdate.type}" for property "${propertyName}".` }, { status: 400 });
    }

    // Type coercion for newValue based on propertyType
    let coercedNewValue: any;
    switch (propertyType) {
      case 'string':
      case 'markdown': // For now, treat markdown as simple string for batch update
      case 'image':    // For now, treat image URL as simple string
        coercedNewValue = String(newValue);
        break;
      case 'number':
      case 'rating': // Rating is also a number
        coercedNewValue = parseFloat(newValue);
        if (isNaN(coercedNewValue)) {
          return NextResponse.json({ error: `Invalid number value "${newValue}" for property "${propertyName}".` }, { status: 400 });
        }
        if (propertyType === 'rating' && (coercedNewValue < 0 || coercedNewValue > 5 || !Number.isInteger(coercedNewValue) )) {
             return NextResponse.json({ error: `Rating value must be an integer between 0 and 5.` }, { status: 400 });
        }
        break;
      case 'boolean':
        coercedNewValue = Boolean(newValue);
        break;
      // Date and Relationship types might need more complex handling or dedicated UI/logic
      // For now, they are not included in the simple batch update
      default:
        return NextResponse.json({ error: `Batch updates for property type "${propertyType}" are not currently supported.` }, { status: 400 });
    }
    
    // Uniqueness check: Basic check - if multiple objects are updated to the same static value
    // and the field is unique, only the first might succeed.
    // A more robust check would query if newValue already exists for other objects not in this batch.
    if (propertyToUpdate.isUnique && propertyToUpdate.type === 'string' && objectIds.length > 1) {
      // This is a simplified warning. A real implementation might pre-check or handle errors per object.
      console.warn(`Batch updating a unique string field ('${propertyName}') for multiple objects with the same value ('${coercedNewValue}'). This may lead to uniqueness constraint violations for subsequent objects if the value isn't already unique per object.`);
    }


    await db.run('BEGIN TRANSACTION');
    let updatedCount = 0;
    const errors: string[] = [];

    for (const objectId of objectIds) {
      const existingObject: DataObject | undefined = await db.get('SELECT data FROM data_objects WHERE id = ? AND model_id = ?', objectId, modelId);
      if (!existingObject) {
        errors.push(`Object with ID ${objectId} not found.`);
        continue;
      }

      const currentData = JSON.parse(existingObject.data);
      
      // If isUnique is true, we need to ensure the new value doesn't conflict with OTHER objects.
      if (propertyToUpdate.isUnique && propertyToUpdate.type === 'string') {
        const conflictingObject = await db.get(
          `SELECT id FROM data_objects WHERE model_id = ? AND id != ? AND json_extract(data, '$.${propertyName}') = ?`,
          modelId,
          objectId,
          coercedNewValue
        );
        if (conflictingObject) {
          errors.push(`Object ID ${objectId}: Value '${coercedNewValue}' for unique property '${propertyName}' already exists in another object (ID: ${conflictingObject.id}).`);
          continue; 
        }
      }
      
      const newData = { ...currentData, [propertyName]: coercedNewValue };

      try {
        await db.run(
          'UPDATE data_objects SET data = ? WHERE id = ? AND model_id = ?',
          JSON.stringify(newData),
          objectId,
          modelId
        );
        updatedCount++;
      } catch (err: any) {
         errors.push(`Object ID ${objectId}: Failed to update - ${err.message}`);
      }
    }

    if (errors.length > 0 && updatedCount < objectIds.length) {
      // Decide on rollback or partial commit. For simplicity, let's try to commit successful ones.
      // For critical operations, a full rollback on any error might be preferred.
      await db.run('COMMIT'); // Or ROLLBACK if all-or-nothing is desired
      return NextResponse.json({ 
        message: `Batch update partially completed. ${updatedCount} of ${objectIds.length} objects updated.`,
        errors 
      }, { status: errors.length === objectIds.length ? 400 : 207 }); // 207 Multi-Status
    }
    
    await db.run('COMMIT');
    return NextResponse.json({ message: `Successfully updated ${updatedCount} objects.` });

  } catch (error: any) {
    const db = await getDb();
    await db.run('ROLLBACK'); // Ensure rollback on unexpected errors
    console.error('Batch Update API Error:', error);
    return NextResponse.json({ error: 'Failed to perform batch update', details: error.message }, { status: 500 });
  }
}

