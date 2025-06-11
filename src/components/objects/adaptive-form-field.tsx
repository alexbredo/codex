
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
import { CalendarIcon, ShieldCheck, ChevronsUpDown, Check, Search as SearchIcon, Paperclip } from 'lucide-react'; // Added Paperclip icon
import { Calendar } from '@/components/ui/calendar';
import { cn, getObjectDisplayValue } from '@/lib/utils';
import { format } from 'date-fns';
import { MultiSelectAutocomplete, type MultiSelectOption } from '@/components/ui/multi-select-autocomplete';
import { useMemo, useState, useEffect, useRef } from 'react';
import { StarRatingInput } from '@/components/ui/star-rating-input';
import Image from 'next/image';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  const [currentImageFile, setCurrentImageFile] = useState<File | null>(null); // For image type
  const [currentFileAttachment, setCurrentFileAttachment] = useState<File | null>(null); // For fileAttachment type

  // State for custom Combobox
  const [customPopoverOpen, setCustomPopoverOpen] = useState(false);
  const [customSearchValue, setCustomSearchValue] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [popoverWidth, setPopoverWidth] = useState<string | number>("auto");


  const allDbObjects = useMemo(() => getAllObjects(), [getAllObjects]);

  const relatedModel = useMemo(() => {
    if (property.type === 'relationship' && property.relatedModelId) {
      return getModelById(property.relatedModelId);
    }
    return undefined;
  }, [property.type, property.relatedModelId, getModelById]);

  const flatOptionsForRelationship: MultiSelectOption[] = useMemo(() => {
    if (relatedModel && property.relatedModelId) {
      const objects = getObjectsByModelId(property.relatedModelId);
      return objects
        .map(obj => ({
          value: String(obj.id), 
          label: getObjectDisplayValue(obj, relatedModel, allModels, allDbObjects),
        }))
        .sort((a,b) => a.label.localeCompare(b.label));
    }
    return [];
  }, [relatedModel, property.relatedModelId, getObjectsByModelId, allModels, allDbObjects]);

  const filteredCustomOptions = useMemo(() => {
    if (!customSearchValue) {
      return flatOptionsForRelationship;
    }
    return flatOptionsForRelationship.filter(option =>
      option.label.toLowerCase().includes(customSearchValue.toLowerCase())
    );
  }, [customSearchValue, flatOptionsForRelationship]);


  useEffect(() => {
    const fieldValue = form.getValues(fieldName);
    if (formContext === 'edit' && property.type === 'image' && typeof fieldValue === 'string' && fieldValue) {
      if (fieldValue.startsWith('/uploads/') || fieldValue.startsWith('http')) {
        setImagePreviewUrl(fieldValue);
      }
    }
    if (formContext === 'edit' && property.type === 'fileAttachment' && typeof fieldValue === 'string' && fieldValue) {
      // For file attachments, if it's an existing file path, we might display its name
      // No actual file object exists for preview, just the path string.
      // setCurrentFileAttachment(null); // Clear any potentially selected new file
    }
  }, [formContext, property.type, fieldName, form]);

  useEffect(() => {
    if (triggerRef.current) {
      setPopoverWidth(triggerRef.current.offsetWidth);
    }
  }, [customPopoverOpen]);


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
                controllerField.onChange(file || null); // Pass the File object
                setCurrentImageFile(file || null); // Store for local preview logic
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
              <FormDescription>Current image: <a href={controllerField.value} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{controllerField.value.split('/').pop()}</a></FormDescription>
            )}
            {!controllerField.value && !currentImageFile && property.required && <FormMessage>This image is required.</FormMessage>}
          </div>
        );
      case 'fileAttachment':
        const currentFileValue = controllerField.value; // This would be the path string for existing files, or a File object for new selection

        return (
          <div className="space-y-2">
            <Input
              type="file"
              ref={controllerField.ref}
              onChange={(e) => {
                const file = e.target.files?.[0];
                controllerField.onChange(file || null); // Pass the File object
                setCurrentFileAttachment(file || null); // Store for local display logic
              }}
            />
            {currentFileAttachment ? (
              <FormDescription>Selected file: <Paperclip className="inline-block h-4 w-4 mr-1" /> {currentFileAttachment.name}</FormDescription>
            ) : (formContext === 'edit' && typeof currentFileValue === 'string' && currentFileValue && (
              <FormDescription>Current file: <Paperclip className="inline-block h-4 w-4 mr-1" /> <a href={currentFileValue} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{currentFileValue.split('/').pop()}</a></FormDescription>
            ))}
            {!controllerField.value && !currentFileAttachment && property.required && <FormMessage>This file is required.</FormMessage>}
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
                className={cn("w-full justify-start text-left font-normal", !controllerField.value && !fieldIsDisabled && "text-muted-foreground", fieldIsDisabled && "cursor-not-allowed opacity-70")}
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
              options={flatOptionsForRelationship} 
              selected={Array.isArray(controllerField.value) ? controllerField.value.map(String) : []}
              onChange={(selectedIds) => controllerField.onChange(selectedIds)}
              placeholder={`Select ${relatedModel.name}(s)...`}
              emptyIndicator={`No ${relatedModel.name.toLowerCase()}s found.`}
            />
          );
        } else { // 'one' relationship - Custom Combobox
          const selectedLabel = controllerField.value
            ? flatOptionsForRelationship.find(opt => opt.value === controllerField.value)?.label
            : `Select ${relatedModel.name}...`;

          return (
            <Popover open={customPopoverOpen} onOpenChange={setCustomPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  ref={triggerRef}
                  variant="outline"
                  role="combobox"
                  aria-expanded={customPopoverOpen}
                  className="w-full justify-between"
                  disabled={fieldIsDisabled}
                >
                  <span className="truncate">{selectedLabel ?? `-- None --`}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent style={{ width: popoverWidth }} className="p-0">
                <div className="p-2 border-b">
                  <div className="relative">
                    <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder={`Search ${relatedModel.name}...`}
                      value={customSearchValue}
                      onChange={(e) => setCustomSearchValue(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
                <ScrollArea className="max-h-60">
                  {filteredCustomOptions.length === 0 && customSearchValue && (
                    <div className="p-2 text-center text-sm text-muted-foreground">
                      No {relatedModel.name.toLowerCase()} found for "{customSearchValue}".
                    </div>
                  )}
                   <div
                      key={INTERNAL_NONE_SELECT_VALUE}
                      className={cn("relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground", (controllerField.value === "" || !controllerField.value) && "bg-accent text-accent-foreground")}
                      onClick={() => {
                        controllerField.onChange(""); 
                        setCustomPopoverOpen(false);
                        setCustomSearchValue("");
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", (controllerField.value === "" || !controllerField.value) ? "opacity-100" : "opacity-0")} />
                      -- None --
                    </div>
                  {filteredCustomOptions.map((option) => (
                    <div
                      key={option.value}
                      className={cn("relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground", controllerField.value === option.value && "bg-accent text-accent-foreground")}
                      onClick={() => {
                        controllerField.onChange(option.value);
                        setCustomPopoverOpen(false);
                        setCustomSearchValue("");
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", controllerField.value === option.value ? "opacity-100" : "opacity-0")} />
                      {String(option.label ?? "")}
                    </div>
                  ))}
                </ScrollArea>
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
    case 'fileAttachment': // Also initialize file attachments to null
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
    