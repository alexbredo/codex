

'use server';

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import type { WizardRun, Wizard, ChangelogEventData, PropertyMapping, Property, ValidationRuleset } from '@/lib/types';
import { z } from 'zod';

interface Params {
  params: { runId: string };
}

const stepSubmissionSchema = z.object({
  stepIndex: z.number().int(),
  stepType: z.enum(['create', 'lookup']),
  formData: z.record(z.any()).optional(),
  lookupObjectId: z.string().optional(),
});

const INTERNAL_MAPPING_OBJECT_ID_KEY = "__OBJECT_ID__";

export async function POST(request: Request, { params }: Params) {
  const currentUser = await getCurrentUserFromCookie();
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { runId } = params;
  const db = await getDb();
  await db.run('BEGIN');

  try {
    const body = await request.json();
    const validation = stepSubmissionSchema.safeParse(body);
    if (!validation.success) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }
    const { stepIndex, stepType, formData, lookupObjectId } = validation.data;
    
    const run: WizardRun | undefined = await db.get('SELECT * FROM wizard_runs WHERE id = ?', runId);
    if (!run) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Wizard run not found' }, { status: 404 });
    }
    if (run.userId !== currentUser.id && !currentUser.permissionIds.includes('*')) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (run.status !== 'IN_PROGRESS') {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: `Wizard run has already been ${run.status.toLowerCase()}.` }, { status: 400 });
    }
    if (stepIndex !== run.currentStepIndex + 1) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: `Invalid step submission. Expected step ${run.currentStepIndex + 2}, but got ${stepIndex + 1}.` }, { status: 400 });
    }

    const wizard: Wizard | undefined = await db.get('SELECT * FROM wizards WHERE id = ?', run.wizardId);
    if (!wizard) {
        await db.run('ROLLBACK');
        return NextResponse.json({ error: 'Wizard definition not found' }, { status: 500 });
    }
    wizard.steps = await db.all('SELECT *, step_type as stepType FROM wizard_steps WHERE wizardId = ? ORDER BY orderIndex ASC', wizard.id);
    wizard.steps.forEach(step => {
        step.propertyIds = JSON.parse(step.propertyIds || '[]');
        step.propertyMappings = JSON.parse(step.propertyMappings || '[]');
    });


    if (stepIndex >= wizard.steps.length) {
      await db.run('ROLLBACK');
      return NextResponse.json({ error: 'Step index out of bounds.' }, { status: 400 });
    }
    const currentStep = wizard.steps[stepIndex];

    const stepData = JSON.parse(run.stepData || '{}');
    if (stepType === 'create') {
        stepData[stepIndex] = { stepType, formData };
    } else { // lookup
        stepData[stepIndex] = { stepType, objectId: lookupObjectId };
    }

    const isFinalStep = stepIndex === wizard.steps.length - 1;

    if (isFinalStep) {
        const createdObjectIds: Record<number, string> = {};
        const resolvedStepData = { ...stepData };
        const validationRulesets: ValidationRuleset[] = await db.all('SELECT * FROM validation_rulesets');

        // First pass: Resolve all lookups
        for (let i = 0; i < wizard.steps.length; i++) {
            const stepToResolve = wizard.steps[i];
            const dataForStep = resolvedStepData[i];
            if (dataForStep.stepType === 'lookup' && dataForStep.objectId) {
                const objectFromDb = await db.get('SELECT data FROM data_objects WHERE id = ? AND model_id = ?', dataForStep.objectId, stepToResolve.modelId);
                if (objectFromDb) {
                    resolvedStepData[i].formData = JSON.parse(objectFromDb.data);
                } else {
                    throw new Error(`Looked up object with ID ${dataForStep.objectId} not found for step ${i + 1}.`);
                }
            }
        }
        
        // Second pass: Process mappings and then validate and create objects
        for (let i = 0; i < wizard.steps.length; i++) {
            const stepToProcess = wizard.steps[i];
            const dataForStep = resolvedStepData[i];
            
            if (dataForStep.stepType === 'lookup') {
                createdObjectIds[i] = dataForStep.objectId;
                continue; // Skip creation for lookup steps
            }

            const modelForStep: any = await db.get('SELECT * FROM models WHERE id = ?', stepToProcess.modelId);
            if (!modelForStep) throw new Error(`Model ${stepToProcess.modelId} not found for step ${i + 1}`);
            
            const newObjectId = crypto.randomUUID();
            createdObjectIds[i] = newObjectId;
            const newObjectData = { ...(dataForStep.formData || {}) };

            // Apply mappings from previous steps
            const mappings: PropertyMapping[] = stepToProcess.propertyMappings || [];
            for (const mapping of mappings) {
                const sourceStepData = resolvedStepData[mapping.sourceStepIndex];
                if (!sourceStepData) continue;
                
                const sourceObjectId = createdObjectIds[mapping.sourceStepIndex];
                const targetPropertyDef = await db.get('SELECT name FROM properties WHERE id = ?', mapping.targetPropertyId);

                if (!targetPropertyDef) {
                     console.warn(`Mapping failed: Target property with ID ${mapping.targetPropertyId} not found.`);
                     continue;
                }
                
                let valueToMap: any = null;
                if (mapping.sourcePropertyId === INTERNAL_MAPPING_OBJECT_ID_KEY) {
                    valueToMap = sourceObjectId;
                } else if (sourceStepData.formData) {
                    const sourcePropertyDef = await db.get('SELECT name FROM properties WHERE id = ?', mapping.sourcePropertyId);
                    if (sourcePropertyDef) {
                        valueToMap = sourceStepData.formData[sourcePropertyDef.name];
                    } else {
                         console.warn(`Mapping failed: Source property with ID ${mapping.sourcePropertyId} not found.`);
                    }
                }
                newObjectData[targetPropertyDef.name] = valueToMap;
            }

            // Run full validation on the final prepared object data
            const properties: Property[] = await db.all('SELECT * FROM properties WHERE model_id = ?', stepToProcess.modelId);
            for (const prop of properties) {
                const newValue = newObjectData[prop.name];
                
                // 1. Regex validation for strings
                if (prop.type === 'string' && prop.validationRulesetId && (newValue !== null && typeof newValue !== 'undefined' && String(newValue).trim() !== '')) {
                    const ruleset = validationRulesets.find(rs => rs.id === prop.validationRulesetId);
                    if (ruleset) {
                        try {
                            const regex = new RegExp(ruleset.regexPattern);
                            if (!regex.test(String(newValue))) {
                                throw new Error(`Step ${i + 1} ('${modelForStep.name}'): Value for '${prop.name}' does not match the required format: ${ruleset.name}.`);
                            }
                        } catch (e: any) {
                            console.warn(`Wizard Commit: Invalid regex pattern for ruleset ${ruleset.name}. Skipping validation.`);
                        }
                    }
                }

                // 2. Uniqueness check for strings
                if (prop.type === 'string' && prop.isUnique && (newValue !== null && typeof newValue !== 'undefined' && String(newValue).trim() !== '')) {
                    const conflictingObject = await db.get(
                        `SELECT id FROM data_objects WHERE model_id = ? AND json_extract(data, '$.${prop.name}') = ? AND (isDeleted = 0 OR isDeleted IS NULL)`,
                        stepToProcess.modelId, newValue
                    );
                    if (conflictingObject) {
                        throw new Error(`Step ${i + 1} ('${modelForStep.name}'): Value '${newValue}' for property '${prop.name}' must be unique. It already exists.`);
                    }
                }

                // 3. Min/Max check for numbers
                if (prop.type === 'number' && (newValue !== null && typeof newValue !== 'undefined')) {
                    const numericValue = Number(newValue);
                    if (isNaN(numericValue) && prop.required) {
                        throw new Error(`Step ${i + 1} ('${modelForStep.name}'): Property '${prop.name}' requires a valid number. Received: '${newValue}'.`);
                    }
                    if (!isNaN(numericValue)) {
                        if (prop.minValue !== null && typeof prop.minValue === 'number' && numericValue < prop.minValue) {
                            throw new Error(`Step ${i + 1} ('${modelForStep.name}'): Value '${numericValue}' for property '${prop.name}' is less than the minimum allowed value of ${prop.minValue}.`);
                        }
                        if (prop.maxValue !== null && typeof prop.maxValue === 'number' && numericValue > prop.maxValue) {
                            throw new Error(`Step ${i + 1} ('${modelForStep.name}'): Value '${numericValue}' for property '${prop.name}' is greater than the maximum allowed value of ${prop.maxValue}.`);
                        }
                    }
                }
            }
            
            // If all validation passes, finalize and prepare for insert
            resolvedStepData[i].formData = newObjectData;
            const currentTimestamp = new Date().toISOString();
            const finalObjectData = { ...newObjectData, createdAt: currentTimestamp, updatedAt: currentTimestamp };
            
            let finalCurrentStateId = null;
            if (modelForStep.workflowId) {
                const initialState = await db.get('SELECT id FROM workflow_states WHERE workflowId = ? AND isInitial = 1', modelForStep.workflowId);
                finalCurrentStateId = initialState?.id || null;
            }

            await db.run('INSERT INTO data_objects (id, model_id, data, currentStateId, ownerId, isDeleted) VALUES (?, ?, ?, ?, ?, 0)',
                newObjectId, stepToProcess.modelId, JSON.stringify(finalObjectData), finalCurrentStateId, currentUser.id);
        }
        
        await db.run('UPDATE wizard_runs SET status = ?, currentStepIndex = ?, stepData = ?, updatedAt = ? WHERE id = ?', 'COMPLETED', stepIndex, JSON.stringify(resolvedStepData), new Date().toISOString(), runId);
        
    } else {
        if (stepType === 'lookup' && lookupObjectId) {
            const modelForStep = await db.get('SELECT id FROM models WHERE id = ?', currentStep.modelId);
            if (modelForStep) {
                const objectFromDb = await db.get('SELECT data FROM data_objects WHERE id = ? AND model_id = ?', lookupObjectId, modelForStep.id);
                if (objectFromDb) {
                    stepData[stepIndex].formData = JSON.parse(objectFromDb.data);
                }
            }
        }
        await db.run('UPDATE wizard_runs SET currentStepIndex = ?, stepData = ?, updatedAt = ? WHERE id = ?', stepIndex, JSON.stringify(stepData), new Date().toISOString(), runId);
    }
    
    await db.run('COMMIT');
    return NextResponse.json({ success: true, isFinalStep });

  } catch (error: any) {
    await db.run('ROLLBACK').catch(rbError => console.error("API Error (Wizard Step) - Rollback failed:", rbError));
    console.error(`API Error (POST /wizards/run/${runId}/step):`, error);
    return NextResponse.json({ error: 'Failed to process wizard step', details: error.message }, { status: 400 });
  }
}
