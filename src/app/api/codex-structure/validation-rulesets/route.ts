
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { ValidationRuleset, StructuralChangeDetail } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth';

// GET all validation rulesets
export async function GET(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  // Allow all authenticated users to GET, as this might be needed for forms
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = await getDb();
    const rulesets = await db.all('SELECT * FROM validation_rulesets ORDER BY name ASC');
    return NextResponse.json(rulesets);
  } catch (error: any) {
    console.error('API Error (GET /validation-rulesets):', error);
    return NextResponse.json({ error: 'Failed to fetch validation rulesets', details: error.message }, { status: 500 });
  }
}

// POST a new validation ruleset
export async function POST(request: Request) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || (!currentUser.permissionIds.includes('admin:manage_validation_rules') && !currentUser.permissionIds.includes('*'))) {
    const db = await getDb();
    await db.run(
      'INSERT INTO security_log (id, timestamp, userId, username, action, targetEntityType, details) VALUES (?, ?, ?, ?, ?, ?, ?)',
      crypto.randomUUID(), new Date().toISOString(), currentUser?.id || null, currentUser?.username || 'Anonymous', 'PERMISSION_DENIED',
      'ValidationRuleset', JSON.stringify({ reason: "Attempted to create validation ruleset without 'admin:manage_validation_rules' permission." })
    );
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const db = await getDb();
  await db.run('BEGIN TRANSACTION');

  try {
    const { name, description, regexPattern }: Omit<ValidationRuleset, 'id'> = await request.json();
    const currentTimestamp = new Date().toISOString();

    if (!name || name.trim() === '') {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Ruleset name cannot be empty.' }, { status: 400 });
    }
    if (!regexPattern || regexPattern.trim() === '') {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Regex pattern cannot be empty.' }, { status: 400 });
    }
    try {
      new RegExp(regexPattern);
    } catch (e: any) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Invalid regex pattern.', details: e.message }, { status: 400 });
    }

    const rulesetId = crypto.randomUUID();
    const trimmedName = name.trim();
    const trimmedRegexPattern = regexPattern.trim();

    await db.run(
      'INSERT INTO validation_rulesets (id, name, description, regexPattern) VALUES (?, ?, ?, ?)',
      rulesetId, trimmedName, description, trimmedRegexPattern
    );

    // Log structural change
    const changelogId = crypto.randomUUID();
    const createdRulesetSnapshot: Partial<ValidationRuleset> = { name: trimmedName, description, regexPattern: trimmedRegexPattern };
    await db.run(
      'INSERT INTO structural_changelog (id, timestamp, userId, entityType, entityId, entityName, action, changes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      changelogId,
      currentTimestamp,
      currentUser.id,
      'ValidationRuleset',
      rulesetId,
      trimmedName,
      'CREATE',
      JSON.stringify(createdRulesetSnapshot)
    );

    await db.run('COMMIT');

    const createdRuleset: ValidationRuleset = {
      id: rulesetId,
      name: trimmedName,
      description,
      regexPattern: trimmedRegexPattern,
    };
    return NextResponse.json(createdRuleset, { status: 201 });

  } catch (error: any) {
    await db.run('ROLLBACK');
    console.error('API Error (POST /validation-rulesets):', error);
    if (error.message && error.message.includes('UNIQUE constraint failed: validation_rulesets.name')) {
      return NextResponse.json({ error: 'A validation ruleset with this name already exists.', details: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create validation ruleset', details: error.message }, { status: 500 });
  }
}
