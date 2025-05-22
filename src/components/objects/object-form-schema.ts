
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
          // For required numbers, we expect a number.
        } else {
          fieldSchema = fieldSchema.optional().or(z.nan()); 
        }
        break;
      case 'boolean':
        fieldSchema = z.boolean().default(false);
        break;
      case 'date':
        // Base schema for a date field
        let baseDateSchema = z.union([z.string().datetime({ offset: true }), z.date()]);

        if (prop.autoSetOnCreate || prop.autoSetOnUpdate) {
          // If the date is auto-set, it's optional and nullable from the form's perspective,
          // as the onSubmit logic will handle providing the actual value.
          fieldSchema = baseDateSchema.optional().nullable();
        } else {
          // If not auto-set, apply required/optional logic as usual.
          if (prop.required) {
            fieldSchema = baseDateSchema; // Implicitly required by not being optional
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

