import { z } from 'zod';

export const propertyTypes = ['string', 'number', 'boolean', 'date', 'relationship'] as const;

export const propertyFormSchema = z.object({
  id: z.string().optional(), // Optional for new properties
  name: z.string().min(1, "Property name is required."),
  type: z.enum(propertyTypes, { required_error: "Property type is required." }),
  relatedModelId: z.string().optional(),
  required: z.boolean().optional().default(false),
}).refine(data => {
  if (data.type === 'relationship' && !data.relatedModelId) {
    return false;
  }
  return true;
}, {
  message: "Related model is required for relationship type.",
  path: ["relatedModelId"],
});

export const modelFormSchema = z.object({
  name: z.string().min(1, "Model name is required."),
  description: z.string().optional(),
  properties: z.array(propertyFormSchema).min(1, "At least one property is required."),
});

export type ModelFormValues = z.infer<typeof modelFormSchema>;
export type PropertyFormValues = z.infer<typeof propertyFormSchema>;
