

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import type { Model, DataObject } from '@/lib/types';
import { getObjectDisplayValue } from '@/lib/utils';

interface Params {
  params: { propertyName: string };
}

export async function GET(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { propertyName } = params;
  const { searchParams } = new URL(request.url);
  const modelName = searchParams.get('modelName');
  const searchTerm = searchParams.get('searchTerm') || '';

  if (!propertyName || !modelName) {
    return NextResponse.json({ error: 'Property name and model name are required' }, { status: 400 });
  }

  try {
    const db = await getDb();
    
    // 1. Find the model ID from the model name
    const model = await db.get<Model>('SELECT * FROM models WHERE name = ?', modelName);
    if (!model) {
      return NextResponse.json({ error: `Model "${modelName}" not found` }, { status: 404 });
    }
    model.properties = await db.all('SELECT * FROM properties WHERE model_id = ?', model.id);

    // --- Permission Check ---
    if (!currentUser.permissionIds.includes('*') && !currentUser.permissionIds.includes(`model:view:${model.id}`)) {
        return NextResponse.json([]); // Return empty if no view permissions for this model
    }
    
    // 2. Fetch all objects of this model. This is simpler than complex JSON queries for now.
    // For very large datasets, a more optimized FTS5-based approach would be needed.
    const allObjectsForModel: DataObject[] = (await db.all(
        'SELECT id, data FROM data_objects WHERE model_id = ? AND (isDeleted = 0 OR isDeleted IS NULL)', model.id
    )).map(row => ({ id: row.id, ...JSON.parse(row.data) }));

    const allModels = await db.all<Model>('SELECT * FROM models');

    // 3. Filter in-memory
    const matchingObjects = allObjectsForModel.filter(obj => {
        const displayValue = getObjectDisplayValue(obj, model, allModels, {});
        return displayValue.toLowerCase().includes(searchTerm.toLowerCase());
    });
    
    // 4. Format and return results
    const results = matchingObjects.slice(0, 50).map(obj => ({
        id: obj.id,
        displayValue: getObjectDisplayValue(obj, model, allModels, {})
    }));

    return NextResponse.json(results);

  } catch (error: any) {
    console.error(`API Error fetching values for property ${propertyName}:`, error);
    return NextResponse.json({ error: 'Failed to fetch property values', details: error.message }, { status: 500 });
  }
}
