
'use client';

import type { UseFormReturn } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import type { Model, DataObject } from '@/lib/types';
import AdaptiveFormField from './adaptive-form-field';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ObjectFormProps {
  form: UseFormReturn<Record<string, any>>;
  model: Model;
  onSubmit: (values: Record<string, any>) => void;
  onCancel: () => void;
  isLoading?: boolean;
  existingObject?: DataObject;
  formObjectId?: string | null; // Used to pass objectId for image uploads
}

export default function ObjectForm({
  form,
  model,
  onSubmit,
  onCancel,
  isLoading,
  existingObject,
  formObjectId,
}: ObjectFormProps) {
  const formContext = existingObject ? 'edit' : 'create';

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-4 ">
                {model.properties.map((property) => (
                <AdaptiveFormField
                    key={property.id}
                    form={form} // Pass the full form object
                    property={property}
                    formContext={formContext}
                    modelId={model.id}
                    objectId={formObjectId || existingObject?.id}
                />
                ))}
            </div>
        </ScrollArea>
        <div className="flex justify-end space-x-2 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading || form.formState.isSubmitting} className="bg-primary hover:bg-primary/90">
            {isLoading || form.formState.isSubmitting ? 'Saving...' : (existingObject ? `Update ${model.name}` : `Create ${model.name}`)}
          </Button>
        </div>
      </form>
    </Form>
  );
}

