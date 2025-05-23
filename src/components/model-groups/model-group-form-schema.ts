
import { z } from 'zod';

export const modelGroupFormSchema = z.object({
  name: z.string().min(1, "Group name is required.").max(100, "Group name must be 100 characters or less."),
  description: z.string().max(500, "Description must be 500 characters or less.").optional(),
});

export type ModelGroupFormValues = z.infer<typeof modelGroupFormSchema>;
