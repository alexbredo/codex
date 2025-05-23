
import { z } from 'zod';
import type { Model, Property } from '@/lib/types';

export function createObjectFormSchema(model: Model | undefined) {
  if (!model) {
    return z.object({});
  }

  const shape: Record<string, z.ZodTypeAny> = {};

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
        break;
      case 'markdown': // Added markdown type
        fieldSchema = z.string();
        if (prop.required) {
          fieldSchema = fieldSchema.min(1, `${prop.name} is required.`);
        } else {
          fieldSchema = fieldSchema.optional().or(z.literal(''));
        }
        break;
      case 'number':
        fieldSchema = z.coerce.number();
        if (prop.required) {
          // For required numbers, we expect a number.
        } else {
          fieldSchema = fieldSchema.optional().or(z.nan()); 
        }
        break;
      case 'boolean':
        fieldSchema = z.boolean().default(false);
        break;
      case 'date':
        let baseDateSchema = z.union([z.string().datetime({ offset: true }), z.date()]).nullable();

        if (prop.autoSetOnCreate || prop.autoSetOnUpdate) {
          fieldSchema = baseDateSchema.optional();
        } else {
          if (prop.required) {
            fieldSchema = baseDateSchema.refine(val => val !== null, { message: `${prop.name} is required.` });
          } else {
            fieldSchema = baseDateSchema.optional();
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
      default:
        fieldSchema = z.any();
    }
    shape[prop.name] = fieldSchema;
  });

  return z.object(shape);
}
