
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import type { WizardRunSummary } from '@/lib/types';

// GET all in-progress wizard runs for the current user
export async function GET(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = await getDb();
    const runs: WizardRunSummary[] = await db.all(`
      SELECT
        wr.id,
        wr.wizardId,
        w.name as wizardName,
        wr.status,
        wr.currentStepIndex,
        wr.updatedAt,
        wr.stepData
      FROM wizard_runs wr
      JOIN wizards w ON wr.wizardId = w.id
      WHERE wr.userId = ? AND wr.status = 'IN_PROGRESS'
      ORDER BY wr.updatedAt DESC
    `, currentUser.id);

    return NextResponse.json(runs);
  } catch (error: any) {
    console.error(`API Error (GET /wizards/runs):`, error);
    return NextResponse.json({ error: 'Failed to fetch active wizard runs', details: error.message }, { status: 500 });
  }
}
