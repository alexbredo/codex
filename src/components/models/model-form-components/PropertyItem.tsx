'use client';

import * as React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useWatch } from 'react-hook-form';
import { useData } from '@/contexts/data-context';
import type { ModelFormValues, PropertyFormValues } from '../model-form-schema';
import { propertyTypes } from '../model-form-schema'; // Correctly import the types
import type { Model, ValidationRuleset } from '@/lib/types';
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form';
import { AccordionContent } from "@/components/ui/accordion";
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { MultiSelectAutocomplete, type MultiSelectOption } from '@/components/ui/multi-select-autocomplete';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { StarRatingInput } from '@/components/ui/star-rating-input';
import { CalendarIcon as CalendarIconLucide, ChevronsUpDown, Check } from 'lucide-react';
import { cn, getObjectDisplayValue } from '@/lib/utils';
import { format as formatDateFns, isValid as isDateValid } from 'date-fns';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useDebounce } from '@/hooks/use-debounce';
import { useQuery } from '@tanstack/react-query';

const INTERNAL_BOOLEAN_NOT_SET_VALUE = "__BOOLEAN_NOT_SET__";
const INTERNAL_RELATIONSHIP_DEFAULT_NOT_SET_VALUE = "__RELATIONSHIP_DEFAULT_NOT_SET__";
const INTERNAL_NO_VALIDATION_RULE_VALUE = "__NO_VALIDATION_RULE_SELECTED__";

interface PropertyItemProps {
  form: UseFormReturn<ModelFormValues>;
  index: number;
  modelsForRelationsGrouped: Record<string, Model[]>;
  validationRulesetsForSelect: ValidationRuleset[];
}

