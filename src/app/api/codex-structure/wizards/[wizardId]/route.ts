

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Wizard, WizardStep } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth';

interface Params {
  params: { wizardId: string };
}

// GET a single wizard by ID
export async function GET(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || !currentUser.permissionIds.includes('admin:manage_wizards')) {
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
        propertyIds: JSON.parse(s.propertyIds || '[]')
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
    if (!currentUser || !currentUser.permissionIds.includes('admin:manage_wizards')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const db = await getDb();
    await db.run('BEGIN TRANSACTION');

    try {
        const { name, description, steps }: Omit<Wizard, 'id'> & { steps: Array<Omit<WizardStep, 'wizardId'> & {id?: string}> } = await request.json();
        const { wizardId } = params;

        const existingWizard = await db.get('SELECT id FROM wizards WHERE id = ?', wizardId);
        if (!existingWizard) {
            await db.run('ROLLBACK');
            return NextResponse.json({ error: 'Wizard not found' }, { status: 404 });
        }

        await db.run('UPDATE wizards SET name = ?, description = ? WHERE id = ?', name.trim(), description, wizardId);

        // Simple strategy: delete existing steps and re-insert new ones
        await db.run('DELETE FROM wizard_steps WHERE wizardId = ?', wizardId);

        const insertedSteps: WizardStep[] = [];
        for (const step of steps) {
            const stepId = step.id || crypto.randomUUID();
            await db.run(
                'INSERT INTO wizard_steps (id, wizardId, modelId, orderIndex, instructions, propertyIds) VALUES (?, ?, ?, ?, ?, ?)',
                stepId, wizardId, step.modelId, step.orderIndex, step.instructions, JSON.stringify(step.propertyIds)
            );
            insertedSteps.push({ ...step, id: stepId, wizardId });
        }
        
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
    if (!currentUser || !currentUser.permissionIds.includes('admin:manage_wizards')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const db = await getDb();
    await db.run('BEGIN TRANSACTION');

    try {
        const { wizardId } = params;
        // CASCADE delete will handle steps
        const result = await db.run('DELETE FROM wizards WHERE id = ?', wizardId);

        if (result.changes === 0) {
            await db.run('ROLLBACK');
            return NextResponse.json({ error: 'Wizard not found' }, { status: 404 });
        }
        
        await db.run('COMMIT');
        return NextResponse.json({ message: 'Wizard deleted successfully' });
    } catch (error: any) {
        await db.run('ROLLBACK');
        console.error(`API Error (DELETE /wizards/${params.wizardId}):`, error);
        return NextResponse.json({ error: 'Failed to delete wizard', details: error.message }, { status: 500 });
    }
}
