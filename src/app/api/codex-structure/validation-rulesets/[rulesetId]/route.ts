
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { ValidationRuleset, StructuralChangeDetail } from '@/lib/types';
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
  if (!currentUser || (!currentUser.permissionIds.includes('admin:manage_validation_rules') && !currentUser.permissionIds.includes('*'))) {
    const db = await getDb();
    await db.run(
      'INSERT INTO security_log (id, timestamp, userId, username, action, targetEntityType, targetEntityId, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      crypto.randomUUID(), new Date().toISOString(), currentUser?.id || null, currentUser?.username || 'Anonymous', 'PERMISSION_DENIED',
      'ValidationRuleset', params.rulesetId, JSON.stringify({ reason: "Attempted to update validation ruleset without 'admin:manage_validation_rules' permission." })
    );
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const db = await getDb();
  await db.run('BEGIN TRANSACTION');

  try {
    const { name, description, regexPattern }: Partial<Omit<ValidationRuleset, 'id'>> = await request.json();
    const rulesetId = params.rulesetId;
    const currentTimestamp = new Date().toISOString();

    const existingRuleset = await db.get('SELECT * FROM validation_rulesets WHERE id = ?', rulesetId);
    if (!existingRuleset) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Validation ruleset not found' }, { status: 404 });
    }

    const changesDetail: StructuralChangeDetail[] = [];
    let finalName = existingRuleset.name;
    let finalDescription = existingRuleset.description;
    let finalRegexPattern = existingRuleset.regexPattern;

    if (name !== undefined && name.trim() !== existingRuleset.name) {
      if (name.trim() === '') {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: 'Ruleset name cannot be empty.' }, { status: 400 });
      }
      changesDetail.push({ field: 'name', oldValue: existingRuleset.name, newValue: name.trim() });
      finalName = name.trim();
    }

    if (description !== undefined && description !== existingRuleset.description) {
      changesDetail.push({ field: 'description', oldValue: existingRuleset.description, newValue: description });
      finalDescription = description;
    }
    
    if (regexPattern !== undefined && regexPattern.trim() !== existingRuleset.regexPattern) {
      if (regexPattern.trim() === '') {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: 'Regex pattern cannot be empty.' }, { status: 400 });
      }
      try {
          new RegExp(regexPattern.trim());
      } catch (e: any) {
          await db.run('ROLLBACK');
          return NextResponse.json({ error: 'Invalid regex pattern.', details: e.message }, { status: 400 });
      }
      changesDetail.push({ field: 'regexPattern', oldValue: existingRuleset.regexPattern, newValue: regexPattern.trim() });
      finalRegexPattern = regexPattern.trim();
    }
    
    if (changesDetail.length > 0) {
        await db.run(
        'UPDATE validation_rulesets SET name = ?, description = ?, regexPattern = ? WHERE id = ?',
        finalName, finalDescription, finalRegexPattern, rulesetId
        );

        const changelogId = crypto.randomUUID();
        await db.run(
        'INSERT INTO structural_changelog (id, timestamp, userId, entityType, entityId, entityName, action, changes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        changelogId,
        currentTimestamp,
        currentUser.id,
        'ValidationRuleset',
        rulesetId,
        finalName, // Use new name for logging
        'UPDATE',
        JSON.stringify(changesDetail)
        );
    }
    
    await db.run('COMMIT');

    const updatedRuleset: ValidationRuleset = {
      id: rulesetId,
      name: finalName,
      description: finalDescription,
      regexPattern: finalRegexPattern,
    };
    return NextResponse.json(updatedRuleset);

  } catch (error: any) {
    await db.run('ROLLBACK');
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
  if (!currentUser || (!currentUser.permissionIds.includes('admin:manage_validation_rules') && !currentUser.permissionIds.includes('*'))) {
    const db = await getDb();
    await db.run(
      'INSERT INTO security_log (id, timestamp, userId, username, action, targetEntityType, targetEntityId, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      crypto.randomUUID(), new Date().toISOString(), currentUser?.id || null, currentUser?.username || 'Anonymous', 'PERMISSION_DENIED',
      'ValidationRuleset', params.rulesetId, JSON.stringify({ reason: "Attempted to delete validation ruleset without 'admin:manage_validation_rules' permission." })
    );
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const db = await getDb();
  await db.run('BEGIN TRANSACTION');

  try {
    const rulesetId = params.rulesetId;
    const currentTimestamp = new Date().toISOString();

    const rulesetToDelete = await db.get('SELECT * FROM validation_rulesets WHERE id = ?', rulesetId);
    if (!rulesetToDelete) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Validation ruleset not found' }, { status: 404 });
    }

    // Check if ruleset is in use by any properties
    const propertyUsingRuleset = await db.get('SELECT id FROM properties WHERE validationRulesetId = ?', rulesetId);
    if (propertyUsingRuleset) {
      await db.run('ROLLBACK');
      return NextResponse.json({ 
        error: 'Cannot delete validation ruleset. It is currently assigned to one or more model properties. Please unassign it first.' 
      }, { status: 409 });
    }

    const result = await db.run('DELETE FROM validation_rulesets WHERE id = ?', rulesetId);
    if (result.changes === 0) {
      await db.run('ROLLBACK'); // Should be caught by initial check, but for safety
      return NextResponse.json({ error: 'Validation ruleset not found' }, { status: 404 });
    }

    // Log structural change
    const changelogId = crypto.randomUUID();
    const deletedRulesetSnapshot: Partial<ValidationRuleset> = { name: rulesetToDelete.name, description: rulesetToDelete.description, regexPattern: rulesetToDelete.regexPattern };
    await db.run(
      'INSERT INTO structural_changelog (id, timestamp, userId, entityType, entityId, entityName, action, changes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      changelogId,
      currentTimestamp,
      currentUser.id,
      'ValidationRuleset',
      rulesetId,
      rulesetToDelete.name,
      'DELETE',
      JSON.stringify(deletedRulesetSnapshot)
    );

    await db.run('COMMIT');
    return NextResponse.json({ message: 'Validation ruleset deleted successfully' });
  } catch (error: any) {
    await db.run('ROLLBACK');
    console.error(`API Error (DELETE /validation-rulesets/${params.rulesetId}):`, error);
    return NextResponse.json({ error: 'Failed to delete validation ruleset', details: error.message }, { status: 500 });
  }
}
