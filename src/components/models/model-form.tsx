
'use client';

import type { Control, UseFormReturn, UseFieldArrayReturn, FieldErrors } from 'react-hook-form';
import { useFieldArray, useWatch } from 'react-hook-form';
import * as React from 'react';
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
import { Trash2, PlusCircle, GripVertical } from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ModelFormProps {
  form: UseFormReturn<ModelFormValues>;
  onSubmit: (values: ModelFormValues) => void;
  onCancel: () => void;
  isLoading?: boolean;
  existingModel?: Model;
}

const INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE = "__DEFAULT_DISPLAY_PROPERTY__";
const INTERNAL_DEFAULT_OPTION_VALUE = "__DEFAULT_OPTION__";


interface SortablePropertyItemProps {
  id: string;
  index: number;
  children: React.ReactElement<{ dragHandleListeners?: any }>; // Children will be AccordionItem
  className?: string;
}

function SortablePropertyItem({ id, children, className }: SortablePropertyItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className={className}>
      {/* Pass listeners to the child (AccordionItem) which will pass to drag handle in AccordionTrigger */}
      {React.cloneElement(children, { dragHandleListeners: listeners })}
    </div>
  );
}


function PropertyFields({
  form,
  fieldArray,
  modelsForRelations,
}: {
  form: UseFormReturn<ModelFormValues>,
  fieldArray: UseFieldArrayReturn<ModelFormValues, "properties", "fieldId">,
  modelsForRelations: Model[]
}) {
  const { fields, append, remove, move } = fieldArray;
  const control = form.control;

  const [openAccordionItems, setOpenAccordionItems] = React.useState<string[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = fields.findIndex((field) => field.id === active.id); // field.id is fieldId from useFieldArray
      const newIndex = fields.findIndex((field) => field.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        move(oldIndex, newIndex);
      }
    }
  }
  
  React.useEffect(() => {
    const itemsToOpen = new Set<string>();
    const propertiesErrors = form.formState.errors.properties;

    if (Array.isArray(propertiesErrors)) {
        fields.forEach((fieldItem, idx) => {
            const propertyErrorAtIndex = propertiesErrors[idx] as FieldErrors<PropertyFormValues> | undefined;
            if (propertyErrorAtIndex && typeof propertyErrorAtIndex === 'object' && Object.keys(propertyErrorAtIndex).length > 0) {
                const hasFieldError = Object.values(propertyErrorAtIndex).some(
                    (errorField: any) => errorField && typeof errorField.message === 'string'
                );
                if (hasFieldError && fieldItem.id) { 
                    itemsToOpen.add(fieldItem.id); // Use field.id which is fieldId
                }
            }
        });
    }
    
    if (itemsToOpen.size > 0) {
      setOpenAccordionItems(prevOpen => {
        const newOpenState = new Set(prevOpen);
        itemsToOpen.forEach(id => newOpenState.add(id));
        return Array.from(newOpenState);
      });
    }
  }, [form.formState.errors.properties, fields, setOpenAccordionItems]);


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
      if (currentPrecision === undefined || currentPrecision === null || isNaN(Number(currentPrecision))) {
        form.setValue(`properties.${index}.precision`, 2);
      }
    }
    if (value !== 'date') {
      form.setValue(`properties.${index}.autoSetOnCreate`, false);
      form.setValue(`properties.${index}.autoSetOnUpdate`, false);
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
        <Accordion
          type="multiple"
          className="w-full space-y-2"
          value={openAccordionItems} 
          onValueChange={setOpenAccordionItems} 
        >
          {fields.map((fieldItem, index) => {
            const currentPropertyType = form.watch(`properties.${index}.type`);
            const propertyName = form.watch(`properties.${index}.name`);
            const headerTitle = propertyName || `Property #${index + 1}`;

            return (
              // fieldItem.id here is the fieldId from useFieldArray, used for SortableContext items and useSortable id
              <SortablePropertyItem key={fieldItem.id} id={fieldItem.id} index={index} className="border bg-background/50 rounded-md">
                <AccordionItem value={fieldItem.id} className="border-0">
                  {/* dragHandleListeners needs to be passed from SortablePropertyItem to AccordionTrigger */}
                  {(propsFromSortable: { dragHandleListeners?: any }) => (
                    <AccordionTrigger className="p-4 hover:no-underline">
                      <div className="flex justify-between items-center w-full">
                        <div className="flex items-center gap-2">
                           <span {...propsFromSortable.dragHandleListeners} className="cursor-grab p-1 -ml-1">
                            <GripVertical className="h-5 w-5 text-muted-foreground" />
                          </span>
                          <span className="text-lg font-medium text-foreground truncate mr-2">{headerTitle}</span>
                        </div>
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation(); 
                            remove(index);
                          }}
                          className="text-destructive hover:bg-destructive/10 flex-shrink-0"
                          aria-label="Remove property"
                        >
                          <span
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                remove(index);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </span>
                        </Button>
                      </div>
                    </AccordionTrigger>
                  )}
                </AccordionItem>
              </SortablePropertyItem>
            );
          })}
        </Accordion>
      </SortableContext>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({
            id: crypto.randomUUID(), // This is the actual data ID, useFieldArray will manage fieldId
            name: '',
            type: 'string',
            required: false,
            relationshipType: 'one',
            unit: undefined,
            precision: undefined, 
            autoSetOnCreate: false,
            autoSetOnUpdate: false,
            orderIndex: fields.length, // Tentative, will be finalized on save
        } as PropertyFormValues)}
        className="mt-2 w-full"
      >
        <PlusCircle className="mr-2 h-4 w-4" /> Add Property
      </Button>
    </DndContext>
  );
}

