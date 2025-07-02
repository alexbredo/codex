
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Wizard, WizardStep, PropertyMapping, StructuralChangeDetail } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth';

interface Params {
  params: { wizardId: string };
}

// GET a single wizard by ID
export async function GET(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || (!currentUser.permissionIds.includes('admin:manage_wizards') && !currentUser.permissionIds.includes('*'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  
  try {
    const db = await getDb();
    const wizardRow = await db.get('SELECT * FROM wizards WHERE id = ?', params.wizardId);
    if (!wizardRow) {
      return NextResponse.json({ error: 'Wizard not found' }, { status: 404 });
    }

    const stepsFromDb = await db.all('SELECT * FROM wizard_steps WHERE wizardId = ? ORDER BY orderIndex ASC', params.wizardId);
    const steps: WizardStep[] = stepsFromDb.map(s => ({
        ...s,
        stepType: s.step_type,
        propertyIds: JSON.parse(s.propertyIds || '[]'),
        propertyMappings: JSON.parse(s.propertyMappings || '[]'),
    }));

    const wizard: Wizard = { ...wizardRow, steps };
    return NextResponse.json(wizard);
  } catch (error: any) {
    console.error(`API Error (GET /wizards/${params.wizardId}):`, error);
    return NextResponse.json({ error: 'Failed to fetch wizard', details: error.message }, { status: 500 });
  }
}

// PUT (update) an existing wizard
export async function PUT(request: Request, { params }: Params) {
    const currentUser = await getCurrentUserFromCookie();
    if (!currentUser || (!currentUser.permissionIds.includes('admin:manage_wizards') && !currentUser.permissionIds.includes('*'))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const db = await getDb();
    await db.run('BEGIN TRANSACTION');

    try {
        const { name, description, steps }: Omit<Wizard, 'id'> & { steps: Array<Omit<WizardStep, 'wizardId' | 'stepType'> & {id?: string; stepType: 'create' | 'lookup'}> } = await request.json();
        const { wizardId } = params;
        const currentTimestamp = new Date().toISOString();

        const existingWizard = await db.get('SELECT * FROM wizards WHERE id = ?', wizardId);
        if (!existingWizard) {
            await db.run('ROLLBACK');
            return NextResponse.json({ error: 'Wizard not found' }, { status: 404 });
        }

        await db.run('UPDATE wizards SET name = ?, description = ? WHERE id = ?', name.trim(), description, wizardId);

        // Simple strategy: delete existing steps and re-insert new ones
        await db.run('DELETE FROM wizard_steps WHERE wizardId = ?', wizardId);

        const insertedSteps: WizardStep[] = [];
        for (const step of steps) {
            const stepId = step.id && !step.id.startsWith('temp-') ? step.id : crypto.randomUUID();
            await db.run(
                'INSERT INTO wizard_steps (id, wizardId, modelId, step_type, orderIndex, instructions, propertyIds, propertyMappings) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                stepId, wizardId, step.modelId, step.stepType || 'create', step.orderIndex, step.instructions, JSON.stringify(step.propertyIds), JSON.stringify(step.propertyMappings || [])
            );
            insertedSteps.push({ ...step, id: stepId, wizardId });
        }
        
        // Log structural change for wizard update
        const changes: StructuralChangeDetail[] = [];
        if (name.trim() !== existingWizard.name) changes.push({ field: 'name', oldValue: existingWizard.name, newValue: name.trim() });
        if (description !== existingWizard.description) changes.push({ field: 'description', oldValue: existingWizard.description, newValue: description });
        changes.push({ field: 'steps', oldValue: 'complex_change', newValue: 'complex_change' }); // Indicate steps were modified
        
        await db.run(
            'INSERT INTO structural_changelog (id, timestamp, userId, entityType, entityId, entityName, action, changes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            crypto.randomUUID(),
            currentTimestamp,
            currentUser.id,
            'Wizard',
            wizardId,
            name.trim(),
            'UPDATE',
            JSON.stringify(changes)
        );

        await db.run('COMMIT');

        const updatedWizard: Wizard = { id: wizardId, name: name.trim(), description, steps: insertedSteps };
        return NextResponse.json(updatedWizard);

    } catch (error: any) {
        await db.run('ROLLBACK');
        console.error(`API Error (PUT /wizards/${params.wizardId}):`, error);
        if (error.message.includes('UNIQUE constraint failed: wizards.name')) {
            return NextResponse.json({ error: 'A wizard with this name already exists.', details: error.message }, { status: 409 });
        }
        return NextResponse.json({ error: 'Failed to update wizard', details: error.message }, { status: 500 });
    }
}

// DELETE a wizard
export async function DELETE(request: Request, { params }: Params) {
    const currentUser = await getCurrentUserFromCookie();
    if (!currentUser || (!currentUser.permissionIds.includes('admin:manage_wizards') && !currentUser.permissionIds.includes('*'))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const db = await getDb();
    await db.run('BEGIN TRANSACTION');

    try {
        const { wizardId } = params;
        const currentTimestamp = new Date().toISOString();

        const wizardToDelete = await db.get('SELECT * FROM wizards WHERE id = ?', wizardId);
        if (!wizardToDelete) {
            await db.run('ROLLBACK');
            return NextResponse.json({ error: 'Wizard not found' }, { status: 404 });
        }

        // CASCADE delete will handle steps
        const result = await db.run('DELETE FROM wizards WHERE id = ?', wizardId);

        if (result.changes === 0) {
            await db.run('ROLLBACK');
            return NextResponse.json({ error: 'Wizard not found' }, { status: 404 });
        }

        // Log deletion
        await db.run(
            'INSERT INTO structural_changelog (id, timestamp, userId, entityType, entityId, entityName, action, changes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            crypto.randomUUID(),
            currentTimestamp,
            currentUser.id,
            'Wizard',
            wizardId,
            wizardToDelete.name,
            'DELETE',
            JSON.stringify({ snapshot: wizardToDelete })
        );
        
        await db.run('COMMIT');
        return NextResponse.json({ message: 'Wizard deleted successfully' });
    } catch (error: any) {
        await db.run('ROLLBACK');
        console.error(`API Error (DELETE /wizards/${params.wizardId}):`, error);
        return NextResponse.json({ error: 'Failed to delete wizard', details: error.message }, { status: 500 });
    }
}
