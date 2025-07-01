

import { z } from 'zod';

export const propertyMappingSchema = z.object({
  targetPropertyId: z.string(),
  sourceStepIndex: z.number(),
  sourcePropertyId: z.string(),
});

export const wizardStepSchema = z.object({
  id: z.string().optional(),
  modelId: z.string().min(1, "A model must be selected for each step."),
  stepType: z.enum(['create', 'lookup']).default('create'),
  orderIndex: z.number(),
  instructions: z.string().optional(),
  propertyIds: z.array(z.string()).optional().default([]), // Make optional for lookup steps
  propertyMappings: z.array(propertyMappingSchema).optional(),
}).superRefine((data, ctx) => {
    if (data.stepType === 'create' && (!data.propertyIds || data.propertyIds.length === 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "At least one property must be selected for a 'Create' step.",
            path: ["propertyIds"],
        });
    }
});

export const wizardFormSchema = z.object({
  name: z.string().min(1, "Wizard name is required."),
  description: z.string().optional(),
  steps: z.array(wizardStepSchema).min(1, "A wizard must have at least one step."),
});

export type PropertyMappingFormValues = z.infer<typeof propertyMappingSchema>;
export type WizardStepFormValues = z.infer<typeof wizardStepSchema>;
export type WizardFormValues = z.infer<typeof wizardFormSchema>;