// Temporarily extract the AccordionItem's content to make the DND setup simpler
// We will pass dragHandleListeners to the AccordionTrigger now more easily.
const PropertyAccordionContent = ({ form, index, currentPropertyType, modelsForRelations, control, handleTypeChange }: any) => {
  return (
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
                        {modelsForRelations.map((model: Model) => (
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
                        value={field.value ?? ''} 
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
  );
};


// Re-integrate PropertyFields with the modified AccordionItem structure for DND
function PropertyFieldsWithDnd({
  form,
  fieldArray,
  modelsForRelations,
}: {
  form: UseFormReturn<ModelFormValues>,
  fieldArray: UseFieldArrayReturn<ModelFormValues, "properties", "fieldId">,
  modelsForRelations: Model[]
}) {
  const { fields, append, remove, move } = fieldArray;
  const control = form.control;

  const [openAccordionItems, setOpenAccordionItems] = React.useState<string[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = fields.findIndex((field) => field.id === active.id);
      const newIndex = fields.findIndex((field) => field.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        move(oldIndex, newIndex);
      }
    }
  }
  
  React.useEffect(() => {
    const itemsToOpen = new Set<string>();
    const propertiesErrors = form.formState.errors.properties;

    if (Array.isArray(propertiesErrors)) {
        fields.forEach((fieldItem, idx) => {
            const propertyErrorAtIndex = propertiesErrors[idx] as FieldErrors<PropertyFormValues> | undefined;
            if (propertyErrorAtIndex && typeof propertyErrorAtIndex === 'object' && Object.keys(propertyErrorAtIndex).length > 0) {
                const hasFieldError = Object.values(propertyErrorAtIndex).some(
                    (errorField: any) => errorField && typeof errorField.message === 'string'
                );
                if (hasFieldError && fieldItem.id) { 
                    itemsToOpen.add(fieldItem.id);
                }
            }
        });
    }
    
    if (itemsToOpen.size > 0) {
      setOpenAccordionItems(prevOpen => {
        const newOpenState = new Set(prevOpen);
        itemsToOpen.forEach(id => newOpenState.add(id));
        return Array.from(newOpenState);
      });
    }
  }, [form.formState.errors.properties, fields, setOpenAccordionItems]);


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
      if (currentPrecision === undefined || currentPrecision === null || isNaN(Number(currentPrecision))) {
        form.setValue(`properties.${index}.precision`, 2);
      }
    }
    if (value !== 'date') {
      form.setValue(`properties.${index}.autoSetOnCreate`, false);
      form.setValue(`properties.${index}.autoSetOnUpdate`, false);
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
        <Accordion
          type="multiple"
          className="w-full space-y-2"
          value={openAccordionItems} 
          onValueChange={setOpenAccordionItems} 
        >
          {fields.map((fieldItem, index) => {
            const currentPropertyType = form.watch(`properties.${index}.type`);
            const propertyName = form.watch(`properties.${index}.name`);
            const headerTitle = propertyName || `Property #${index + 1}`;

            return (
              <SortablePropertyItem key={fieldItem.id} id={fieldItem.id} index={index} className="bg-card rounded-md border">
                 {/* Pass dragHandleListeners down to AccordionTrigger */}
                <AccordionItem value={fieldItem.id} className="border-0"> 
                  {(dndProps: { dragHandleListeners?: any }) => (
                    <>
                      <AccordionTrigger className="p-4 hover:no-underline data-[state=open]:border-b">
                        <div className="flex justify-between items-center w-full">
                          <div className="flex items-center gap-2">
                            <span {...dndProps.dragHandleListeners} className="cursor-grab p-1 -ml-1 text-muted-foreground hover:text-foreground">
                              <GripVertical className="h-5 w-5" />
                            </span>
                            <span className="text-lg font-medium text-foreground truncate mr-2">{headerTitle}</span>
                          </div>
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation(); 
                              remove(index);
                            }}
                            className="text-destructive hover:bg-destructive/10 flex-shrink-0"
                            aria-label="Remove property"
                          >
                            <span
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  remove(index);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </span>
                          </Button>
                        </div>
                      </AccordionTrigger>
                      <PropertyAccordionContent
                        form={form}
                        index={index}
                        currentPropertyType={currentPropertyType}
                        modelsForRelations={modelsForRelations}
                        control={control}
                        handleTypeChange={handleTypeChange}
                      />
                    </>
                  )}
                </AccordionItem>
              </SortablePropertyItem>
            );
          })}
        </Accordion>
      </SortableContext>
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
            orderIndex: fields.length,
        } as PropertyFormValues)}
        className="mt-4 w-full border-dashed hover:border-solid"
      >
        <PlusCircle className="mr-2 h-4 w-4" /> Add Property
      </Button>
    </DndContext>
  );
}


