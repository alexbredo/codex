
'use client';

import type { Control, FieldPath, FieldValues, ControllerRenderProps, UseFormReturn } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription
} from '@/components/ui/form';
import type { Property, ValidationRuleset, Model } from '@/lib/types';
import { useData } from '@/contexts/data-context';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CalendarIcon, ShieldCheck, ChevronsUpDown, Check } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { cn, getObjectDisplayValue } from '@/lib/utils';
import { format } from 'date-fns';
import { MultiSelectAutocomplete, type MultiSelectOption } from '@/components/ui/multi-select-autocomplete';
import { useMemo, useState, useEffect } from 'react';
import { StarRatingInput } from '@/components/ui/star-rating-input';
import Image from 'next/image';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ScrollArea } from '@/components/ui/scroll-area';
import * as React from 'react';


interface AdaptiveFormFieldProps<TFieldValues extends FieldValues = FieldValues> {
  form: UseFormReturn<TFieldValues>;
  property: Property;
  formContext: 'create' | 'edit';
  modelId: string;
  objectId?: string | null;
}

const INTERNAL_NONE_SELECT_VALUE = "__EMPTY_SELECTION_VALUE__";

export default function AdaptiveFormField<TFieldValues extends FieldValues = FieldValues>({
  form,
  property,
  formContext,
  modelId,
  objectId,
}: AdaptiveFormFieldProps<TFieldValues>) {
  const { models: allModels, getModelById, getObjectsByModelId, getAllObjects, validationRulesets } = useData();
  const fieldName = property.name as FieldPath<TFieldValues>;
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  
  // State for 'one' relationship Combobox
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [comboboxInputValue, setComboboxInputValue] = React.useState<string>("");

  const allDbObjects = useMemo(() => getAllObjects(), [getAllObjects]);

  const relatedModel = useMemo(() => {
    if (property.type === 'relationship' && property.relatedModelId) {
      return getModelById(property.relatedModelId);
    }
    return undefined;
  }, [property.type, property.relatedModelId, getModelById]);

  const relatedObjectsGrouped: Record<string, MultiSelectOption[]> = useMemo(() => {
    if (relatedModel && property.relatedModelId) {
      const objects = getObjectsByModelId(property.relatedModelId);
      const grouped = objects.reduce((acc, obj) => {
        const relatedM = allModels.find(m => m.id === property.relatedModelId);
        const namespace = relatedM?.namespace || 'Default';
        if (!acc[namespace]) {
          acc[namespace] = [];
        }
        acc[namespace].push({
          value: String(obj.id), // Ensure value is string
          label: getObjectDisplayValue(obj, relatedM, allModels, allDbObjects),
        });
        return acc;
      }, {} as Record<string, MultiSelectOption[]>);

      const sortedNamespaces = Object.keys(grouped).sort((a, b) => {
        if (a === 'Default') return -1;
        if (b === 'Default') return 1;
        return a.localeCompare(b);
      });
      
      const sortedGrouped: Record<string, MultiSelectOption[]> = {};
      for (const ns of sortedNamespaces) {
        sortedGrouped[ns] = (grouped[ns] || []).sort((a,b) => a.label.localeCompare(b.label));
      }
      return sortedGrouped;
    }
    return {};
  }, [relatedModel, property.relatedModelId, getObjectsByModelId, allModels, allDbObjects]);

  const flatOptionsForMultiSelect: MultiSelectOption[] = useMemo(() => {
    return Object.values(relatedObjectsGrouped).flat().map(opt => ({
        value: String(opt.value),
        label: String(opt.label ?? '')
    }));
  }, [relatedObjectsGrouped]);


  useEffect(() => {
    const fieldValue = form.getValues(fieldName);
    if (formContext === 'edit' && property.type === 'image' && typeof fieldValue === 'string' && fieldValue) {
      if (fieldValue.startsWith('/uploads/') || fieldValue.startsWith('http')) {
        setImagePreviewUrl(fieldValue);
      }
    }
  }, [formContext, property.type, fieldName, form]);

  if (formContext === 'create' && property.type === 'date' && property.autoSetOnCreate) {
    return null;
  }

  const renderField = (controllerField: ControllerRenderProps<TFieldValues, FieldPath<TFieldValues>>) => {
    let fieldIsDisabled = false;
    if (property.type === 'date') {
        if (formContext === 'edit' && (property.autoSetOnUpdate || property.autoSetOnCreate)) {
            fieldIsDisabled = true;
        }
    }
    if (property.type === 'date' && formContext === 'create' && property.autoSetOnCreate) {
        fieldIsDisabled = true;
    }
    
    const placeholderText = (relatedModel && relatedModel.name && relatedModel.name.trim() !== "")
      ? `Search ${relatedModel.name.trim()}...`
      : "Search items...";

    const commandEmptyText = (relatedModel && relatedModel.name && relatedModel.name.trim() !== "")
        ? `No ${relatedModel.name.trim().toLowerCase()} found.`
        : "No items found.";


    switch (property.type) {
      case 'string':
        if (property.name.toLowerCase().includes('description') || property.name.toLowerCase().includes('notes')) {
            return <Textarea placeholder={`Enter ${property.name}`} {...controllerField} value={controllerField.value ?? ''} />;
        }
        return <Input placeholder={`Enter ${property.name}`} {...controllerField} value={controllerField.value ?? ''} />;
      case 'markdown':
        return <Textarea placeholder={`Enter ${property.name} (Markdown supported)`} {...controllerField} value={controllerField.value ?? ''} rows={10} />;
      case 'image':
        return (
          <div className="space-y-2">
            <Input
              type="file"
              accept="image/*"
              ref={controllerField.ref}
              onChange={(e) => {
                const file = e.target.files?.[0];
                controllerField.onChange(file || null);
                setCurrentFile(file || null);
                if (file) {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    setImagePreviewUrl(reader.result as string);
                  };
                  reader.readAsDataURL(file);
                } else {
                  setImagePreviewUrl(null);
                }
              }}
            />
            {imagePreviewUrl && (
              <div className="mt-2 relative w-32 h-32 border rounded overflow-hidden">
                <Image src={imagePreviewUrl} alt="Preview" layout="fill" objectFit="contain" />
              </div>
            )}
            {formContext === 'edit' && typeof controllerField.value === 'string' && controllerField.value && !imagePreviewUrl && (
              <FormDescription>Current image: <a href={controllerField.value} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{controllerField.value}</a></FormDescription>
            )}
            {!controllerField.value && !currentFile && property.required && <FormMessage>This image is required.</FormMessage>}
          </div>
        );
      case 'number':
        return (
          <Input
            type="number"
            step={property?.precision ? (1 / Math.pow(10, property.precision)) : "any"}
            placeholder={`Enter ${property.name}`}
            {...controllerField}
            value={controllerField.value ?? ''}
            onChange={e => {
              const val = e.target.value;
              controllerField.onChange(val === '' ? null : parseFloat(val));
            }}
          />
        );
      case 'boolean':
        return <Switch checked={controllerField.value ?? false} onCheckedChange={controllerField.onChange} />;
      case 'date':
        let dateButtonText: React.ReactNode;
        if (controllerField.value) {
          try {
            dateButtonText = format(new Date(controllerField.value), "PPP");
          } catch (e) {
            dateButtonText = "Invalid Date";
          }
        } else {
          if (fieldIsDisabled) {
            dateButtonText = "Auto-set by system";
          } else {
            dateButtonText = <span>Pick a date</span>;
          }
        }

        return (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !controllerField.value && !fieldIsDisabled && "text-muted-foreground",
                  fieldIsDisabled && "cursor-not-allowed opacity-70"
                )}
                disabled={fieldIsDisabled}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateButtonText}
              </Button>
            </PopoverTrigger>
            {!fieldIsDisabled && (
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={controllerField.value ? new Date(controllerField.value) : undefined}
                  onSelect={(date) => controllerField.onChange(date ? date.toISOString() : null)}
                  initialFocus
                />
              </PopoverContent>
            )}
          </Popover>
        );
      case 'relationship':
        if (!property.relatedModelId || !relatedModel) {
          return <p className="text-destructive">Configuration error: Related model info missing.</p>;
        }
        
        if (property.relationshipType === 'many') {
          return (
            <MultiSelectAutocomplete
              options={flatOptionsForMultiSelect} 
              selected={Array.isArray(controllerField.value) ? controllerField.value.map(String) : []}
              onChange={(selectedIds) => controllerField.onChange(selectedIds)}
              placeholder={`Select ${relatedModel.name}(s)...`}
              emptyIndicator={`No ${relatedModel.name.toLowerCase()}s found.`}
            />
          );
        } else { // 'one' relationship
          const selectedLabel = controllerField.value
            ? flatOptionsForMultiSelect.find(opt => opt.value === controllerField.value)?.label
            : `Select ${relatedModel.name}...`;

          return (
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={popoverOpen}
                  className="w-full justify-between"
                  disabled={fieldIsDisabled}
                >
                  <span className="truncate">{selectedLabel ?? `-- None --`}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command key={relatedModel.id}> {/* Key for re-initialization if model changes */}
                  <CommandInput
                    placeholder={placeholderText}
                    value={comboboxInputValue}
                    onValueChange={setComboboxInputValue}
                  />
                  <CommandList>
                    <ScrollArea className="max-h-60"> {/* ScrollArea around items */}
                      <CommandEmpty>{commandEmptyText}</CommandEmpty>
                      <CommandItem
                        key={INTERNAL_NONE_SELECT_VALUE}
                        value={INTERNAL_NONE_SELECT_VALUE}
                        onSelect={() => {
                          controllerField.onChange(""); 
                          setPopoverOpen(false);
                          setComboboxInputValue("");
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", (controllerField.value === "" || !controllerField.value) ? "opacity-100" : "opacity-0")} />
                        -- None --
                      </CommandItem>
                      {Object.entries(relatedObjectsGrouped).map(([namespace, optionsInNamespace]) => (
                        <CommandGroup 
                          key={namespace} 
                          heading={namespace === 'Default' && Object.keys(relatedObjectsGrouped).length === 1 ? undefined : namespace}
                        >
                          {optionsInNamespace.map((option) => (
                            <CommandItem
                              key={option.value}
                              value={String(option.value)} 
                              onSelect={(currentValue) => {
                                controllerField.onChange(currentValue === INTERNAL_NONE_SELECT_VALUE ? "" : currentValue);
                                setPopoverOpen(false);
                                setComboboxInputValue(""); 
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", controllerField.value === option.value ? "opacity-100" : "opacity-0")} />
                              {String(option.label ?? "")}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ))}
                    </ScrollArea>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          );
        }
      case 'rating':
        return (
          <StarRatingInput
            value={controllerField.value ?? 0}
            onChange={controllerField.onChange}
            disabled={fieldIsDisabled}
          />
        );
      default:
        return <Input placeholder={`Unsupported type: ${property.type}`} {...controllerField} disabled />;
    }
  };

  let defaultValueForController: any;
  switch(property.type) {
    case 'relationship':
      defaultValueForController = property.relationshipType === 'many' ? [] : '';
      break;
    case 'boolean':
      defaultValueForController = false;
      break;
    case 'date':
      defaultValueForController = null;
      break;
    case 'rating':
      defaultValueForController = 0;
      break;
    case 'image':
      defaultValueForController = null;
      break;
    case 'number':
      defaultValueForController = null; 
      break;
    default:
      defaultValueForController = undefined;
  }

  let appliedRule: ValidationRuleset | undefined;
  let descriptionText: string | undefined;

  if (property.type === 'string' && property.validationRulesetId) {
    appliedRule = validationRulesets.find(rs => rs.id === property.validationRulesetId);
  }
  if (property.type === 'number') {
    const minText = (property.minValue !== null && typeof property.minValue === 'number') ? `Min: ${property.minValue}` : null;
    const maxText = (property.maxValue !== null && typeof property.maxValue === 'number') ? `Max: ${property.maxValue}` : null;
    if (minText && maxText) descriptionText = `${minText}, ${maxText}.`;
    else if (minText) descriptionText = `${minText}.`;
    else if (maxText) descriptionText = `${maxText}.`;
  }


  return (
    <Controller
      name={fieldName}
      control={form.control}
      defaultValue={defaultValueForController}
      render={({ field, fieldState: { error } }) => (
        <FormItem>
          <div className="flex items-center">
            <FormLabel htmlFor={field.name}>
              {property.name}
              {property.required && <span className="text-destructive">*</span>}
            </FormLabel>
            {appliedRule && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="ml-1 h-auto w-auto p-0.5 text-blue-500 hover:bg-blue-500/10">
                        <ShieldCheck className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-semibold">Validation Rule: {appliedRule.name}</p>
                    {appliedRule.description && <p className="text-xs text-muted-foreground">{appliedRule.description}</p>}
                    <p className="text-xs text-muted-foreground mt-1">Pattern: <code className="font-mono bg-muted p-0.5 rounded-sm">{appliedRule.regexPattern}</code></p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <FormControl>{renderField(field)}</FormControl>
          {descriptionText && <FormDescription>{descriptionText}</FormDescription>}
          {error && <FormMessage>{error.message}</FormMessage>}
        </FormItem>
      )}
    />
  );
}
    
