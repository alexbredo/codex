
'use client';

import type { UseFormReturn } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import type { Model, DataObject } from '@/lib/types';
import AdaptiveFormField from './adaptive-form-field';
import { ScrollArea } from '@/components/ui/scroll-area'; // Keep for internal form scrolling if many fields

interface ObjectFormProps {
  form: UseFormReturn<Record<string, any>>; 
  model: Model;
  onSubmit: (values: Record<string, any>) => void;
  onCancel: () => void; // For navigation
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
      {/* Form might be long, so keep ScrollArea for properties section */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <ScrollArea className="max-h-[60vh] pr-3"> {/* Adjust max-h as needed */}
            <div className="space-y-4 ">
                {model.properties.map((property) => (
                <AdaptiveFormField
                    key={property.id}
                    control={form.control}
                    property={property}
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


    