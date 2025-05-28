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
import { Card, CardHeader, CardTitle, CardContent as UiCardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Trash2, PlusCircle, GripVertical, FolderOpen, CalendarIcon as CalendarIconLucide, Network } from 'lucide-react'; // Renamed CalendarIcon
import type { ModelFormValues, PropertyFormValues } from './model-form-schema';
import { propertyTypes, relationshipTypes } from './model-form-schema';
import type { Model, ModelGroup, WorkflowWithDetails } from '@/lib/types';
import { useData } from '@/contexts/data-context';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MultiSelectAutocomplete, type MultiSelectOption } from '@/components/ui/multi-select-autocomplete';
import { useMemo, useState, useEffect, useRef } from 'react';
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
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn, getObjectDisplayValue } from '@/lib/utils';
import { format as formatDateFns, isValid as isDateValid } from 'date-fns';
import { StarRatingInput } from '@/components/ui/star-rating-input';


interface ModelFormProps {
  form: UseFormReturn<ModelFormValues>;
  onSubmit: (values: ModelFormValues) => void;
  onCancel: () => void;
  isLoading?: boolean;
  existingModel?: Model;
}

const INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE = "__DEFAULT_DISPLAY_PROPERTY__";
const INTERNAL_DEFAULT_NAMESPACE_VALUE = "__DEFAULT_NAMESPACE_VALUE__";
const INTERNAL_BOOLEAN_NOT_SET_VALUE = "__BOOLEAN_NOT_SET__";
const INTERNAL_RELATIONSHIP_DEFAULT_NOT_SET_VALUE = "__RELATIONSHIP_DEFAULT_NOT_SET__";
const INTERNAL_NO_WORKFLOW_VALUE = "__NO_WORKFLOW_SELECTED__";


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
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className={className}>
      {children({ dragHandleListeners: listeners })}
    </div>
  );
}


