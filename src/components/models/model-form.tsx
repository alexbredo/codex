
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
  SelectGroup,
  SelectItem,
  SelectLabel as UiSelectLabel, 
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
import { Card, CardHeader, CardTitle, CardContent as UiCardContent } from '@/components/ui/card'; // Renamed CardContent
import { Separator } from '@/components/ui/separator';
import { Trash2, PlusCircle, GripVertical, FolderOpen } from 'lucide-react';
import type { ModelFormValues, PropertyFormValues } from './model-form-schema';
import { propertyTypes, relationshipTypes } from './model-form-schema';
import type { Model, ModelGroup } from '@/lib/types';
import { useData } from '@/contexts/data-context';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MultiSelectAutocomplete, type MultiSelectOption } from '@/components/ui/multi-select-autocomplete';
import { useMemo, useState, useEffect } from 'react';
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
const INTERNAL_DEFAULT_NAMESPACE_VALUE = "__DEFAULT_NAMESPACE_VALUE__";


interface SortablePropertyItemProps {
  id: string; 
  children: (props: { dragHandleListeners?: any }) => React.ReactNode;
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
    zIndex: isDragging ? 10 : undefined, // Ensure dragging item is on top
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className={className}>
      {children({ dragHandleListeners: listeners })}
    </div>
  );
}


const PropertyAccordionContent = ({ form, index, currentPropertyType, modelsForRelationsGrouped, control, handleTypeChange }: {
  form: UseFormReturn<ModelFormValues>,
  index: number,
  currentPropertyType: PropertyFormValues['type'],
  modelsForRelationsGrouped: Record<string, Model[]>,
  control: Control<ModelFormValues>,
  handleTypeChange: (value: string, index: number) => void
}) => {
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
                        {type === 'rating' ? 'Rating (1-5 Stars)' : type.charAt(0).toUpperCase() + type.slice(1)}
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
                        {Object.entries(modelsForRelationsGrouped).map(([namespace, modelsInNamespace]) => (
                          <SelectGroup key={namespace}>
                            <UiSelectLabel>{namespace}</UiSelectLabel>
                            {modelsInNamespace.map((model: Model) => (
                              <SelectItem key={model.id} value={model.id}>
                                {model.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
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
          {currentPropertyType === 'string' && (
             <FormField
                control={form.control}
                name={`properties.${index}.isUnique`}
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 md:col-span-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-0.5 leading-none">
                      <FormLabel className="text-sm">Enforce Unique Value</FormLabel>
                      <FormDescription className="text-xs">Ensure this property's value is unique across all objects of this model.</FormDescription>
                    </div>
                  </FormItem>
                )}
              />
          )}
          { /* Fields not applicable to 'rating' or 'markdown' are hidden by conditional rendering based on currentPropertyType */ }
          { currentPropertyType !== 'rating' && currentPropertyType !== 'markdown' && (
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
          )}
          { (currentPropertyType === 'rating' || currentPropertyType === 'markdown') && (
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
                        Is this {currentPropertyType} field mandatory?
                       </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
          )}
        </div>
      </AccordionContent>
  );
};


function PropertyFieldsWithDnd({
  form,
  fieldArray,
  modelsForRelationsGrouped,
}: {
  form: UseFormReturn<ModelFormValues>,
  fieldArray: UseFieldArrayReturn<ModelFormValues, "properties", "id">,
  modelsForRelationsGrouped: Record<string, Model[]>
}) {
  const { fields, append, remove, move } = fieldArray;
  const control = form.control;

  const [openAccordionItems, setOpenAccordionItems] = useState<string[]>([]);

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
        // Update orderIndex in form values after move
        const newOrderedProperties = arrayMove(form.getValues('properties'), oldIndex, newIndex);
        newOrderedProperties.forEach((prop, idx) => {
          form.setValue(`properties.${idx}.orderIndex`, idx, { shouldValidate: false, shouldDirty: true, shouldTouch: true });
        });
      }
    }
  }
  
  useEffect(() => {
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
  }, [form.formState.errors.properties, fields]);


  const handleTypeChange = (value: string, index: number) => {
    const propertyType = value as PropertyFormValues['type'];
    form.setValue(`properties.${index}.type`, propertyType);

    const isRelationship = propertyType === 'relationship';
    const isNumber = propertyType === 'number';
    const isDate = propertyType === 'date';
    const isString = propertyType === 'string';
    const isMarkdown = propertyType === 'markdown';
    const isRating = propertyType === 'rating';

    form.setValue(`properties.${index}.relationshipType`, isRelationship ? (form.getValues(`properties.${index}.relationshipType`) || 'one') : undefined);
    form.setValue(`properties.${index}.relatedModelId`, isRelationship ? form.getValues(`properties.${index}.relatedModelId`) : undefined);
    
    form.setValue(`properties.${index}.unit`, isNumber ? form.getValues(`properties.${index}.unit`) : undefined);
    form.setValue(`properties.${index}.precision`, isNumber ? (form.getValues(`properties.${index}.precision`) ?? 2) : undefined);
    
    form.setValue(`properties.${index}.autoSetOnCreate`, isDate ? form.getValues(`properties.${index}.autoSetOnCreate`) : false);
    form.setValue(`properties.${index}.autoSetOnUpdate`, isDate ? form.getValues(`properties.${index}.autoSetOnUpdate`) : false);
    
    form.setValue(`properties.${index}.isUnique`, isString ? form.getValues(`properties.${index}.isUnique`) : false);

    // Reset fields not applicable to markdown or rating
    if (isMarkdown || isRating) {
      form.setValue(`properties.${index}.unit`, undefined);
      form.setValue(`properties.${index}.precision`, undefined);
      form.setValue(`properties.${index}.relatedModelId`, undefined);
      form.setValue(`properties.${index}.relationshipType`, undefined);
      form.setValue(`properties.${index}.autoSetOnCreate`, false);
      form.setValue(`properties.${index}.autoSetOnUpdate`, false);
      form.setValue(`properties.${index}.isUnique`, false);
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
              <SortablePropertyItem key={fieldItem.id} id={fieldItem.id} className="bg-card rounded-md border">
                 {(dndProps) => ( // Render prop pattern for SortablePropertyItem
                    <AccordionItem value={fieldItem.id} className="border-0"> 
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
                            modelsForRelationsGrouped={modelsForRelationsGrouped}
                            control={control}
                            handleTypeChange={handleTypeChange}
                        />
                    </AccordionItem>
                 )}
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
            isUnique: false,
            orderIndex: fields.length, // Will be updated on save
        } as PropertyFormValues, {shouldFocus: false})}
        className="mt-4 w-full border-dashed hover:border-solid"
      >
        <PlusCircle className="mr-2 h-4 w-4" /> Add Property
      </Button>
    </DndContext>
  );
}


