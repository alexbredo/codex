
'use server';

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import type { WizardRun, Wizard, ChangelogEventData, PropertyMapping } from '@/lib/types';
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
        // --- REFACTORED FINAL COMMIT LOGIC ---
        const createdObjectIds: Record<number, string> = {}; // { stepIndex: objectId }
        const resolvedStepData = { ...stepData };

        // 1. Pre-fetch data for all 'lookup' steps
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
        
        // 2. Sequentially process all steps to handle creation and mapping
        for (let i = 0; i < wizard.steps.length; i++) {
            const stepToProcess = wizard.steps[i];
            const dataForStep = resolvedStepData[i];
            
            if (dataForStep.stepType === 'lookup') {
                createdObjectIds[i] = dataForStep.objectId;
                continue; // Nothing to create, move to next step
            }

            // It's a 'create' step
            const modelForStep: any = await db.get('SELECT * FROM models WHERE id = ?', stepToProcess.modelId);
            if (!modelForStep) throw new Error(`Model ${stepToProcess.modelId} not found for step ${i + 1}`);
            
            const newObjectId = crypto.randomUUID();
            createdObjectIds[i] = newObjectId;
            const newObjectData = { ...(dataForStep.formData || {}) };

            // Process mappings for the current step
            const mappings: PropertyMapping[] = stepToProcess.propertyMappings || [];
            for (const mapping of mappings) {
                const sourceStepData = resolvedStepData[mapping.sourceStepIndex];
                if (!sourceStepData) continue; // Should not happen if wizard is well-formed
                
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
        // --- INTERMEDIATE STEP SAVE ---
        await db.run('UPDATE wizard_runs SET currentStepIndex = ?, stepData = ?, updatedAt = ? WHERE id = ?', stepIndex, JSON.stringify(stepData), new Date().toISOString(), runId);
    }
    
    await db.run('COMMIT');
    return NextResponse.json({ success: true, isFinalStep });

  } catch (error: any) {
    await db.run('ROLLBACK').catch(rbError => console.error("API Error (Wizard Step) - Rollback failed:", rbError));
    console.error(`API Error (POST /wizards/run/${runId}/step):`, error);
    return NextResponse.json({ error: 'Failed to process wizard step', details: error.message }, { status: 500 });
  }
}
