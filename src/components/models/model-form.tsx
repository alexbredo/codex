
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
import type { ModelFormValues, PropertyFormValues } from './model-form-schema';
import { propertyTypes, relationshipTypes } from './model-form-schema';
import type { Model } from '@/lib/types';
import { useData } from '@/contexts/data-context';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MultiSelectAutocomplete, type MultiSelectOption } from '@/components/ui/multi-select-autocomplete';
import { useMemo } from 'react';

interface ModelFormProps {
  form: UseFormReturn<ModelFormValues>;
  onSubmit: (values: ModelFormValues) => void;
  onCancel: () => void; 
  isLoading?: boolean;
  existingModel?: Model; 
}

const INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE = "__DEFAULT_DISPLAY_PROPERTY__";

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

  const handleTypeChange = (value: string, index: number) => {
    form.setValue(`properties.${index}.type`, value as PropertyFormValues['type']);
    if (value !== 'relationship') {
      form.setValue(`properties.${index}.relationshipType`, 'one');
      form.setValue(`properties.${index}.relatedModelId`, undefined);
    }
    if (value !== 'number') {
      form.setValue(`properties.${index}.unit`, undefined);
      form.setValue(`properties.${index}.precision`, undefined);
    } else {
      // Set default precision if not already set
      const currentPrecision = form.getValues(`properties.${index}.precision`);
      if (currentPrecision === undefined) {
        form.setValue(`properties.${index}.precision`, 2);
      }
    }
  };
  
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
                render={({ field: typeField }) => ( // Renamed field to typeField
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select
                      onValueChange={(value) => handleTypeChange(value, index)}
                      defaultValue={typeField.value}
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
              {currentPropertyType === 'number' && (
                <>
                  <FormField
                    control={control}
                    name={`properties.${index}.unit`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., kg, USD, pcs" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name={`properties.${index}.precision`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Precision (0-10)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min="0" 
                            max="10" 
                            placeholder="e.g., 2" 
                            {...field} 
                            value={field.value ?? 2} // Default to 2 visually if undefined
                            onChange={e => field.onChange(parseInt(e.target.value, 10))}
                          />
                        </FormControl>
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
        onClick={() => append({ 
            id: crypto.randomUUID(), 
            name: '', 
            type: 'string', 
            required: false, 
            relationshipType: 'one', 
            unit: undefined, 
            precision: undefined 
        } as PropertyFormValues)}
        className="mt-2 w-full"
      >
        <PlusCircle className="mr-2 h-4 w-4" /> Add Property
      </Button>
    </div>
  );
}


export default function ModelForm({ form, onSubmit, onCancel, isLoading, existingModel }: ModelFormProps) {
  const { models } = useData();
  const fieldArray = useFieldArray({
    control: form.control,
    name: 'properties',
    keyName: "fieldId"
  });

  const modelsForRelations = models.filter(m => !existingModel || m.id !== existingModel.id);

  const currentProperties = useWatch({ control: form.control, name: "properties" });

  const displayPropertyOptions = useMemo(() => {
    return (currentProperties || [])
      .filter(p => p.type === 'string' || p.type === 'number' || p.type === 'date')
      .map(p => ({ value: p.name, label: p.name }));
  }, [currentProperties]);
  
  const handleFormSubmit = (values: ModelFormValues) => {
    // Ensure displayPropertyNames are valid
    if (values.displayPropertyNames && values.displayPropertyNames.length > 0) {
      values.displayPropertyNames = values.displayPropertyNames.filter(dpName =>
        values.properties.some(p => p.name === dpName && (p.type === 'string' || p.type === 'number' || p.type === 'date'))
      );
      if (values.displayPropertyNames.length === 0) {
        values.displayPropertyNames = undefined;
      }
    } else {
      values.displayPropertyNames = undefined;
    }

    // Ensure unit and precision are only set for number types
    values.properties = values.properties.map(prop => {
      if (prop.type !== 'number') {
        return { ...prop, unit: undefined, precision: undefined };
      } else {
        // Ensure precision has a default if not set by user but type is number
        return { ...prop, precision: prop.precision === undefined ? 2 : prop.precision };
      }
    });
    onSubmit(values);
  };


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-8">
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
              name="displayPropertyNames"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Properties (Optional)</FormLabel>
                  <MultiSelectAutocomplete
                    options={displayPropertyOptions}
                    selected={field.value || []}
                    onChange={(selectedValues) => {
                      const validSelected = selectedValues.filter(val =>
                        (currentProperties || []).some(p => p.name === val && (p.type === 'string' || p.type === 'number' || p.type === 'date'))
                      );
                      field.onChange(validSelected);
                    }}
                    placeholder="-- Default (Name/Title/ID) --"
                    emptyIndicator="No string/number/date properties available."
                  />
                  <FormDescription>
                    Choose string, number, or date properties to represent this model's objects. They will be shown concatenated.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Separator />

        <div>
          <h3 className="text-lg font-medium mb-4">Properties</h3>
          <PropertyFields form={form} fieldArray={fieldArray} modelsForRelations={modelsForRelations} />
        </div>

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
