import { z } from 'zod';
import type { Model, Property } from '@/lib/types';

export function createObjectFormSchema(model: Model | undefined) {
  if (!model) {
    // Return a default empty schema or throw an error, depending on desired behavior
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
          fieldSchema = fieldSchema.optional().or(z.literal('')); // Allow empty string for optional strings
        }
        break;
      case 'number':
        fieldSchema = z.coerce.number(); // Coerce input to number
        if (prop.required) {
          // Zod doesn't have a direct "required" for numbers like min(1) for strings if 0 is valid.
          // We rely on the presence of the field. If it can be undefined/null, then it's optional.
          // For now, coerce.number() will fail on empty string or non-numeric.
        } else {
          fieldSchema = fieldSchema.optional().or(z.nan()); // Allow NaN for optional numbers if not entered
        }
        break;
      case 'boolean':
        fieldSchema = z.boolean().default(false); // Default to false if not provided
        break;
      case 'date':
        // Storing dates as ISO strings. Validate as string, then try to parse.
        // Or use z.date() if input is a Date object (e.g. from a date picker)
        fieldSchema = z.union([z.string().datetime({ offset: true }), z.date()]);
        if (prop.required) {
            // This check is a bit tricky with union.
            // Rely on form validation to ensure a value is picked if required.
        } else {
          fieldSchema = fieldSchema.optional().nullable();
        }
        break;
      case 'relationship':
        fieldSchema = z.string(); // Stores the ID of the related object
        if (prop.required) {
          fieldSchema = fieldSchema.min(1, `Related ${prop.name} is required.`);
        } else {
          fieldSchema = fieldSchema.optional().or(z.literal(''));
        }
        break;
      default:
        fieldSchema = z.any();
    }
    shape[prop.name] = fieldSchema;
  });

  return z.object(shape);
}

// We can't infer a static type easily due to dynamic nature
// export type ObjectFormValues = z.infer<ReturnType<typeof createObjectFormSchema>>;
// Instead, forms will use Record<string, any> and rely on runtime validation.
