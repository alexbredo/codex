
'use server';

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUserFromCookie } from '@/lib/auth';
import type { WizardRun, Wizard, DataObject, ChangelogEventData, PropertyMapping } from '@/lib/types';
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
    wizard.steps = await db.all('SELECT * FROM wizard_steps WHERE wizardId = ? ORDER BY orderIndex ASC', wizard.id);
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
        // --- FINAL COMMIT LOGIC ---
        const createdObjectIds: Record<number, string> = {}; // { stepIndex: objectId }
        
        // First, resolve all data from lookup steps so it's available for mapping
        const resolvedStepData = { ...stepData };
        for (let i = 0; i < wizard.steps.length; i++) {
            const dataForStep = resolvedStepData[i];
            if (dataForStep.stepType === 'lookup' && dataForStep.objectId) {
                const objectFromDb = await db.get('SELECT data FROM data_objects WHERE id = ?', dataForStep.objectId);
                if (objectFromDb) {
                    // We store the *parsed* data from the looked-up object to use for mapping.
                    resolvedStepData[i].formData = JSON.parse(objectFromDb.data);
                }
            }
        }
        
        for (let i = 0; i < wizard.steps.length; i++) {
            const stepToProcess = wizard.steps[i];
            const dataForStep = resolvedStepData[i];
            
            if (dataForStep.stepType === 'lookup') {
                createdObjectIds[i] = dataForStep.objectId;
                continue;
            }

            const modelForStep: any = await db.get('SELECT * FROM models WHERE id = ?', stepToProcess.modelId);
            if (!modelForStep) throw new Error(`Model ${stepToProcess.modelId} not found for step ${i+1}`);
            
            const newObjectId = crypto.randomUUID();
            createdObjectIds[i] = newObjectId;
            const newObjectData = { ...(dataForStep.formData || {}) };

            const mappings: PropertyMapping[] = stepToProcess.propertyMappings || [];
            for (const mapping of mappings) {
                const sourceStepData = resolvedStepData[mapping.sourceStepIndex]; // Use resolved data
                if (sourceStepData) {
                    const sourceObjectId = createdObjectIds[mapping.sourceStepIndex];
                    const sourcePropertyDef = (await db.get('SELECT name FROM properties WHERE id = ?', mapping.sourcePropertyId));
                    const targetPropertyDef = (await db.get('SELECT name FROM properties WHERE id = ?', mapping.targetPropertyId));

                    if (sourceObjectId && mapping.sourcePropertyId === INTERNAL_MAPPING_OBJECT_ID_KEY && targetPropertyDef) {
                        newObjectData[targetPropertyDef.name] = sourceObjectId;
                    } else if (sourceStepData.formData && sourcePropertyDef && targetPropertyDef) { // Now formData exists for lookup steps too
                        newObjectData[targetPropertyDef.name] = sourceStepData.formData[sourcePropertyDef.name];
                    }
                }
            }
            
            const currentTimestamp = new Date().toISOString();
            const finalObjectData = { ...newObjectData, createdAt: currentTimestamp, updatedAt: currentTimestamp };
            
            let finalCurrentStateId = null;
            if (modelForStep.workflowId) {
                const initialState = await db.get('SELECT id FROM workflow_states WHERE workflowId = ? AND isInitial = 1', modelForStep.workflowId);
                finalCurrentStateId = initialState?.id || null;
            }

            await db.run('INSERT INTO data_objects (id, model_id, data, currentStateId, ownerId) VALUES (?, ?, ?, ?, ?)',
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
