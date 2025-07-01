

import { z } from 'zod';

export const wizardStepSchema = z.object({
  id: z.string().optional(),
  modelId: z.string().min(1, "A model must be selected for each step."),
  orderIndex: z.number(),
  instructions: z.string().optional(),
  propertyIds: z.array(z.string()).min(1, "At least one property must be selected for each step."),
});

export const wizardFormSchema = z.object({
  name: z.string().min(1, "Wizard name is required."),
  description: z.string().optional(),
  steps: z.array(wizardStepSchema).min(1, "A wizard must have at least one step."),
});

export type WizardStepFormValues = z.infer<typeof wizardStepSchema>;
export type WizardFormValues = z.infer<typeof wizardFormSchema>;
