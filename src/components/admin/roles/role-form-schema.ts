
import { z } from 'zod';

export const roleFormSchema = z.object({
  name: z.string().min(1, 'Role name is required.').max(100, 'Role name cannot exceed 100 characters.'),
  description: z.string().max(255, 'Description cannot exceed 255 characters.').optional(),
  permissionIds: z.array(z.string()).optional().default([]),
});

export type RoleFormValues = z.infer<typeof roleFormSchema>;
