
import { z } from 'zod';

export const propertyTypes = ['string', 'number', 'boolean', 'date', 'relationship'] as const;
export const relationshipTypes = ['one', 'many'] as const;

export const propertyFormSchema = z.object({
  id: z.string().optional(), // Optional for new properties
  name: z.string().min(1, "Property name is required."),
  type: z.enum(propertyTypes, { required_error: "Property type is required." }),
  relatedModelId: z.string().optional(),
  required: z.boolean().optional().default(false),
  relationshipType: z.enum(relationshipTypes).optional().default('one'),
}).refine(data => {
  if (data.type === 'relationship' && !data.relatedModelId) {
    return false;
  }
  return true;
}, {
  message: "Related model is required for relationship type.",
  path: ["relatedModelId"],
}).refine(data => {
  // if type is not relationship, relationshipType should not be set or be 'one'
  if (data.type !== 'relationship' && data.relationshipType === 'many') {
    // This case should ideally be prevented by UI logic, but good to have a schema rule
    return false; 
  }
  return true;
}, {
  message: "Relationship type can only be 'many' if property type is 'relationship'.",
  path: ["relationshipType"],
});

export const modelFormSchema = z.object({
  name: z.string().min(1, "Model name is required."),
  description: z.string().optional(),
  displayPropertyNames: z.array(z.string()).optional(), // Changed from displayPropertyName
  properties: z.array(propertyFormSchema).min(1, "At least one property is required."),
});

export type ModelFormValues = z.infer<typeof modelFormSchema>;
export type PropertyFormValues = z.infer<typeof propertyFormSchema>;
