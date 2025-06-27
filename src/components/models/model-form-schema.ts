
import { z } from 'zod';

export const propertyTypes = ['string', 'number', 'boolean', 'date', 'relationship', 'markdown', 'rating', 'image', 'fileAttachment', 'url'] as const;
export const relationshipTypes = ['one', 'many'] as const;

export const propertyFormSchema = z.object({
  id: z.string().optional(), // Optional for new properties
  name: z.string().min(1, "Property name is required."),
  type: z.enum(propertyTypes, { required_error: "Property type is required." }),
  relatedModelId: z.string().optional(),
  required: z.boolean().optional().default(false),
  relationshipType: z.enum(relationshipTypes).optional().default('one'),
  unit: z.string().nullable().optional(), // Changed to allow null
  precision: z.coerce.number().int().min(0).max(10).optional(),
  autoSetOnCreate: z.boolean().optional().default(false),
  autoSetOnUpdate: z.boolean().optional().default(false),
  isUnique: z.boolean().optional().default(false),
  orderIndex: z.number().optional(), // Will be set programmatically
  defaultValue: z.string().optional(), // Stored as string, parsed based on 'type' when used
  validationRulesetId: z.string().nullable().default(null),
  minValue: z.coerce.number().nullable().optional(),
  maxValue: z.coerce.number().nullable().optional(),
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
  if (data.type !== 'number' && (data.unit !== undefined && data.unit !== null && data.unit !== '')) {
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
.refine(data => ['rating', 'markdown', 'image', 'fileAttachment', 'url'].includes(data.type) ? (data.unit === undefined || data.unit === null || data.unit === '') : true, {
    message: "Unit cannot be set for this property type.", path: ["unit"],
})
.refine(data => ['rating', 'markdown', 'image', 'fileAttachment', 'url'].includes(data.type) ? data.precision === undefined : true, {
    message: "Precision cannot be set for this property type.", path: ["precision"],
})
.refine(data => ['rating', 'markdown', 'image', 'fileAttachment', 'url'].includes(data.type) ? data.relatedModelId === undefined : true, {
    message: "Related Model ID cannot be set for this property type.", path: ["relatedModelId"],
})
.refine(data => ['rating', 'markdown', 'image', 'fileAttachment', 'url'].includes(data.type) ? (data.relationshipType === undefined || data.relationshipType === 'one') : true, {
    message: "Relationship Type cannot be set for this property type.", path: ["relationshipType"],
})
.refine(data => ['rating', 'markdown', 'image', 'fileAttachment', 'url'].includes(data.type) ? (!data.autoSetOnCreate && !data.autoSetOnUpdate) : true, {
    message: "Auto-set options are not available for this property type.", path: ["autoSetOnCreate"],
})
.refine(data => ['rating', 'markdown', 'image', 'fileAttachment', 'url'].includes(data.type) ? !data.isUnique : true, {
    message: "Unique constraint cannot be set for this property type.", path: ["isUnique"],
})
.refine(data => data.type === 'string' || data.validationRulesetId === null, {
  message: "Validation ruleset can only be applied to 'string' type properties.",
  path: ["validationRulesetId"],
})
.refine(data => { // Min/Max only for number type
  if (data.type !== 'number') {
    return data.minValue === null || data.minValue === undefined;
  }
  return true;
}, { message: "Minimum value can only be set for number type properties.", path: ["minValue"] })
.refine(data => {
  if (data.type !== 'number') {
    return data.maxValue === null || data.maxValue === undefined;
  }
  return true;
}, { message: "Maximum value can only be set for number type properties.", path: ["maxValue"] })
.refine(data => { // If both min and max are set, min must be <= max
  if (typeof data.minValue === 'number' && typeof data.maxValue === 'number') {
    return data.minValue <= data.maxValue;
  }
  return true;
}, { message: "Minimum value cannot be greater than maximum value.", path: ["minValue"] });


export const modelFormSchema = z.object({
  name: z.string().min(1, "Model name is required."),
  description: z.string().optional(),
  modelGroupId: z.string().nullable().optional(),
  displayPropertyNames: z.array(z.string()).optional(),
  properties: z.array(propertyFormSchema).min(1, "At least one property is required."),
  workflowId: z.string().nullable().optional(),
});

export type ModelFormValues = z.infer<typeof modelFormSchema>;
export type PropertyFormValues = z.infer<typeof propertyFormSchema>;
