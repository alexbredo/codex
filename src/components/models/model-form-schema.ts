
import { z } from 'zod';

export const propertyTypes = ['string', 'number', 'boolean', 'date', 'relationship', 'markdown', 'rating'] as const;
export const relationshipTypes = ['one', 'many'] as const;

export const propertyFormSchema = z.object({
  id: z.string().optional(), // Optional for new properties
  name: z.string().min(1, "Property name is required."),
  type: z.enum(propertyTypes, { required_error: "Property type is required." }),
  relatedModelId: z.string().optional(),
  required: z.boolean().optional().default(false),
  relationshipType: z.enum(relationshipTypes).optional().default('one'),
  unit: z.string().optional(),
  precision: z.coerce.number().int().min(0).max(10).optional(),
  autoSetOnCreate: z.boolean().optional().default(false),
  autoSetOnUpdate: z.boolean().optional().default(false),
  isUnique: z.boolean().optional().default(false),
  orderIndex: z.number().optional(), // Will be set programmatically
}).refine(data => {
  if (data.type === 'relationship' && !data.relatedModelId) {
    return false;
  }
  return true;
}, {
  message: "Related model is required for relationship type.",
  path: ["relatedModelId"],
}).refine(data => {
  if (data.type !== 'relationship' && data.relationshipType === 'many') {
    return false;
  }
  return true;
}, {
  message: "Relationship type can only be 'many' if property type is 'relationship'.",
  path: ["relationshipType"],
}).refine(data => {
  if (data.type !== 'number' && (data.unit !== undefined && data.unit !== '')) {
    return false;
  }
  return true;
}, {
  message: "Unit can only be set for number type properties.",
  path: ["unit"],
}).refine(data => {
  if (data.type !== 'number' && data.precision !== undefined) {
    return false;
  }
  return true;
}, {
  message: "Precision can only be set for number type properties.",
  path: ["precision"],
}).refine(data => {
  if (data.type !== 'date' && (data.autoSetOnCreate || data.autoSetOnUpdate)) {
    return false;
  }
  return true;
}, {
  message: "Auto-set options are only available for date type properties.",
  path: ["type"], 
}).refine(data => {
  if (data.type !== 'string' && data.isUnique) {
    return false;
  }
  return true;
}, {
  message: "Unique constraint can only be set for string type properties.",
  path: ["isUnique"],
})
// Refinements for 'rating' type - cannot have unit, precision, relatedModelId, relationshipType, autoSet, isUnique
.refine(data => data.type === 'rating' ? (data.unit === undefined || data.unit === '') : true, {
    message: "Unit cannot be set for rating type properties.",
    path: ["unit"],
})
.refine(data => data.type === 'rating' ? data.precision === undefined : true, {
    message: "Precision cannot be set for rating type properties.",
    path: ["precision"],
})
.refine(data => data.type === 'rating' ? data.relatedModelId === undefined : true, {
    message: "Related Model ID cannot be set for rating type properties.",
    path: ["relatedModelId"],
})
.refine(data => data.type === 'rating' ? data.relationshipType === undefined || data.relationshipType === 'one' : true, { // 'one' is default, should be cleared
    message: "Relationship Type cannot be set for rating type properties.",
    path: ["relationshipType"],
})
.refine(data => data.type === 'rating' ? (!data.autoSetOnCreate && !data.autoSetOnUpdate) : true, {
    message: "Auto-set options are not available for rating type properties.",
    path: ["autoSetOnCreate"], // Could target 'type' as well.
})
.refine(data => data.type === 'rating' ? !data.isUnique : true, {
    message: "Unique constraint cannot be set for rating type properties.",
    path: ["isUnique"],
});


export const modelFormSchema = z.object({
  name: z.string().min(1, "Model name is required."),
  description: z.string().optional(),
  namespace: z.string().optional(), // Will default to 'Default' if empty or special value
  displayPropertyNames: z.array(z.string()).optional(),
  properties: z.array(propertyFormSchema).min(1, "At least one property is required."),
});

export type ModelFormValues = z.infer<typeof modelFormSchema>;
export type PropertyFormValues = z.infer<typeof propertyFormSchema>;
