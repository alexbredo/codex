
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';

interface Params {
  params: { wizardId: string };
}

// POST to start a new wizard run
export async function POST(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { wizardId } = params;

  try {
    const db = await getDb();

    // Check if the wizard exists
    const wizardExists = await db.get('SELECT id FROM wizards WHERE id = ?', wizardId);
    if (!wizardExists) {
      return NextResponse.json({ error: 'Wizard not found' }, { status: 404 });
    }

    const runId = `run_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    await db.run(
      'INSERT INTO wizard_runs (id, wizardId, userId, status, currentStepIndex, stepData, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      runId,
      wizardId,
      currentUser.id,
      'IN_PROGRESS',
      -1, // Start before the first step (index 0)
      JSON.stringify({}), // Empty step data
      now,
      now
    );

    return NextResponse.json({ runId }, { status: 201 });
  } catch (error: any) {
    console.error(`API Error (POST /wizards/${wizardId}/start):`, error);
    return NextResponse.json({ error: 'Failed to start wizard run', details: error.message }, { status: 500 });
  }
}
