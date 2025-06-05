
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { ValidationRuleset } from '@/lib/types';
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
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { name, description, regexPattern }: Omit<ValidationRuleset, 'id'> = await request.json();
    const db = await getDb();

    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'Ruleset name cannot be empty.' }, { status: 400 });
    }
    if (!regexPattern || regexPattern.trim() === '') {
      return NextResponse.json({ error: 'Regex pattern cannot be empty.' }, { status: 400 });
    }
    try {
      new RegExp(regexPattern);
    } catch (e: any) {
      return NextResponse.json({ error: 'Invalid regex pattern.', details: e.message }, { status: 400 });
    }

    const rulesetId = crypto.randomUUID();
    await db.run(
      'INSERT INTO validation_rulesets (id, name, description, regexPattern) VALUES (?, ?, ?, ?)',
      rulesetId, name.trim(), description, regexPattern.trim()
    );

    const createdRuleset: ValidationRuleset = {
      id: rulesetId,
      name: name.trim(),
      description,
      regexPattern: regexPattern.trim(),
    };
    return NextResponse.json(createdRuleset, { status: 201 });

  } catch (error: any) {
    console.error('API Error (POST /validation-rulesets):', error);
    if (error.message && error.message.includes('UNIQUE constraint failed: validation_rulesets.name')) {
      return NextResponse.json({ error: 'A validation ruleset with this name already exists.', details: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create validation ruleset', details: error.message }, { status: 500 });
  }
}
