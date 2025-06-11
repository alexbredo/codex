
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Model, DataObject, Property, ExportedModelBundle } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth';
import { format } from 'date-fns';

interface Params {
  params: { modelId: string };
}

export async function GET(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { modelId } = params;

  try {
    const db = await getDb();

    // Fetch model details
    const modelRow = await db.get('SELECT * FROM models WHERE id = ?', modelId);
    if (!modelRow) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    const propertiesFromDb = await db.all('SELECT * FROM properties WHERE model_id = ? ORDER BY orderIndex ASC', modelId);
    let parsedDisplayPropertyNames: string[] = [];
    if (modelRow.displayPropertyNames && typeof modelRow.displayPropertyNames === 'string') {
        try {
            const tempParsed = JSON.parse(modelRow.displayPropertyNames);
            if (Array.isArray(tempParsed)) {
                parsedDisplayPropertyNames = tempParsed.filter(name => typeof name === 'string');
            }
        } catch (parseError: any) {
            console.warn(`API (Export Model): Could not parse displayPropertyNames for model ${modelRow.id}: '${modelRow.displayPropertyNames}'. Error: ${parseError.message}`);
        }
    }
    const model: Model = {
      id: modelRow.id,
      name: modelRow.name,
      description: modelRow.description,
      namespace: modelRow.namespace || 'Default',
      displayPropertyNames: parsedDisplayPropertyNames,
      properties: propertiesFromDb.map(p_row => ({
        id: p_row.id,
        model_id: p_row.model_id,
        name: p_row.name,
        type: p_row.type,
        relatedModelId: p_row.relatedModelId,
        required: !!p_row.required,
        relationshipType: p_row.relationshipType,
        unit: p_row.unit,
        precision: p_row.precision,
        autoSetOnCreate: !!p_row.autoSetOnCreate,
        autoSetOnUpdate: !!p_row.autoSetOnUpdate,
        isUnique: !!p_row.isUnique,
        orderIndex: p_row.orderIndex,
        defaultValue: p_row.defaultValue,
        validationRulesetId: p_row.validationRulesetId ?? null,
        minValue: p_row.minValue ?? null,
        maxValue: p_row.maxValue ?? null,
      }) as Property),
      workflowId: modelRow.workflowId ?? null,
    };

    // Fetch data objects for the model (active ones only)
    const objectRows = await db.all('SELECT id, data, currentStateId, ownerId, createdAt, updatedAt, isDeleted, deletedAt FROM data_objects WHERE model_id = ? AND (isDeleted = 0 OR isDeleted IS NULL)', modelId);
    const dataObjects: DataObject[] = objectRows.map(row => {
      const parsedData = JSON.parse(row.data);
      return {
        id: row.id,
        currentStateId: row.currentStateId,
        ownerId: row.ownerId,
        // createdAt and updatedAt are inside the JSON blob, no need to map row.createdAt/updatedAt directly here
        // unless we decide to change how they are stored/retrieved.
        // The ...parsedData will correctly bring them if they exist in the blob.
        ...parsedData,
        isDeleted: false, // Explicitly set as we are fetching non-deleted items
        deletedAt: null,
      };
    });

    const exportBundle: ExportedModelBundle = {
      model,
      dataObjects,
    };

    const timestamp = format(new Date(), 'yyyyMMddHHmmss');
    const filename = `${model.name.replace(/[^a-z0-9]/gi, '_')}_export_${timestamp}.json`;

    return new NextResponse(JSON.stringify(exportBundle, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error: any) {
    console.error(`API Error - Failed to export model ${modelId}:`, error);
    return NextResponse.json({ error: 'Failed to export model data', details: error.message }, { status: 500 });
  }
}
