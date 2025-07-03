
'use client';

import * as React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useFieldArray } from 'react-hook-form';
import type { ModelFormValues, PropertyFormValues } from './model-form-schema';
import type { Model } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormMessage } from '@/components/ui/form';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import ModelFormDetails from './model-form-components/ModelFormDetails';
import PropertyList from './model-form-components/PropertyList';

interface ModelFormProps {
  form: UseFormReturn<ModelFormValues>;
  onSubmit: (values: ModelFormValues) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  existingModel?: Model;
}

const INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE = "__DEFAULT_DISPLAY_PROPERTY__";

export default function ModelForm({ form, onSubmit, onCancel, isLoading, existingModel }: ModelFormProps) {
  const { toast } = useToast();
  const fieldArray = useFieldArray({ control: form.control, name: 'properties', keyName: "id" });

  const handleFormSubmit = (values: ModelFormValues) => {
    const processedValues = { ...values };
    if (processedValues.displayPropertyNames?.includes(INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE)) {
      processedValues.displayPropertyNames = processedValues.displayPropertyNames.filter(name => name !== INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE);
    }
    if (processedValues.displayPropertyNames?.length === 0) {
      processedValues.displayPropertyNames = undefined;
    }
    processedValues.properties = (values.properties || []).map((prop, index) => ({
      ...prop,
      orderIndex: index,
    }));
    onSubmit(processedValues);
  };

  const handleFormInvalid = () => {
    toast({
      title: "Validation Error",
      description: "Please correct the errors highlighted in the form. Errors might be in collapsed sections.",
      variant: "destructive",
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit, handleFormInvalid)} className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Model Details</CardTitle>
          </CardHeader>
          <CardContent>
            <ModelFormDetails form={form} existingModel={existingModel} />
          </CardContent>
        </Card>

        <Separator />

        <PropertyList form={form} existingModel={existingModel} />

        <FormField
          control={form.control}
          name="properties"
          render={() => (
            <FormItem>
              <FormMessage className="text-destructive mt-2" />
            </FormItem>
          )}
        />
        
        <div className="flex justify-end space-x-2 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading || form.formState.isSubmitting} className="bg-primary hover:bg-primary/90">
            {isLoading || form.formState.isSubmitting ? 'Saving...' : (existingModel ? 'Update Model' : 'Create Model')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
