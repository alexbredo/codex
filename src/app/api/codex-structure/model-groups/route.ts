
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { ModelGroup } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth'; // Auth helper

// GET all model groups
export async function GET(request: Request) {
  // No specific role check for listing groups, as viewers might need this for context.
  try {
    const db = await getDb();
    const groups = await db.all('SELECT * FROM model_groups ORDER BY name ASC');
    return NextResponse.json(groups);
  } catch (error: any) {
    console.error('API Error - Failed to fetch model groups:', {
        message: error.message,
        stack: error.stack,
    });
    return NextResponse.json({ error: 'Failed to fetch model groups', details: error.message }, { status: 500 });
  }
}

// POST a new model group
export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { name, description }: Omit<ModelGroup, 'id'> = await request.json();
    const db = await getDb();
    const groupId = crypto.randomUUID();

    if (!name || name.trim() === '') {
        return NextResponse.json({ error: 'Group name cannot be empty.' }, { status: 400 });
    }
    if (name.trim().toLowerCase() === 'default') {
        return NextResponse.json({ error: '"Default" is a reserved name and cannot be used for a model group.' }, { status: 400 });
    }


    await db.run(
      'INSERT INTO model_groups (id, name, description) VALUES (?, ?, ?)',
      groupId,
      name.trim(),
      description
    );
    
    const createdGroup: ModelGroup = { id: groupId, name: name.trim(), description };
    return NextResponse.json(createdGroup, { status: 201 });
  } catch (error: any) {
    console.error(`API Error - Failed to create model group. Message: ${error.message}, Stack: ${error.stack}`, error);
    if (error.message && error.message.includes('UNIQUE constraint failed: model_groups.name')) {
      return NextResponse.json({ error: 'A model group with this name already exists.', details: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create model group', details: error.message }, { status: 500 });
  }
}
