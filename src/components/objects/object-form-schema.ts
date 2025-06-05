
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
        // Apply regex validation if a ruleset is assigned
        if (prop.validationRulesetId) {
          const ruleset = validationRulesets.find(rs => rs.id === prop.validationRulesetId);
          if (ruleset) {
            try {
              const regex = new RegExp(ruleset.regexPattern);
              fieldSchema = fieldSchema.refine(val => {
                if (val === null || val === undefined || val === '') return true; // Allow empty if not required
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
        if (!prop.required) {
          fieldSchema = fieldSchema.optional().nullable();
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
