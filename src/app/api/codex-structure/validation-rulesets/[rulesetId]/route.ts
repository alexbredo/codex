
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { ValidationRuleset } from '@/lib/types';
import { getCurrentUserFromCookie } from '@/lib/auth';

interface Params {
  params: { rulesetId: string };
}

// GET a single validation ruleset by ID
export async function GET(request: Request, { params }: Params) {
 const currentUser = await getCurrentUserFromCookie();
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const db = await getDb();
    const ruleset = await db.get('SELECT * FROM validation_rulesets WHERE id = ?', params.rulesetId);

    if (!ruleset) {
      return NextResponse.json({ error: 'Validation ruleset not found' }, { status: 404 });
    }
    return NextResponse.json(ruleset);
  } catch (error: any) {
    console.error(`API Error (GET /validation-rulesets/${params.rulesetId}):`, error);
    return NextResponse.json({ error: 'Failed to fetch validation ruleset', details: error.message }, { status: 500 });
  }
}

// PUT (update) an existing validation ruleset
export async function PUT(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { name, description, regexPattern }: Partial<Omit<ValidationRuleset, 'id'>> = await request.json();
    const db = await getDb();
    const rulesetId = params.rulesetId;

    const existingRuleset = await db.get('SELECT * FROM validation_rulesets WHERE id = ?', rulesetId);
    if (!existingRuleset) {
      return NextResponse.json({ error: 'Validation ruleset not found' }, { status: 404 });
    }

    if (name && name.trim() === '') {
      return NextResponse.json({ error: 'Ruleset name cannot be empty.' }, { status: 400 });
    }
    if (regexPattern && regexPattern.trim() === '') {
      return NextResponse.json({ error: 'Regex pattern cannot be empty.' }, { status: 400 });
    }
    if (regexPattern) {
        try {
            new RegExp(regexPattern);
        } catch (e: any) {
            return NextResponse.json({ error: 'Invalid regex pattern.', details: e.message }, { status: 400 });
        }
    }
    
    const finalName = name?.trim() ?? existingRuleset.name;
    const finalDescription = description ?? existingRuleset.description;
    const finalRegexPattern = regexPattern?.trim() ?? existingRuleset.regexPattern;

    await db.run(
      'UPDATE validation_rulesets SET name = ?, description = ?, regexPattern = ? WHERE id = ?',
      finalName, finalDescription, finalRegexPattern, rulesetId
    );

    const updatedRuleset: ValidationRuleset = {
      id: rulesetId,
      name: finalName,
      description: finalDescription,
      regexPattern: finalRegexPattern,
    };
    return NextResponse.json(updatedRuleset);

  } catch (error: any) {
    console.error(`API Error (PUT /validation-rulesets/${params.rulesetId}):`, error);
    if (error.message && error.message.includes('UNIQUE constraint failed: validation_rulesets.name')) {
      return NextResponse.json({ error: 'A validation ruleset with this name already exists.', details: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to update validation ruleset', details: error.message }, { status: 500 });
  }
}

// DELETE a validation ruleset
export async function DELETE(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser || currentUser.role !== 'administrator') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const db = await getDb();
    const rulesetId = params.rulesetId;

    // Check if ruleset is in use by any properties
    const propertyUsingRuleset = await db.get('SELECT id FROM properties WHERE validationRulesetId = ?', rulesetId);
    if (propertyUsingRuleset) {
      return NextResponse.json({ 
        error: 'Cannot delete validation ruleset. It is currently assigned to one or more model properties. Please unassign it first.' 
      }, { status: 409 });
    }

    const result = await db.run('DELETE FROM validation_rulesets WHERE id = ?', rulesetId);
    if (result.changes === 0) {
      return NextResponse.json({ error: 'Validation ruleset not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Validation ruleset deleted successfully' });
  } catch (error: any) {
    console.error(`API Error (DELETE /validation-rulesets/${params.rulesetId}):`, error);
    return NextResponse.json({ error: 'Failed to delete validation ruleset', details: error.message }, { status: 500 });
  }
}
