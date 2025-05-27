
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
      case 'markdown':
        fieldSchema = z.string();
        if (prop.required) {
          fieldSchema = fieldSchema.min(1, `${prop.name} is required.`);
        } else {
          fieldSchema = fieldSchema.optional().or(z.literal(''));
        }
        break;
      case 'image':
        // Allows a File object for new uploads, a string (URL) for existing images,
        // or null/undefined if not set.
        fieldSchema = z.any()
          .refine(value => {
            if (prop.required) {
              // For required fields, it must be a File or a non-empty string (URL).
              return value instanceof File || (typeof value === 'string' && value.trim() !== '');
            }
            return true; // Optional fields can be null, undefined, File, or string.
          }, { message: `${prop.name} is required. Please select an image or provide a URL.` })
          .optional()
          .nullable();
        break;
      case 'number':
        fieldSchema = z.coerce.number();
        if (prop.required) {
          // For required numbers, we expect a number. Zod's coerce will handle parsing.
        } else {
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
