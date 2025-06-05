
import { z } from 'zod';
import type { Model, Property, ValidationRuleset } from '@/lib/types';

export function createObjectFormSchema(model: Model | undefined, validationRulesets: ValidationRuleset[] = []) {
  if (!model) {
    return z.object({});
  }

  const shape: Record<string, z.ZodTypeAny> = {
    currentStateId: z.string().nullable().optional(),
  };

  model.properties.forEach((prop: Property) => {
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
        fieldSchema = z.any()
          .refine(value => {
            if (prop.required) {
              return value instanceof File || (typeof value === 'string' && value.trim() !== '');
            }
            return true;
          }, { message: `${prop.name} is required. Please select an image or provide a URL.` })
          .optional()
          .nullable();
        break;
      case 'number':
        fieldSchema = z.coerce.number();
        if (prop.min !== null && typeof prop.min === 'number') {
          fieldSchema = fieldSchema.min(prop.min, { message: `${prop.name} must be at least ${prop.min}.` });
        }
        if (prop.max !== null && typeof prop.max === 'number') {
          fieldSchema = fieldSchema.max(prop.max, { message: `${prop.name} must be no more than ${prop.max}.` });
        }
        if (!prop.required) {
          // Allow empty string for optional numbers, which coerce.number handles by turning into NaN.
          // Zod's .optional() makes it so that if the key is missing or undefined, it's okay.
          // .nullable() allows explicit null.
          // We need to ensure that if it's not required, an empty input or null is valid *before* min/max checks.
           fieldSchema = z.union([fieldSchema, z.literal(null), z.literal(undefined), z.literal('')])
             .transform(val => (val === '' || val === null || val === undefined) ? null : Number(val))
             .refine(val => {
                if (val === null) return true; // Null is fine if not required
                if (prop.min !== null && typeof prop.min === 'number' && val < prop.min) return false;
                if (prop.max !== null && typeof prop.max === 'number' && val > prop.max) return false;
                return true;
             }, val => ({ // Custom error messages for the refine after transform
                message: (prop.min !== null && typeof prop.min === 'number' && val !== null && val < prop.min) 
                            ? `${prop.name} must be at least ${prop.min}.` 
                            : (prop.max !== null && typeof prop.max === 'number' && val !== null && val > prop.max)
                            ? `${prop.name} must be no more than ${prop.max}.`
                            : `${prop.name} is invalid.`
             }));
        } else { // If required, it must be a number satisfying min/max directly
            fieldSchema = fieldSchema.refine(val => val !== null && val !== undefined && !isNaN(val), {message: `${prop.name} is required.`});
        }
        break;
      case 'boolean':
        fieldSchema = z.boolean().default(false);
        break;
      case 'date':
        let baseDateSchema = z.union([z.string().datetime({ offset: true }), z.date()]).nullable();
        if (prop.autoSetOnCreate || prop.autoSetOnUpdate) {
          fieldSchema = baseDateSchema.optional().nullable();
        } else {
          if (prop.required) {
            fieldSchema = baseDateSchema.refine(val => val !== null, { message: `${prop.name} is required.` });
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
