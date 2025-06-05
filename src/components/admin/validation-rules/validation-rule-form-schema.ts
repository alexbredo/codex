
'use client';

import { z } from 'zod';

export const validationRuleFormSchema = z.object({
  name: z.string().min(1, "Rule name is required.").max(100, "Rule name must be 100 characters or less."),
  description: z.string().max(500, "Description must be 500 characters or less.").optional(),
  regexPattern: z.string().min(1, "Regex pattern is required.").refine(val => {
    try {
      new RegExp(val);
      return true;
    } catch (e) {
      return false;
    }
  }, { message: "Invalid regex pattern." }),
});

export type ValidationRuleFormValues = z.infer<typeof validationRuleFormSchema>;