const PropertyAccordionContent = ({ form, index, modelsForRelationsGrouped }: {
  form: UseFormReturn<ModelFormValues>,
  index: number,
  modelsForRelationsGrouped: Record<string, Model[]>,
}) => {
  const control = form.control;
  const { getModelById, getObjectsByModelId, allModels, getAllObjects } = useData();

  const propertyTypePath = `properties.${index}.type` as const;
  const relatedModelIdPath = `properties.${index}.relatedModelId` as const;
  const relationshipTypePath = `properties.${index}.relationshipType` as const;

  const currentPropertyType = useWatch({ control, name: propertyTypePath });
  const currentRelatedModelId = useWatch({ control, name: relatedModelIdPath });
  const currentRelationshipType = useWatch({ control, name: relationshipTypePath });

  const previousPropertyTypeRef = useRef<PropertyFormValues['type']>();
  const previousRelatedModelIdRef = useRef<string | undefined>();
  const previousRelationshipTypeRef = useRef<PropertyFormValues['relationshipType']>();


 useEffect(() => {
    if (previousPropertyTypeRef.current === undefined && previousRelatedModelIdRef.current === undefined && previousRelationshipTypeRef.current === undefined) {
      // Initial mount or form reset, store current values to avoid immediate reset
      previousPropertyTypeRef.current = currentPropertyType;
      previousRelatedModelIdRef.current = currentRelatedModelId;
      previousRelationshipTypeRef.current = currentRelationshipType;
      return;
    }

    let typeChanged = currentPropertyType !== previousPropertyTypeRef.current;
    let relatedModelChanged = currentPropertyType === 'relationship' && currentRelatedModelId !== previousRelatedModelIdRef.current;
    let relationshipTypeChanged = currentPropertyType === 'relationship' && currentRelationshipType !== previousRelationshipTypeRef.current;

    if (typeChanged || relatedModelChanged || relationshipTypeChanged) {
      // console.log(`[ModelForm Property ${index}] Change detected. Type: ${typeChanged}, RelatedModel: ${relatedModelChanged}, RelType: ${relationshipTypeChanged}`);
      // console.log(`[ModelForm Property ${index}] Resetting defaultValue and conditional fields for new type: ${currentPropertyType}`);

      form.setValue(`properties.${index}.defaultValue`, undefined, { shouldValidate: true });

      const isRelationship = currentPropertyType === 'relationship';
      const isNumber = currentPropertyType === 'number';
      const isDate = currentPropertyType === 'date';
      const isString = currentPropertyType === 'string';
      const isRatingOrMarkdownOrImage = ['rating', 'markdown', 'image'].includes(currentPropertyType);


      form.setValue(`properties.${index}.relationshipType`, isRelationship ? (form.getValues(relationshipTypePath) || 'one') : undefined, { shouldValidate: true });
      form.setValue(`properties.${index}.relatedModelId`, isRelationship ? form.getValues(relatedModelIdPath) : undefined, { shouldValidate: true });
      form.setValue(`properties.${index}.unit`, isNumber ? form.getValues(`properties.${index}.unit`) : undefined, { shouldValidate: true });
      form.setValue(`properties.${index}.precision`, isNumber ? (form.getValues(`properties.${index}.precision`) ?? 2) : undefined, { shouldValidate: true });
      form.setValue(`properties.${index}.autoSetOnCreate`, isDate ? !!form.getValues(`properties.${index}.autoSetOnCreate`) : false, { shouldValidate: true });
      form.setValue(`properties.${index}.autoSetOnUpdate`, isDate ? !!form.getValues(`properties.${index}.autoSetOnUpdate`) : false, { shouldValidate: true });
      form.setValue(`properties.${index}.isUnique`, isString ? !!form.getValues(`properties.${index}.isUnique`) : false, { shouldValidate: true });

      if (isRatingOrMarkdownOrImage) {
        form.setValue(`properties.${index}.unit`, undefined, { shouldValidate: true });
        form.setValue(`properties.${index}.precision`, undefined, { shouldValidate: true });
        form.setValue(`properties.${index}.relatedModelId`, undefined, { shouldValidate: true });
        form.setValue(`properties.${index}.relationshipType`, undefined, { shouldValidate: true });
        form.setValue(`properties.${index}.autoSetOnCreate`, false, { shouldValidate: true });
        form.setValue(`properties.${index}.autoSetOnUpdate`, false, { shouldValidate: true });
        form.setValue(`properties.${index}.isUnique`, false, { shouldValidate: true });
      }
    }

    previousPropertyTypeRef.current = currentPropertyType;
    previousRelatedModelIdRef.current = currentRelatedModelId;
    previousRelationshipTypeRef.current = currentRelationshipType;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPropertyType, currentRelatedModelId, currentRelationshipType, index, form]);


  const getDefaultValuePlaceholder = (type: PropertyFormValues['type']) => {
    switch (type) {
      case 'string':
      case 'markdown':
      case 'image':
        return "Enter default text or URL";
      case 'number':
        return "Enter default number (e.g., 0)";
      case 'relationship':
        return "Enter ID or comma-separated IDs";
      default:
        return "Enter default value";
    }
  };

  const relatedModelForDefault = useMemo(() => {
    if (currentPropertyType === 'relationship' && currentRelatedModelId) {
      return getModelById(currentRelatedModelId);
    }
    return undefined;
  }, [currentPropertyType, currentRelatedModelId, getModelById]);

  const relatedObjectsForDefaultOptions = useMemo(() => {
    if (relatedModelForDefault && relatedModelForDefault.id) {
      const objects = getObjectsByModelId(relatedModelForDefault.id);
      const dbObjects = getAllObjects();
      return objects.map(obj => ({
        value: obj.id,
        label: getObjectDisplayValue(obj, relatedModelForDefault, allModels, dbObjects),
      }));
    }
    return [];
  }, [relatedModelForDefault, getObjectsByModelId, getAllObjects, allModels]);


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
            name={propertyTypePath}
            render={({ field: typeField }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <Select
                  onValueChange={(value) => {
                    typeField.onChange(value as PropertyFormValues['type']);
                  }}
                  value={typeField.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select property type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {propertyTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type === 'rating' ? 'Rating (1-5 Stars)' :
                         type === 'image' ? 'Image' :
                         type === 'markdown' ? 'Markdown Text' :
                         type.charAt(0).toUpperCase() + type.slice(1)}
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
                name={relatedModelIdPath}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Related Model</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
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
                name={relationshipTypePath}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Relationship Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || 'one'}>
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
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 md:col-span-1">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-0.5 leading-none">
                      <FormLabel className="text-sm">Enforce Unique Value</FormLabel>
                      <FormDescription className="text-xs">Ensure this property's value is unique.</FormDescription>
                    </div>
                  </FormItem>
                )}
              />
          )}
          { !['rating', 'markdown', 'image'].includes(currentPropertyType) && (
            <FormField
              control={form.control}
              name={`properties.${index}.required`}
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 md:col-span-1">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Required</FormLabel>
                    <FormDescription className="text-xs">
                      Is this property mandatory?
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          )}
          { ['rating', 'markdown', 'image'].includes(currentPropertyType) && (
             <FormField
                control={form.control}
                name={`properties.${index}.required`}
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 md:col-span-1">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Required</FormLabel>
                       <FormDescription className="text-xs">
                        Is this {currentPropertyType} field mandatory?
                       </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
          )}
        </div>
        <div className="mt-4">
           <FormField
            control={control}
            name={`properties.${index}.defaultValue`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Default Value (Optional)</FormLabel>
                <FormControl>
                  <div /* Wrapper for FormControl to handle id prop */>
                    {currentPropertyType === 'boolean' && (
                      <Select
                        onValueChange={(value) => field.onChange(value === INTERNAL_BOOLEAN_NOT_SET_VALUE ? '' : value)}
                        value={field.value === '' || field.value === undefined || field.value === null ? INTERNAL_BOOLEAN_NOT_SET_VALUE : String(field.value)}
                      >
                         <SelectTrigger>
                          <SelectValue placeholder="Select default boolean value" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={INTERNAL_BOOLEAN_NOT_SET_VALUE}>-- Not Set --</SelectItem>
                          <SelectItem value="true">True</SelectItem>
                          <SelectItem value="false">False</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {currentPropertyType === 'date' && (() => {
                        let displayDate: Date | undefined = undefined;
                        let buttonText: React.ReactNode = <span>Pick a date</span>;
                        if (field.value && typeof field.value === 'string') {
                            const parsedDate = new Date(field.value);
                            if (isDateValid(parsedDate)) {
                                displayDate = parsedDate;
                                buttonText = formatDateFns(parsedDate, "PPP");
                            } else if (field.value) {
                                buttonText = <span>Invalid date string</span>;
                            }
                        }
                        return (
                            <Popover>
                                <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !displayDate && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIconLucide className="mr-2 h-4 w-4" />
                                    {buttonText}
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={displayDate}
                                    onSelect={(date) => field.onChange(date ? date.toISOString().split('T')[0] : '')}
                                    initialFocus
                                />
                                </PopoverContent>
                            </Popover>
                        );
                    })()}
                    {currentPropertyType === 'rating' && (
                       <StarRatingInput
                        value={field.value && !isNaN(parseInt(field.value, 10)) ? parseInt(field.value, 10) : 0}
                        onChange={(newRating) => field.onChange(newRating === 0 ? '' : String(newRating))}
                      />
                    )}
                     {currentPropertyType === 'relationship' && currentRelatedModelId && (
                      <>
                        {currentRelationshipType === 'many' ? (
                           <MultiSelectAutocomplete
                            options={relatedObjectsForDefaultOptions}
                            selected={(() => {
                              try {
                                if (field.value && typeof field.value === 'string') {
                                  const parsed = JSON.parse(field.value); // Expects '["id1", "id2"]'
                                  return Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : [];
                                }
                              } catch (e) { /* ignore parse error, return empty */ }
                              return [];
                            })()}
                            onChange={(selectedIds) => field.onChange(JSON.stringify(selectedIds))} // Stores '["id1", "id2"]'
                            placeholder={`Select default ${relatedModelForDefault?.name || 'items'}...`}
                            emptyIndicator={`No ${relatedModelForDefault?.name?.toLowerCase() || 'items'} found.`}
                          />
                        ) : (
                          <Select
                            onValueChange={(value) => field.onChange(value === INTERNAL_RELATIONSHIP_DEFAULT_NOT_SET_VALUE ? '' : value)}
                            value={field.value || INTERNAL_RELATIONSHIP_DEFAULT_NOT_SET_VALUE}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={`Select default ${relatedModelForDefault?.name || 'item'}`} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={INTERNAL_RELATIONSHIP_DEFAULT_NOT_SET_VALUE}>-- Not Set --</SelectItem>
                              {relatedObjectsForDefaultOptions.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </>
                    )}
                    {(!['boolean', 'date', 'rating', 'relationship'].includes(currentPropertyType)) && (
                       <Input
                        type={currentPropertyType === 'number' ? 'number' : 'text'}
                        placeholder={getDefaultValuePlaceholder(currentPropertyType)}
                        {...field}
                        value={field.value ?? ''}
                        onChange={e => {
                            field.onChange(e.target.value);
                        }}
                      />
                    )}
                  </div>
                </FormControl>
                <FormDescription className="text-xs">
                  {currentPropertyType === 'boolean' && "Default state for new records."}
                  {currentPropertyType === 'date' && "Default date (YYYY-MM-DD) for new records."}
                  {currentPropertyType === 'rating' && "Default star rating (0 for none)."}
                  {currentPropertyType === 'relationship' && currentRelationshipType === 'many' && "Select multiple default related items."}
                  {currentPropertyType === 'relationship' && currentRelationshipType !== 'many' && "Select a single default related item."}
                  {currentPropertyType === 'number' && "Default numeric value."}
                  {currentPropertyType === 'string' && "Default text value."}
                  {currentPropertyType === 'markdown' && "Default Markdown text."}
                  {currentPropertyType === 'image' && "Default image URL."}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
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
  const [openAccordionItems, setOpenAccordionItems] = useState<string[]>([]);
  const { toast } = useToast();

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
            const propertyName = form.watch(`properties.${index}.name`);
            const propertyType = form.watch(`properties.${index}.type`);
            const headerTitle = propertyName || `Property #${index + 1}`;

            return (
              <SortablePropertyItem key={fieldItem.id} id={fieldItem.id} className="bg-card rounded-md border">
                 {(dndProps) => (
                    <AccordionItem value={fieldItem.id} className="border-0">
                        <AccordionTrigger className="p-4 hover:no-underline data-[state=open]:border-b">
                            <div className="flex justify-between items-center w-full">
                            <div className="flex items-center gap-2">
                                <span {...dndProps.dragHandleListeners} className="cursor-grab p-1 -ml-1 text-muted-foreground hover:text-foreground">
                                <GripVertical className="h-5 w-5" />
                                </span>
                                <span className="text-lg font-medium text-foreground truncate mr-2">{headerTitle}</span>
                                {propertyType && <span className="text-xs text-muted-foreground">({propertyType})</span>}
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
                            modelsForRelationsGrouped={modelsForRelationsGrouped}
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
            defaultValue: undefined,
            orderIndex: fields.length,
        } as PropertyFormValues, {shouldFocus: false})}
        className="mt-4 w-full border-dashed hover:border-solid"
      >
        <PlusCircle className="mr-2 h-4 w-4" /> Add Property
      </Button>
    </DndContext>
  );
}


export default function ModelForm({ form, onSubmit, onCancel, isLoading, existingModel }: ModelFormProps) {
  const { models, modelGroups, workflows, isReady: dataReady } = useData();
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


  const watchedProperties = useWatch({ control: form.control, name: "properties" });
  const watchedDisplayPropertyNames = useWatch({ control: form.control, name: "displayPropertyNames" });


  const displayPropertyOptions: MultiSelectOption[] = useMemo(() => {
    return (watchedProperties || [])
      .filter(p => p.name && (p.type === 'string' || p.type === 'number' || p.type === 'date'))
      .map(p => ({ value: p.name!, label: p.name! }));
  }, [watchedProperties]);

  const selectedValuesForAutocomplete = useMemo(() => {
    const currentDisplayNames = Array.isArray(watchedDisplayPropertyNames) ? watchedDisplayPropertyNames : [];

    if (!currentDisplayNames.length && !existingModel?.displayPropertyNames?.length) {
        return [INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE];
    }

    const validSelectedValues = currentDisplayNames.filter(name =>
      name === INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE || displayPropertyOptions.some(opt => opt.value === name)
    );

    if (validSelectedValues.length === 0 && (currentDisplayNames.includes(INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE) || !currentDisplayNames.length )) {
        return [INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE];
    }
    if (validSelectedValues.length > 1 && validSelectedValues.includes(INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE)) {
        return validSelectedValues.filter(v => v !== INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE);
    }

    return validSelectedValues.length > 0 ? validSelectedValues : [INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE];

  }, [watchedDisplayPropertyNames, displayPropertyOptions, existingModel?.displayPropertyNames]);


  const handleFormSubmit = (values: ModelFormValues) => {
    // console.log("[ModelForm handleFormSubmit] Raw values from RHF:", JSON.stringify(values, null, 2)); // DEBUG
    const processedValues = { ...values };

    if (processedValues.displayPropertyNames && processedValues.displayPropertyNames.includes(INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE)) {
        const filtered = processedValues.displayPropertyNames.filter(dpName => dpName !== INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE);
        processedValues.displayPropertyNames = filtered.length > 0 ? filtered : undefined;
    } else if (processedValues.displayPropertyNames && processedValues.displayPropertyNames.length === 0) {
        processedValues.displayPropertyNames = undefined;
    }

    if (!processedValues.namespace || processedValues.namespace.trim() === '' || processedValues.namespace === INTERNAL_DEFAULT_NAMESPACE_VALUE) {
      processedValues.namespace = 'Default';
    }

    // This is the crucial part for workflowId
    if (values.workflowId === INTERNAL_NO_WORKFLOW_VALUE || !values.workflowId) {
      processedValues.workflowId = null;
    } else {
      processedValues.workflowId = values.workflowId;
    }
    // console.log("[ModelForm handleFormSubmit] Processed workflowId:", processedValues.workflowId);


    processedValues.properties = processedValues.properties.map((prop, index) => {
      const { workflowId: _removed, ...restOfProp } = prop as any; // Defensively remove if it ever creeps in
      const finalProp: PropertyFormValues = { ...restOfProp } as PropertyFormValues;

      finalProp.orderIndex = index;

      const isNumber = prop.type === 'number';
      const isDate = prop.type === 'date';
      const isString = prop.type === 'string';
      const isRelationship = prop.type === 'relationship';
      const isRatingOrMarkdownOrImage = ['rating', 'markdown', 'image'].includes(prop.type);


      finalProp.unit = isNumber ? prop.unit : undefined;
      finalProp.precision = isNumber ? (prop.precision === undefined || prop.precision === null || isNaN(Number(prop.precision)) ? 2 : Number(prop.precision)) : undefined;

      finalProp.autoSetOnCreate = isDate ? !!prop.autoSetOnCreate : false;
      finalProp.autoSetOnUpdate = isDate ? !!prop.autoSetOnUpdate : false;

      finalProp.isUnique = isString ? !!prop.isUnique : false;

      finalProp.relatedModelId = isRelationship ? prop.relatedModelId : undefined;
      finalProp.relationshipType = isRelationship ? prop.relationshipType : undefined;

      if (isRatingOrMarkdownOrImage) {
        finalProp.unit = undefined;
        finalProp.precision = undefined;
        finalProp.relatedModelId = undefined;
        finalProp.relationshipType = undefined;
        finalProp.autoSetOnCreate = false;
        finalProp.autoSetOnUpdate = false;
        finalProp.isUnique = false;
      } else if (!isNumber) {
        finalProp.unit = undefined;
        finalProp.precision = undefined;
      }
      if(!isRelationship){
        finalProp.relatedModelId = undefined;
        finalProp.relationshipType = undefined;
      }
      if(!isDate){
        finalProp.autoSetOnCreate = false;
        finalProp.autoSetOnUpdate = false;
      }
      if(!isString){
        finalProp.isUnique = false;
      }
      return finalProp;
    });
    // console.log("[ModelForm handleFormSubmit] Final processedValues to be submitted:", JSON.stringify(processedValues, null, 2)); // DEBUG
    onSubmit(processedValues);
  };

  const handleFormInvalid = (/* errors: FieldErrors<ModelFormValues> */) => {
    // console.log("Form validation failed. Current form values:", JSON.stringify(form.getValues(), null, 2)); // DEBUG
    // console.error("Client-side form validation. Current form.formState.errors:", form.formState.errors); // DEBUG
    
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
          <Accordion type="single" collapsible defaultValue="model-details-content" className="w-full">
            <AccordionItem value="model-details-content" className="border-0">
               <UiCardContent className="p-6 pt-0 space-y-4">
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
                  name="properties"
                  render={() => (
                    <FormItem>
                      {/* This FormMessage is specifically for array-level errors like "min 1 property" */}
                      <FormMessage className="text-destructive mt-2" />
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
                            value={field.value === 'Default' || !field.value ? INTERNAL_DEFAULT_NAMESPACE_VALUE : field.value}
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
                <FormField
                  control={form.control}
                  name="workflowId"
                  render={({ field }) => {
                    // console.log(`[ModelForm Render] workflowId field.value:`, field.value); // DEBUG
                    return (
                    <FormItem>
                      <FormLabel>Workflow (Optional)</FormLabel>
                      <Select
                        onValueChange={(selectedItemValue: string) => {
                          // console.log(`[ModelForm Select onChange] selectedItemValue from UI:`, selectedItemValue); // DEBUG
                          const valueToSetInRHF = selectedItemValue === INTERNAL_NO_WORKFLOW_VALUE ? null : selectedItemValue;
                          // console.log(`[ModelForm Select onChange] Calling field.onChange with:`, valueToSetInRHF); // DEBUG
                          field.onChange(valueToSetInRHF);
                        }}
                        value={field.value === null || field.value === undefined ? INTERNAL_NO_WORKFLOW_VALUE : field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Assign a workflow" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={INTERNAL_NO_WORKFLOW_VALUE}>-- No Workflow --</SelectItem>
                          {dataReady && workflows.sort((a, b) => a.name.localeCompare(b.name)).map((wf) => (
                            <SelectItem key={wf.id} value={wf.id}>
                              {wf.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Assign an optional workflow to manage the lifecycle of this model's objects.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}}
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