export default function ModelForm({ form, onSubmit, onCancel, isLoading, existingModel }: ModelFormProps) {
  const { models, modelGroups, isReady: dataReady } = useData();
  const { toast } = useToast(); 
  const fieldArray = useFieldArray({
    control: form.control,
    name: 'properties',
    keyName: "id" 
  });

  const modelsForRelations = useMemo(() => {
    return models.filter(m => !existingModel || m.id !== existingModel.id);
  }, [models, existingModel]);

  const modelsForRelationsGrouped = useMemo(() => {
    return modelsForRelations.reduce((acc, model) => {
      const namespace = model.namespace || 'Default';
      if (!acc[namespace]) {
        acc[namespace] = [];
      }
      acc[namespace].push(model);
      return acc;
    }, {} as Record<string, Model[]>);
  }, [modelsForRelations]);


  const currentProperties = useWatch({ control: form.control, name: "properties" });
  const watchedDisplayPropertyNames = useWatch({ control: form.control, name: "displayPropertyNames" });


  const displayPropertyOptions: MultiSelectOption[] = useMemo(() => {
    return (currentProperties || [])
      .filter(p => p.name && (p.type === 'string' || p.type === 'number' || p.type === 'date')) // Only string, number, date for display
      .map(p => ({ value: p.name!, label: p.name! })); 
  }, [currentProperties]);

  const selectedValuesForAutocomplete = useMemo(() => {
    const currentDisplayNames = Array.isArray(watchedDisplayPropertyNames) ? watchedDisplayPropertyNames : [];
    
    if (!currentDisplayNames.length && !existingModel?.displayPropertyNames?.length) {
        return [INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE];
    }
    
    const validSelectedValues = currentDisplayNames.filter(name => 
      name === INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE || displayPropertyOptions.some(opt => opt.value === name)
    );

    // If only default is "selected" but it wasn't explicitly chosen, and no other actual properties are selected
    if (validSelectedValues.length === 0 && (currentDisplayNames.includes(INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE) || !currentDisplayNames.length )) {
        return [INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE];
    }
    // If default is selected but actual properties are also selected, remove default
    if (validSelectedValues.length > 1 && validSelectedValues.includes(INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE)) {
        return validSelectedValues.filter(v => v !== INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE);
    }


    return validSelectedValues.length > 0 ? validSelectedValues : [INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE];

  }, [watchedDisplayPropertyNames, displayPropertyOptions, existingModel?.displayPropertyNames]);


  const handleFormSubmit = (values: ModelFormValues) => {
    const processedValues = { ...values };
    
    if (processedValues.displayPropertyNames && processedValues.displayPropertyNames.includes(INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE)) {
        const filtered = processedValues.displayPropertyNames.filter(dpName => dpName !== INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE);
        // Set to undefined if only default was selected or if it was empty
        processedValues.displayPropertyNames = filtered.length > 0 ? filtered : undefined;
    } else if (processedValues.displayPropertyNames && processedValues.displayPropertyNames.length === 0) {
        processedValues.displayPropertyNames = undefined; // Explicitly undefined for empty array
    }

    if (!processedValues.namespace || processedValues.namespace.trim() === '' || processedValues.namespace === INTERNAL_DEFAULT_NAMESPACE_VALUE) {
      processedValues.namespace = 'Default';
    }

    processedValues.properties = processedValues.properties.map((prop, index) => {
      const finalProp: PropertyFormValues = { ...prop };
      finalProp.orderIndex = index;

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
      if (prop.type !== 'string') {
        finalProp.isUnique = false;
      }
       if (prop.type !== 'relationship') {
        finalProp.relatedModelId = undefined;
        finalProp.relationshipType = undefined;
      }
      if (prop.type === 'rating' || prop.type === 'markdown' || prop.type === 'boolean') { // Reset fields not applicable to rating, markdown, boolean
        finalProp.unit = undefined;
        finalProp.precision = undefined;
        finalProp.relatedModelId = undefined;
        finalProp.relationshipType = undefined;
        finalProp.autoSetOnCreate = false;
        finalProp.autoSetOnUpdate = false;
        finalProp.isUnique = false;
      }
      return finalProp;
    });
    onSubmit(processedValues);
  };
  
  const handleFormInvalid = (/* errors: FieldErrors<ModelFormValues> */) => {
    console.log("Form validation failed. Current form values:", JSON.stringify(form.getValues(), null, 2)); // DEBUG
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
          <Accordion type="single" collapsible defaultValue="model-details-content" className="w-full">
            <AccordionItem value="model-details-content" className="border-0">
              <UiCardContent className="p-6 pt-0 space-y-4"> {/* Use UiCardContent to avoid name clash */}
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
                    name="namespace"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Namespace</FormLabel>
                        <Select
                            onValueChange={(value) => field.onChange(value === INTERNAL_DEFAULT_NAMESPACE_VALUE ? 'Default' : value)}
                            defaultValue={field.value === 'Default' || !field.value ? INTERNAL_DEFAULT_NAMESPACE_VALUE : field.value}
                        >
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a namespace" />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value={INTERNAL_DEFAULT_NAMESPACE_VALUE}>-- Default --</SelectItem>
                                {dataReady && modelGroups.sort((a,b) => a.name.localeCompare(b.name)).map((group) => (
                                    <SelectItem key={group.id} value={group.name}>
                                        {group.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormDescription>Organize models into groups. Select an existing group or use 'Default'.</FormDescription>
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
                        <Textarea placeholder="A brief description of what this model represents." {...field} value={field.value ?? ''}/>
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
                            emptyIndicator={displayPropertyOptions.length === 0 ? "No string/number/date properties available to choose from current model properties." : "No matching properties."}
                        />
                        <FormDescription>
                            Choose string, number, or date properties to represent this model's objects. If empty, a default (Name/Title/ID) will be used.
                        </FormDescription>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                 {/* This FormField is for displaying array-level errors (e.g., "At least one property is required") */}
                <FormField
                  control={form.control}
                  name="properties" 
                  render={() => ( 
                    <FormItem>
                      <FormMessage className="text-destructive mt-2" />
                    </FormItem>
                  )}
                />
              </UiCardContent>
            </AccordionItem>
          </Accordion>
        </Card>

        <Separator />

        <div>
          <h3 className="text-lg font-medium mb-2">Properties</h3>
          <PropertyFieldsWithDnd form={form} fieldArray={fieldArray} modelsForRelationsGrouped={modelsForRelationsGrouped} />
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