export default function ModelForm({ form, onSubmit, onCancel, isLoading, existingModel }: ModelFormProps) {
  const { models } = useData();
  const { toast } = useToast(); 
  const fieldArray = useFieldArray({
    control: form.control,
    name: 'properties',
    keyName: "id" // Use fieldItem.id from RHF for dnd keys
  });

  const modelsForRelations = models.filter(m => !existingModel || m.id !== existingModel.id);

  const currentProperties = useWatch({ control: form.control, name: "properties" });
  const watchedDisplayPropertyNames = useWatch({ control: form.control, name: "displayPropertyNames" });


  const displayPropertyOptions: MultiSelectOption[] = useMemo(() => {
    return (currentProperties || [])
      .filter(p => p.name && (p.type === 'string' || p.type === 'number' || p.type === 'date')) 
      .map(p => ({ value: p.name!, label: p.name! })); 
  }, [currentProperties]);

  const selectedValuesForAutocomplete = useMemo(() => {
    const currentDisplayNames = Array.isArray(watchedDisplayPropertyNames) ? watchedDisplayPropertyNames : [];
    
    if (!currentDisplayNames && !existingModel?.displayPropertyNames?.length) {
        return [INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE];
    }
    
    const validSelectedValues = (currentDisplayNames || []).filter(name => 
      name === INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE || displayPropertyOptions.some(opt => opt.value === name)
    );

    if (validSelectedValues.length === 0 && ((currentDisplayNames || []).includes(INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE) || !(currentDisplayNames || []).length )) {
        return [INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE];
    }
    if (validSelectedValues.length === 1 && validSelectedValues[0] === INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE && (currentDisplayNames || []).length > 1) {
      return (currentDisplayNames || []).filter(name => name !== INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE);
    }

    return validSelectedValues.length > 0 ? validSelectedValues : [INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE];

  }, [watchedDisplayPropertyNames, displayPropertyOptions, existingModel?.displayPropertyNames]);

  const handleFormSubmit = (values: ModelFormValues) => {
    const processedValues = { ...values };
    
    if (processedValues.displayPropertyNames && processedValues.displayPropertyNames.includes(INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE)) {
        const filtered = processedValues.displayPropertyNames.filter(dpName => dpName !== INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE);
        processedValues.displayPropertyNames = filtered.length > 0 ? filtered : undefined;
    } else if (processedValues.displayPropertyNames && processedValues.displayPropertyNames.length === 0) {
        processedValues.displayPropertyNames = undefined;
    }


    processedValues.properties = processedValues.properties.map(prop => {
      const finalProp = { ...prop };
      if (prop.type !== 'number') {
        finalProp.unit = undefined;
        finalProp.precision = undefined;
      } else {
        finalProp.precision = (prop.precision === undefined || prop.precision === null || isNaN(Number(prop.precision))) ? 2 : Number(prop.precision);
      }
      if (prop.type !== 'date') {
        finalProp.autoSetOnCreate = false;
        finalProp.autoSetOnUpdate = false;
      }
      return finalProp;
    });
    onSubmit(processedValues);
  };
  
  const handleFormInvalid = (/* errors: FieldErrors<ModelFormValues> */) => {
    // Log the form values to see what data is causing validation failure
    console.log("Form validation failed. Current form values:", JSON.stringify(form.getValues(), null, 2)); // DEBUG
    // Log the authoritative errors object from formState
    // console.error("Client-side form validation. Current form.formState.errors:", form.formState.errors); // DEBUG
    
    toast({
      title: "Validation Error",
      description: "Please correct the errors highlighted in the form. Some errors might be in collapsed sections.",
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
                        options={[{ value: INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE, label: "-- Default (Name/Title/ID) --" }, ...displayPropertyOptions]}
                        selected={selectedValuesForAutocomplete}
                        onChange={(selectedOptsFromAutocomplete) => {
                        const isDefaultSelected = selectedOptsFromAutocomplete.includes(INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE);
                        const actualPropertiesSelected = selectedOptsFromAutocomplete.filter(v => v !== INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE);

                        if (isDefaultSelected && actualPropertiesSelected.length === 0) {
                            field.onChange([]); 
                        } else {
                            field.onChange(actualPropertiesSelected);
                        }
                        }}
                        placeholder="Select properties..."
                        emptyIndicator={displayPropertyOptions.length === 0 ? "No string/number/date properties available." : "No matching properties."}
                    />
                    <FormDescription>
                        Choose string, number, or date properties to represent this model's objects. They will be shown concatenated with spaces. If empty, a default (Name/Title/ID) will be used.
                    </FormDescription>
                    <FormMessage />
                    </FormItem>
                )}
            />
             <FormField
              control={form.control}
              name="properties" 
              render={() => ( 
                <FormItem>
                  <FormMessage className="text-destructive" />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Separator />

        <div>
          <h3 className="text-lg font-medium mb-2">Properties</h3>
          <PropertyFieldsWithDnd form={form} fieldArray={fieldArray} modelsForRelations={modelsForRelations} />
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