export default function PropertyItem({ form, index, modelsForRelationsGrouped, validationRulesetsForSelect }: PropertyItemProps) {
  const control = form.control;
  const { getModelById, getObjectsByModelId, allModels, getAllObjects } = useData();
  
  const [customPopoverOpen, setCustomPopoverOpen] = React.useState(false);
  const [customSearchValue, setCustomSearchValue] = React.useState("");
  const debouncedSearch = useDebounce(customSearchValue, 300);

  const propertyTypePath = `properties.${index}.type` as const;
  const relatedModelIdPath = `properties.${index}.relatedModelId` as const;
  const relationshipTypePath = `properties.${index}.relationshipType` as const;
  const validationRulesetIdPath = `properties.${index}.validationRulesetId` as const;
  const minValuePath = `properties.${index}.minValue` as const;
  const maxValuePath = `properties.${index}.maxValue` as const;
  
  const currentPropertyType = useWatch({ control, name: propertyTypePath });
  const currentRelatedModelId = useWatch({ control, name: relatedModelIdPath });
  const previousPropertyTypeRef = React.useRef<PropertyFormValues['type']>();

  React.useEffect(() => {
    const isInitialRender = previousPropertyTypeRef.current === undefined;
    if (isInitialRender) {
      previousPropertyTypeRef.current = currentPropertyType;
      return;
    }
    
    if (currentPropertyType !== previousPropertyTypeRef.current) {
        form.setValue(`properties.${index}.defaultValue`, undefined, { shouldValidate: true });
        // Reset conditional fields based on new type
        if (currentPropertyType !== 'relationship') {
          form.setValue(relatedModelIdPath, undefined, { shouldValidate: false });
          form.setValue(relationshipTypePath, 'one', { shouldValidate: false });
        }
        if (currentPropertyType !== 'number') {
          form.setValue(`properties.${index}.unit`, undefined, { shouldValidate: false });
          form.setValue(`properties.${index}.precision`, undefined, { shouldValidate: false });
          form.setValue(minValuePath, null, { shouldValidate: true });
          form.setValue(maxValuePath, null, { shouldValidate: true });
        }
        if (!['date', 'datetime'].includes(currentPropertyType)) {
          form.setValue(`properties.${index}.autoSetOnCreate`, false, { shouldValidate: false });
          form.setValue(`properties.${index}.autoSetOnUpdate`, false, { shouldValidate: false });
        }
        if (currentPropertyType !== 'string') {
          form.setValue(`properties.${index}.isUnique`, false, { shouldValidate: false });
          form.setValue(validationRulesetIdPath, null, { shouldValidate: true });
        }
    }
    previousPropertyTypeRef.current = currentPropertyType;
  }, [currentPropertyType, index, form, relatedModelIdPath, relationshipTypePath, validationRulesetIdPath, minValuePath, maxValuePath]);

  const relatedModelForDefault = React.useMemo(() => {
    if (currentPropertyType === 'relationship' && currentRelatedModelId) {
      return getModelById(currentRelatedModelId);
    }
    return undefined;
  }, [currentPropertyType, currentRelatedModelId, getModelById]);
  
  const allDbObjects = React.useMemo(() => getAllObjects(), [getAllObjects]);

   const { data: relationshipOptions, isLoading: isLoadingRelationshipOptions } = useQuery({
    queryKey: ['relationship-search-model-form', relatedModelForDefault?.id, debouncedSearch],
    queryFn: async (): Promise<MultiSelectOption[]> => {
      if (!relatedModelForDefault) return [];
      const propNameForApi = form.getValues(`properties.${index}.name`);
      const response = await fetch(`/api/codex-structure/properties/${propNameForApi}/values?modelName=${encodeURIComponent(relatedModelForDefault.name)}&searchTerm=${encodeURIComponent(debouncedSearch)}`);
      if (!response.ok) return [];
      const data = await response.json();
      return data.map((item: {id: string, displayValue: string}) => ({ value: item.id, label: item.displayValue }));
    },
    enabled: !!relatedModelForDefault && customPopoverOpen,
  });


  const relatedObjectsForDefaultOptions = React.useMemo(() => {
    if (relatedModelForDefault?.id) {
      const objects = getObjectsByModelId(relatedModelForDefault.id);
      return objects.map(obj => ({
        value: obj.id,
        label: getObjectDisplayValue(obj, relatedModelForDefault, allModels, allDbObjects),
      }));
    }
    return [];
  }, [relatedModelForDefault, getObjectsByModelId, allModels, allDbObjects]);

  return (
    <AccordionContent className="p-4 pt-0">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* All the fields from the original PropertyAccordionContent */}
        <FormField control={control} name={`properties.${index}.name`} render={({ field }) => ( <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="e.g., ProductName" {...field} /></FormControl><FormMessage /></FormItem> )} />
        <FormField control={control} name={propertyTypePath} render={({ field: typeField }) => ( <FormItem><FormLabel>Type</FormLabel><Select onValueChange={(value) => typeField.onChange(value)} value={typeField.value}><FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl><SelectContent>{propertyTypes.map((type) => ( <SelectItem key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem> )} />
        {currentPropertyType === 'string' && ( <FormField control={control} name={validationRulesetIdPath} render={({ field }) => ( <FormItem><FormLabel>Validation (Optional)</FormLabel><Select onValueChange={(value) => field.onChange(value === INTERNAL_NO_VALIDATION_RULE_VALUE ? null : value)} value={field.value || INTERNAL_NO_VALIDATION_RULE_VALUE}><FormControl><SelectTrigger><SelectValue placeholder="Select a rule" /></SelectTrigger></FormControl><SelectContent><SelectItem value={INTERNAL_NO_VALIDATION_RULE_VALUE}>-- None --</SelectItem>{validationRulesetsForSelect.map((rs) => ( <SelectItem key={rs.id} value={rs.id}>{rs.name}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem> )} /> )}
        {currentPropertyType === 'relationship' && ( <> <FormField control={control} name={relatedModelIdPath} render={({ field }) => ( <FormItem><FormLabel>Related Model</FormLabel><Select onValueChange={field.onChange} value={field.value || undefined}><FormControl><SelectTrigger><SelectValue placeholder="Select model" /></SelectTrigger></FormControl><SelectContent>{Object.entries(modelsForRelationsGrouped).map(([group, models]) => ( <div key={group}><strong>{group}</strong>{models.map(m => ( <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>))}</div>))}</SelectContent></Select><FormMessage /></FormItem> )} /> <FormField control={control} name={relationshipTypePath} render={({ field }) => ( <FormItem><FormLabel>Relationship Type</FormLabel><Select onValueChange={field.onChange} value={field.value || 'one'}><FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl><SelectContent><SelectItem value="one">One</SelectItem><SelectItem value="many">Many</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} /> </> )}
        {currentPropertyType === 'number' && ( <> <FormField control={control} name={`properties.${index}.unit`} render={({ field }) => ( <FormItem><FormLabel>Unit (Optional)</FormLabel><FormControl><Input placeholder="e.g., kg" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} /> <FormField control={control} name={`properties.${index}.precision`} render={({ field }) => ( <FormItem><FormLabel>Precision</FormLabel><FormControl><Input type="number" min="0" max="10" placeholder="e.g., 2" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === "" ? undefined : parseInt(e.target.value, 10))} /></FormControl><FormMessage /></FormItem> )} /> <FormField control={control} name={minValuePath} render={({ field }) => ( <FormItem><FormLabel>Min Value (Optional)</FormLabel><FormControl><Input type="number" placeholder="e.g., 0" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : parseFloat(e.target.value))} /></FormControl><FormMessage /></FormItem> )} /> <FormField control={control} name={maxValuePath} render={({ field }) => ( <FormItem><FormLabel>Max Value (Optional)</FormLabel><FormControl><Input type="number" placeholder="e.g., 100" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : parseFloat(e.target.value))} /></FormControl><FormMessage /></FormItem> )} /> </> )}
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField control={form.control} name={`properties.${index}.required`} render={({ field }) => ( <FormItem className="flex items-center space-x-2 border p-3 rounded-md"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel>Required</FormLabel></FormItem> )} />
          {currentPropertyType === 'string' && ( <FormField control={form.control} name={`properties.${index}.isUnique`} render={({ field }) => ( <FormItem className="flex items-center space-x-2 border p-3 rounded-md"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel>Enforce Unique</FormLabel></FormItem> )} /> )}
          {(currentPropertyType === 'date' || currentPropertyType === 'datetime') && ( <> <FormField control={form.control} name={`properties.${index}.autoSetOnCreate`} render={({ field }) => ( <FormItem className="flex items-center space-x-2 border p-3 rounded-md"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel>Auto-set on Create</FormLabel></FormItem> )} /> <FormField control={form.control} name={`properties.${index}.autoSetOnUpdate`} render={({ field }) => ( <FormItem className="flex items-center space-x-2 border p-3 rounded-md"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel>Auto-set on Update</FormLabel></FormItem> )} /> </> )}
        </div>
      </div>
      <div className="mt-4"><FormField control={control} name={`properties.${index}.defaultValue`} render={({ field }) => {
        const relationshipType = form.watch(relationshipTypePath);

        const renderRelationshipDefaultValue = () => {
          if (relationshipType === 'many') {
            return (
              <MultiSelectAutocomplete
                options={relatedObjectsForDefaultOptions}
                selected={Array.isArray(field.value) ? field.value : (field.value ? [field.value] : [])}
                onChange={(selectedIds) => field.onChange(selectedIds)}
                placeholder={`Select default ${relatedModelForDefault?.name}(s)...`}
              />
            );
          } else { // 'one'
             const selectedLabel = field.value ? relatedObjectsForDefaultOptions.find(opt => opt.value === field.value)?.label : `Select default ${relatedModelForDefault?.name}...`;
             return (
               <Popover open={customPopoverOpen} onOpenChange={setCustomPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
                      <span className="truncate">{selectedLabel}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-50">
                    <Command>
                      <CommandInput placeholder={`Search ${relatedModelForDefault?.name}...`} value={customSearchValue} onValueChange={setCustomSearchValue} />
                      <CommandList>
                        {isLoadingRelationshipOptions && <div className="p-2 text-center text-sm">Loading...</div>}
                        <CommandEmpty>No results found.</CommandEmpty>
                        <CommandItem value={INTERNAL_RELATIONSHIP_DEFAULT_NOT_SET_VALUE} onSelect={() => { field.onChange(""); setCustomPopoverOpen(false); }}>
                          <Check className={cn("mr-2 h-4 w-4", !field.value ? "opacity-100" : "opacity-0")} />
                          -- Not Set --
                        </CommandItem>
                        {(relationshipOptions || []).map((option) => (
                           <CommandItem key={option.value} value={option.label} onSelect={() => { field.onChange(option.value); setCustomPopoverOpen(false); }}>
                             <Check className={cn("mr-2 h-4 w-4", field.value === option.value ? "opacity-100" : "opacity-0")} />
                             {option.label}
                           </CommandItem>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
               </Popover>
             )
          }
        };

        return (
          <FormItem><FormLabel>Default Value (Optional)</FormLabel><FormControl><div> {currentPropertyType === 'boolean' && ( <Select onValueChange={(v) => field.onChange(v === INTERNAL_BOOLEAN_NOT_SET_VALUE ? '' : v)} value={field.value ?? INTERNAL_BOOLEAN_NOT_SET_VALUE}><SelectTrigger><SelectValue placeholder="Select default" /></SelectTrigger><SelectContent><SelectItem value={INTERNAL_BOOLEAN_NOT_SET_VALUE}>-- Not Set --</SelectItem><SelectItem value="true">True</SelectItem><SelectItem value="false">False</SelectItem></SelectContent></Select> )} {currentPropertyType === 'date' && ( <Popover><PopoverTrigger asChild><Button type="button" variant="outline" className={cn("w-full justify-start", !field.value && "text-muted-foreground")}><CalendarIconLucide className="mr-2 h-4 w-4" />{field.value ? formatDateFns(new Date(field.value), "PPP") : "Pick a date"}</Button></PopoverTrigger><PopoverContent className="p-0"><Calendar mode="single" selected={field.value ? new Date(field.value) : undefined} onSelect={(d) => field.onChange(d ? d.toISOString().split('T')[0] : '')} /></PopoverContent></Popover> )} {currentPropertyType === 'rating' && ( <StarRatingInput value={field.value ? parseInt(field.value, 10) : 0} onChange={(v) => field.onChange(String(v))} /> )} {currentPropertyType === 'relationship' && currentRelatedModelId && relatedModelForDefault && renderRelationshipDefaultValue()} {(!['boolean', 'date', 'rating', 'relationship'].includes(currentPropertyType)) && ( <Input type={{'number': 'number', 'time': 'time', 'datetime': 'datetime-local'}[currentPropertyType] || 'text'} placeholder="Enter default value" {...field} value={field.value ?? ''} /> )} </div></FormControl><FormMessage /></FormItem>
        );
      }} /></div>
    </AccordionContent>
  );
}
