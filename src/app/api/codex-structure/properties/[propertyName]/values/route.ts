
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';

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

  if (!propertyName) {
    return NextResponse.json({ error: 'Property name is required' }, { status: 400 });
  }

  try {
    const db = await getDb();
    let query: string;
    const queryParams: any[] = [`$.${propertyName}`];
    
    const whereConditions = [`json_extract(data, ?) IS NOT NULL`];
    queryParams.push(`$.${propertyName}`);
    
    whereConditions.push(`(isDeleted = 0 OR isDeleted IS NULL)`);

    if (modelName) {
      const model = await db.get('SELECT id FROM models WHERE LOWER(name) = LOWER(?)', modelName.toLowerCase());
      if (model) {
        whereConditions.push('model_id = ?');
        queryParams.push(model.id);
      }
    }

    query = `
      SELECT DISTINCT json_extract(data, ?) as value
      FROM data_objects
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY value ASC
      LIMIT 25
    `;

    const rows = await db.all(query, ...queryParams);
    const values = rows
      .map(row => row.value)
      .filter(value => value !== null && value !== undefined && String(value).trim() !== '')
      .map(String);

    return NextResponse.json(values);
  } catch (error: any) {
    console.error(`API Error fetching values for property ${propertyName}:`, error);
    return NextResponse.json({ error: 'Failed to fetch property values', details: error.message }, { status: 500 });
  }
}
