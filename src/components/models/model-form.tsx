
'use client';

import type { Control, UseFormReturn, UseFieldArrayReturn } from 'react-hook-form';
import { useFieldArray, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Trash2, PlusCircle } from 'lucide-react';
import type { ModelFormValues } from './model-form-schema';
import { propertyTypes, relationshipTypes } from './model-form-schema';
import type { Model } from '@/lib/types';
import { useData } from '@/contexts/data-context';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ModelFormProps {
  form: UseFormReturn<ModelFormValues>;
  onSubmit: (values: ModelFormValues) => void;
  onCancel: () => void;
  isLoading?: boolean;
  existingModel?: Model;
}

function PropertyFields({ 
  form, 
  fieldArray,
  modelsForRelations,
  }: { 
  form: UseFormReturn<ModelFormValues>, 
  fieldArray: UseFieldArrayReturn<ModelFormValues, "properties", "id">,
  modelsForRelations: Model[]
}) {
  const { fields, append, remove } = fieldArray;
  const control = form.control;

  return (
    <div className="space-y-6">
      {fields.map((field, index) => {
        const currentPropertyType = form.watch(`properties.${index}.type`);
        return (
          <Card key={field.id} className="relative bg-background/50 p-0">
            <CardHeader className="p-4">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">Property #{index + 1}</CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  className="text-destructive hover:bg-destructive/10"
                  aria-label="Remove property"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={control}
                name={`properties.${index}.name`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., ProductName, UserAge" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name={`properties.${index}.type`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select 
                      onValueChange={(value) => {
                        field.onChange(value);
                        if (value !== 'relationship') {
                          form.setValue(`properties.${index}.relationshipType`, 'one');
                        }
                      }} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select property type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {propertyTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {currentPropertyType === 'relationship' && (
                <>
                  <FormField
                    control={control}
                    name={`properties.${index}.relatedModelId`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Related Model</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select related model" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {modelsForRelations.map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                {model.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name={`properties.${index}.relationshipType`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Relationship Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value || 'one'}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select relationship type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {relationshipTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type === 'one' ? 'One (Single Item)' : 'Many (Multiple Items)'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
              <FormField
                control={form.control}
                name={`properties.${index}.required`}
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 md:col-span-2">
                     <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Required</FormLabel>
                      <FormDescription>
                        Is this property mandatory for new objects?
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        )
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ id: crypto.randomUUID(), name: '', type: 'string', required: false, relationshipType: 'one' })}
        className="mt-2 w-full"
      >
        <PlusCircle className="mr-2 h-4 w-4" /> Add Property
      </Button>
    </div>
  );
}

const INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE = "__DEFAULT_DISPLAY_PROPERTY__";

export default function ModelForm({ form, onSubmit, onCancel, isLoading, existingModel }: ModelFormProps) {
  const { models } = useData();
  const fieldArray = useFieldArray({
    control: form.control,
    name: 'properties',
    keyName: "fieldId" // To avoid conflicts with property 'id'
  });

  const modelsForRelations = models.filter(m => !existingModel || m.id !== existingModel.id);

  const currentProperties = useWatch({ control: form.control, name: "properties" });
  const stringOrNumberProperties = (currentProperties || [])
    .filter(p => p.type === 'string' || p.type === 'number')
    .map(p => p.name);

  const handleFormSubmit = (values: ModelFormValues) => {
    // Ensure displayPropertyName is valid or cleared
    if (values.displayPropertyName && !values.properties.find(p => p.name === values.displayPropertyName && (p.type === 'string' || p.type === 'number'))) {
      values.displayPropertyName = undefined; 
    }
    onSubmit(values);
  };


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="flex flex-col h-full">
        <ScrollArea className="flex-grow">
          <div className="space-y-8 p-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Model Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Model Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Product, User, Article" {...field} />
                      </FormControl>
                      <FormDescription>A unique name for your data model.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="A brief description of what this model represents." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="displayPropertyName"
                  render={({ field }) => {
                    // If field.value is empty string or undefined, use the internal const for Select's value
                    // Otherwise, use the actual field.value
                    const selectValue = !field.value ? INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE : field.value;
                    
                    return (
                      <FormItem>
                        <FormLabel>Display Property (Optional)</FormLabel>
                        <Select 
                          value={selectValue}
                          onValueChange={(value) => {
                            // If internal const is selected, set form value to empty string (or undefined)
                            // Otherwise, set to the selected property name
                            field.onChange(value === INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE ? "" : value);
                          }}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="-- Default (ID or Name/Title) --" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE}>-- Default (ID or Name/Title) --</SelectItem>
                            {stringOrNumberProperties.map((propName) => (
                              <SelectItem key={propName} value={propName}>
                                {propName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Choose a string or number property to represent this model's objects in lists or relationships.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </CardContent>
            </Card>
            
            <Separator />

            <div>
              <h3 className="text-lg font-medium mb-4">Properties</h3>
              <PropertyFields form={form} fieldArray={fieldArray} modelsForRelations={modelsForRelations} />
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-end space-x-2 p-6 pt-4 border-t bg-background z-10 flex-shrink-0">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading} className="bg-primary hover:bg-primary/90">
            {isLoading ? 'Saving...' : (existingModel ? 'Update Model' : 'Create Model')}
          </Button>
        </div>
      </form>
    </Form>
  );
}

