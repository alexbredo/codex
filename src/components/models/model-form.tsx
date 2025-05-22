
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

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
      const currentPrecision = form.getValues(`properties.${index}.precision`);
      if (currentPrecision === undefined) {
        form.setValue(`properties.${index}.precision`, 2);
      }
    }
    if (value !== 'date') {
      form.setValue(`properties.${index}.autoSetOnCreate`, false);
      form.setValue(`properties.${index}.autoSetOnUpdate`, false);
    }
  };
  
  return (
    <Accordion 
      type="multiple" 
      className="w-full space-y-2"
      defaultValue={fields.map(field => field.fieldId)} // Keep all items open by default
    >
      {fields.map((field, index) => {
        const currentPropertyType = form.watch(`properties.${index}.type`);
        const propertyName = form.watch(`properties.${index}.name`);
        const headerTitle = propertyName || `Property #${index + 1}`;

        return (
          <AccordionItem key={field.fieldId} value={field.fieldId} className="border bg-background/50 rounded-md">
            <AccordionTrigger className="p-4 hover:no-underline">
              <div className="flex justify-between items-center w-full">
                <span className="text-lg font-medium text-foreground">{headerTitle}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent accordion from toggling
                    remove(index);
                  }}
                  className="text-destructive hover:bg-destructive/10"
                  aria-label="Remove property"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </AccordionTrigger>
            <AccordionContent className="p-4 pt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  render={({ field: typeField }) => ( 
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
                              value={field.value ?? 2}
                              onChange={e => {
                                const valStr = e.target.value;
                                if (valStr === "") {
                                  field.onChange(undefined); 
                                } else {
                                  const num = parseInt(valStr, 10);
                                  field.onChange(isNaN(num) ? undefined : num);
                                }
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
                {currentPropertyType === 'date' && (
                  <>
                    <FormField
                      control={form.control}
                      name={`properties.${index}.autoSetOnCreate`}
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-0.5 leading-none">
                            <FormLabel className="text-sm">Auto-set on Create</FormLabel>
                            <FormDescription className="text-xs">Set to current date when a new object is created.</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`properties.${index}.autoSetOnUpdate`}
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-0.5 leading-none">
                            <FormLabel className="text-sm">Auto-set on Update</FormLabel>
                            <FormDescription className="text-xs">Set to current date when an object is updated.</FormDescription>
                          </div>
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
              </div>
            </AccordionContent>
          </AccordionItem>
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
            precision: undefined,
            autoSetOnCreate: false,
            autoSetOnUpdate: false,
        } as PropertyFormValues)}
        className="mt-2 w-full"
      >
        <PlusCircle className="mr-2 h-4 w-4" /> Add Property
      </Button>
    </Accordion>
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

  const displayPropertyOptions: MultiSelectOption[] = useMemo(() => {
    return (currentProperties || [])
      .filter(p => p.name && (p.type === 'string' || p.type === 'number' || p.type === 'date'))
      .map(p => ({ value: p.name, label: p.name }));
  }, [currentProperties]);
  
  const selectedDisplayPropertyNamesForSelect = useMemo(() => {
    const currentSelection = form.getValues("displayPropertyNames");
    if (!currentSelection || currentSelection.length === 0) {
      return [INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE];
    }
    return currentSelection;
  }, [form]);


  const handleFormSubmit = (values: ModelFormValues) => {
    if (values.displayPropertyNames && values.displayPropertyNames.includes(INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE)) {
        values.displayPropertyNames = values.displayPropertyNames.filter(dpName => dpName !== INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE);
    }
    if (values.displayPropertyNames && values.displayPropertyNames.length === 0) {
        values.displayPropertyNames = undefined;
    }
    
    values.properties = values.properties.map(prop => {
      const finalProp = { ...prop };
      if (prop.type !== 'number') {
        finalProp.unit = undefined;
        finalProp.precision = undefined;
      } else {
        finalProp.precision = prop.precision === undefined ? 2 : prop.precision;
      }
      if (prop.type !== 'date') {
        finalProp.autoSetOnCreate = false;
        finalProp.autoSetOnUpdate = false;
      }
      return finalProp;
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
                    options={[{value: INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE, label: "-- Default (Name/Title/ID) --"}, ...displayPropertyOptions]}
                    selected={selectedDisplayPropertyNamesForSelect}
                    onChange={(selectedValues) => {
                      if (selectedValues.includes(INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE) && selectedValues.length > 1) {
                        field.onChange(selectedValues.filter(v => v !== INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE));
                      } else if (selectedValues.length === 0 || (selectedValues.length === 1 && selectedValues[0] === INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE)) {
                         field.onChange([]); // Represent "-- Default --" as empty array internally
                      } else {
                        field.onChange(selectedValues);
                      }
                    }}
                    placeholder="Select properties..."
                    emptyIndicator={displayPropertyOptions.length === 0 ? "No string/number/date properties available." : "No matching properties."}
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

