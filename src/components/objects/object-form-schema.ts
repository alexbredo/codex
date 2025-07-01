
import { z } from 'zod';
import type { Model, Property, ValidationRuleset } from '@/lib/types';

export function createObjectFormSchema(model: Model | undefined, validationRulesets: ValidationRuleset[] = [], propertyIdsToShow?: string[]) {
  if (!model) {
    return z.object({});
  }

  const shape: Record<string, z.ZodTypeAny> = {
    currentStateId: z.string().nullable().optional(),
    ownerId: z.string().nullable().optional(), // Added ownerId here
  };
  
  const propertiesToInclude = propertyIdsToShow
    ? model.properties.filter(p => propertyIdsToShow.includes(p.id))
    : model.properties;

  propertiesToInclude.forEach((prop: Property) => {
    let fieldSchema: z.ZodTypeAny;

    switch (prop.type) {
      case 'string':
        fieldSchema = z.string();
        if (prop.required) {
          fieldSchema = fieldSchema.min(1, `${prop.name} is required.`);
        } else {
          fieldSchema = fieldSchema.optional().or(z.literal(''));
        }
        if (prop.validationRulesetId) {
          const ruleset = validationRulesets.find(rs => rs.id === prop.validationRulesetId);
          if (ruleset) {
            try {
              const regex = new RegExp(ruleset.regexPattern);
              fieldSchema = fieldSchema.refine(val => {
                if (val === null || val === undefined || val === '') return true; 
                return regex.test(String(val));
              }, {
                message: `${prop.name} must match the format: ${ruleset.name}. (Pattern: ${ruleset.regexPattern})`,
              });
            } catch (e) {
              console.warn(`Invalid regex pattern for ruleset ${ruleset.name} (ID: ${ruleset.id}): ${ruleset.regexPattern}`);
            }
          }
        }
        break;
      case 'markdown':
        fieldSchema = z.string();
        if (prop.required) {
          fieldSchema = fieldSchema.min(1, `${prop.name} is required.`);
        } else {
          fieldSchema = fieldSchema.optional().or(z.literal(''));
        }
        break;
      case 'image':
      case 'fileAttachment':
        fieldSchema = z.any()
          .refine(value => {
            if (prop.required) {
              // For edit, existing value is a string URL. For create/update, it's a File object.
              return (value instanceof File) || (typeof value === 'string' && value.trim() !== '') || (typeof value === 'object' && value !== null && !!value.url);
            }
            return true;
          }, { message: `${prop.name} is required. Please select an image or provide a URL.` })
          .optional()
          .nullable();
        break;
      case 'url':
         fieldSchema = z.object({
            url: z.string().optional().or(z.literal('')),
            title: z.string().optional().or(z.literal(''))
        }).optional().nullable()
          .refine(value => {
            if (prop.required) {
                return !!value && !!value.url && value.url.trim() !== '';
            }
            return true;
        }, { message: `${prop.name} URL is required.` });
        break;
      case 'number':
        fieldSchema = z.coerce.number();
        if (prop.minValue !== null && typeof prop.minValue === 'number') {
          fieldSchema = fieldSchema.min(prop.minValue, { message: `${prop.name} must be at least ${prop.minValue}.` });
        }
        if (prop.maxValue !== null && typeof prop.maxValue === 'number') {
          fieldSchema = fieldSchema.max(prop.maxValue, { message: `${prop.name} must be no more than ${prop.maxValue}.` });
        }
        if (!prop.required) {
           fieldSchema = z.union([fieldSchema, z.literal(null), z.literal(undefined), z.literal('')])
             .transform(val => (val === '' || val === null || val === undefined) ? null : Number(val))
             .refine(val => {
                if (val === null) return true; 
                if (prop.minValue !== null && typeof prop.minValue === 'number' && val < prop.minValue) return false;
                if (prop.maxValue !== null && typeof prop.maxValue === 'number' && val > prop.maxValue) return false;
                return true;
             }, val => ({ 
                message: (prop.minValue !== null && typeof prop.minValue === 'number' && val !== null && val < prop.minValue) 
                            ? `${prop.name} must be at least ${prop.minValue}.` 
                            : (prop.maxValue !== null && typeof prop.maxValue === 'number' && val !== null && val > prop.maxValue)
                            ? `${prop.name} must be no more than ${prop.maxValue}.`
                            : `${prop.name} is invalid.`
             }));
        } else { 
            fieldSchema = fieldSchema.refine(val => val !== null && val !== undefined && !isNaN(val), {message: `${prop.name} is required.`});
        }
        break;
      case 'boolean':
        fieldSchema = z.boolean().default(false);
        break;
      case 'date':
      case 'time':
      case 'datetime':
        let baseDateSchema = z.union([z.string(), z.date()]).nullable();
        if (prop.autoSetOnCreate || prop.autoSetOnUpdate) {
          fieldSchema = baseDateSchema.optional().nullable();
        } else {
          if (prop.required) {
            fieldSchema = baseDateSchema.refine(val => val !== null && val !== '', { message: `${prop.name} is required.` });
          } else {
            fieldSchema = baseDateSchema.optional().nullable();
          }
        }
        break;
      case 'relationship':
        if (prop.relationshipType === 'many') {
          let baseArraySchema = z.array(z.string());
          if (prop.required) {
            fieldSchema = baseArraySchema.min(1, `At least one ${prop.name} is required.`);
          } else {
            fieldSchema = baseArraySchema.default([]);
          }
        } else {
          fieldSchema = z.string();
          if (prop.required) {
            fieldSchema = fieldSchema.min(1, `Related ${prop.name} is required.`);
          } else {
            fieldSchema = fieldSchema.optional().or(z.literal(''));
          }
        }
        break;
      case 'rating':
        if (prop.required) {
          fieldSchema = z.number().int().min(1, `${prop.name} requires a rating of at least 1.`).max(5);
        } else {
          fieldSchema = z.number().int().min(0).max(5).nullable().optional().default(0);
        }
        break;
      default:
        fieldSchema = z.any();
    }
    shape[prop.name] = fieldSchema;
  });

  return z.object(shape);
}
