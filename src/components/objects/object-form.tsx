'use client';

import type { UseFormReturn } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import type { Model, DataObject } from '@/lib/types';
import AdaptiveFormField from './adaptive-form-field';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ObjectFormProps {
  form: UseFormReturn<Record<string, any>>; // Using Record<string, any> due to dynamic nature
  model: Model;
  onSubmit: (values: Record<string, any>) => void;
  onCancel: () => void;
  isLoading?: boolean;
  existingObject?: DataObject;
}

export default function ObjectForm({
  form,
  model,
  onSubmit,
  onCancel,
  isLoading,
  existingObject,
}: ObjectFormProps) {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 flex flex-col max-h-full">
        <ScrollArea className="flex-grow pr-2">
            <div className="space-y-4">
                {model.properties.map((property) => (
                <AdaptiveFormField
                    key={property.id}
                    control={form.control}
                    property={property}
                />
                ))}
            </div>
        </ScrollArea>
        <div className="flex justify-end space-x-2 pt-4 sticky bottom-0 bg-background pb-1">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading} className="bg-primary hover:bg-primary/90">
            {isLoading ? 'Saving...' : (existingObject ? `Update ${model.name}` : `Create ${model.name}`)}
          </Button>
        </div>
      </form>
    </Form>
  );
}
