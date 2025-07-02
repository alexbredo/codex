
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Wizard, WizardStep, PropertyMapping, StructuralChangeDetail } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth';

// GET all wizards
export async function GET(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || (!currentUser.permissionIds.includes('admin:manage_wizards') && !currentUser.permissionIds.includes('*'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const db = await getDb();
    const wizardsFromDb = await db.all('SELECT * FROM wizards ORDER BY name ASC');
    const allStepsFromDb = await db.all('SELECT * FROM wizard_steps ORDER BY wizardId, orderIndex ASC');
    
    const wizards: Wizard[] = wizardsFromDb.map(w => ({
        ...w,
        steps: allStepsFromDb
            .filter(s => s.wizardId === w.id)
            .map(s => ({
                ...s,
                stepType: s.step_type || 'create',
                propertyIds: JSON.parse(s.propertyIds || '[]') as string[],
                propertyMappings: JSON.parse(s.propertyMappings || '[]') as PropertyMapping[],
            }))
    }));
    
    return NextResponse.json(wizards);
  } catch (error: any) {
    console.error('API Error (GET /wizards):', error);
    return NextResponse.json({ error: 'Failed to fetch wizards', details: error.message }, { status: 500 });
  }
}

// POST a new wizard
export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || (!currentUser.permissionIds.includes('admin:manage_wizards') && !currentUser.permissionIds.includes('*'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const db = await getDb();
  await db.run('BEGIN TRANSACTION');

  try {
    const { name, description, steps }: Omit<Wizard, 'id'> = await request.json();
    const wizardId = crypto.randomUUID();
    const currentTimestamp = new Date().toISOString();

    if (!name || name.trim() === '') {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: 'Wizard name cannot be empty.' }, { status: 400 });
    }

    await db.run('INSERT INTO wizards (id, name, description) VALUES (?, ?, ?)', wizardId, name.trim(), description);

    for (const step of steps) {
        const stepId = crypto.randomUUID();
        await db.run(
            'INSERT INTO wizard_steps (id, wizardId, modelId, step_type, orderIndex, instructions, propertyIds, propertyMappings) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            stepId, wizardId, step.modelId, step.stepType || 'create', step.orderIndex, step.instructions, JSON.stringify(step.propertyIds), JSON.stringify(step.propertyMappings || [])
        );
    }
    
    // Log creation
    const changelogDetails: StructuralChangeDetail[] = [
      { field: 'name', newValue: name.trim() },
      { field: 'description', newValue: description },
      { field: 'steps', newValue: steps.map(s => ({ modelId: s.modelId, order: s.orderIndex })) },
    ];
    await db.run(
        'INSERT INTO structural_changelog (id, timestamp, userId, entityType, entityId, entityName, action, changes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        crypto.randomUUID(),
        currentTimestamp,
        currentUser.id,
        'Wizard',
        wizardId,
        name.trim(),
        'CREATE',
        JSON.stringify(changelogDetails)
    );
    
    await db.run('COMMIT');

    const createdWizard: Wizard = {
        id: wizardId,
        name: name.trim(),
        description,
        steps,
    };
    return NextResponse.json(createdWizard, { status: 201 });

  } catch (error: any) {
    await db.run('ROLLBACK');
    console.error('API Error (POST /wizards):', error);
    if (error.message.includes('UNIQUE constraint failed: wizards.name')) {
      return NextResponse.json({ error: 'A wizard with this name already exists.', details: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create wizard', details: error.message }, { status: 500 });
  }
}
