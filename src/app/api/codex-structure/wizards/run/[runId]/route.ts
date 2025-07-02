
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import type { Wizard, WizardRun, WizardRunState } from '@/lib/types';

interface Params {
  params: { runId: string };
}

// GET the current state of a wizard run
export async function GET(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = await getDb();
    const run: WizardRun | undefined = await db.get('SELECT * FROM wizard_runs WHERE id = ?', params.runId);

    if (!run) {
      return NextResponse.json({ error: 'Wizard run not found' }, { status: 404 });
    }

    if (run.userId !== currentUser.id && !currentUser.permissionIds.includes('*')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const wizard: Wizard | undefined = await db.get('SELECT * FROM wizards WHERE id = ?', run.wizardId);
    if (!wizard) {
      return NextResponse.json({ error: 'Associated wizard definition not found' }, { status: 404 });
    }
    
    wizard.steps = await db.all('SELECT * FROM wizard_steps WHERE wizardId = ? ORDER BY orderIndex ASC', wizard.id);
    wizard.steps.forEach(step => {
        step.propertyIds = JSON.parse(step.propertyIds || '[]');
        step.propertyMappings = JSON.parse(step.propertyMappings || '[]');
    });

    const runState: WizardRunState = {
      ...run,
      stepData: JSON.parse(run.stepData || '{}'),
      wizard,
    };

    return NextResponse.json(runState);
  } catch (error: any) {
    console.error(`API Error (GET /wizards/run/${params.runId}):`, error);
    return NextResponse.json({ error: 'Failed to fetch wizard run state', details: error.message }, { status: 500 });
  }
}

// DELETE to abandon a wizard run
export async function DELETE(request: Request, { params }: Params) {
    const currentUser = await getCurrentUserFromCookie();
    if (!currentUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const db = await getDb();
        const run: WizardRun | undefined = await db.get('SELECT * FROM wizard_runs WHERE id = ?', params.runId);

        if (!run) {
            return NextResponse.json({ error: 'Wizard run not found' }, { status: 404 });
        }

        if (run.userId !== currentUser.id && !currentUser.permissionIds.includes('*')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        await db.run('DELETE FROM wizard_runs WHERE id = ?', params.runId);

        return NextResponse.json({ message: 'Wizard run abandoned successfully.' });
    } catch (error: any) {
        console.error(`API Error (DELETE /wizards/run/${params.runId}):`, error);
        return NextResponse.json({ error: 'Failed to abandon wizard run', details: error.message }, { status: 500 });
    }
}

