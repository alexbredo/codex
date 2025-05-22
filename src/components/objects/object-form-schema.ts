
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
      case 'number':
        fieldSchema = z.coerce.number();
        if (prop.required) {
          // For required numbers, we expect a number. zod's `required` isn't a thing.
          // `coerce.number()` will turn "" to 0, or fail on non-numeric.
          // If it needs to be explicitly non-nullable AND non-zero, more complex validation is needed.
          // For now, rely on it being a number.
        } else {
          fieldSchema = fieldSchema.optional().or(z.nan()); 
        }
        break;
      case 'boolean':
        fieldSchema = z.boolean().default(false);
        break;
      case 'date':
        fieldSchema = z.union([z.string().datetime({ offset: true }), z.date()]);
        if (prop.required) {
          // If required, it must be a valid date string or Date object.
          // The .datetime() or .date() will handle this.
        } else {
          fieldSchema = fieldSchema.optional().nullable();
        }
        break;
      case 'relationship':
        if (prop.relationshipType === 'many') {
          fieldSchema = z.array(z.string()).default([]);
          if (prop.required) {
            fieldSchema = fieldSchema.min(1, `At least one ${prop.name} is required.`);
          }
        } else { // 'one' or undefined (defaults to 'one')
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
