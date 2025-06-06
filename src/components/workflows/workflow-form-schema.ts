
import { z } from 'zod';

export const workflowStateSchema = z.object({
  id: z.string().optional(), // For existing states during update
  name: z.string().min(1, "State name is required.").max(100, "State name must be 100 characters or less."),
  description: z.string().max(500, "State description must be 500 characters or less.").optional(),
  isInitial: z.boolean().default(false),
  orderIndex: z.number().optional(), // Will be set programmatically by dnd and on add
  successorStateNames: z.array(z.string()).optional().default([]), // Names of successor states
});

export type WorkflowStateFormValues = z.infer<typeof workflowStateSchema>;

export const workflowFormSchema = z.object({
  name: z.string().min(1, "Workflow name is required.").max(100, "Workflow name must be 100 characters or less."),
  description: z.string().max(500, "Workflow description must be 500 characters or less.").optional(),
  states: z.array(workflowStateSchema).min(1, "At least one state is required."),
}).refine(data => {
  const initialStates = data.states.filter(state => state.isInitial);
  return initialStates.length <= 1; // Allows zero or one initial state. Zero is fine if user hasn't marked one yet.
}, {
  message: "A workflow can have at most one initial state.",
  path: ["states"], 
});

export type WorkflowFormValues = z.infer<typeof workflowFormSchema>;
