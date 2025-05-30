
'use client';

import type { Control, FieldPath, FieldValues, ControllerRenderProps, UseFormReturn } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
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
import {
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription
} from '@/components/ui/form';
import type { Property } from '@/lib/types';
import { useData } from '@/contexts/data-context';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { cn, getObjectDisplayValue } from '@/lib/utils';
import { format } from 'date-fns';
import { MultiSelectAutocomplete, type MultiSelectOption } from '@/components/ui/multi-select-autocomplete';
import { useMemo, useState, useEffect } from 'react';
import { StarRatingInput } from '@/components/ui/star-rating-input';
import Image from 'next/image'; // For image preview

interface AdaptiveFormFieldProps<TFieldValues extends FieldValues = FieldValues> {
  form: UseFormReturn<TFieldValues>; // Changed from control to form
  property: Property;
  formContext: 'create' | 'edit';
  modelId: string;
  objectId?: string | null;
}

const INTERNAL_NONE_SELECT_VALUE = "__EMPTY_SELECTION_VALUE__";

export default function AdaptiveFormField<TFieldValues extends FieldValues = FieldValues>({
  form, // Changed from control to form
  property,
  formContext,
  modelId,
  objectId,
}: AdaptiveFormFieldProps<TFieldValues>) {
  const { models: allModels, getModelById, getObjectsByModelId, getAllObjects } = useData();
  const fieldName = property.name as FieldPath<TFieldValues>;
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);


  const allDbObjects = useMemo(() => getAllObjects(), [getAllObjects, property.type, property.relatedModelId]);

  const relatedModel = useMemo(() => {
    if (property.type === 'relationship' && property.relatedModelId) {
      return getModelById(property.relatedModelId);
    }
    return undefined;
  }, [property.type, property.relatedModelId, getModelById]);

  const relatedObjectsGrouped = useMemo(() => {
    if (relatedModel && property.relatedModelId) {
      const objects = getObjectsByModelId(property.relatedModelId);
      return objects.reduce((acc, obj) => {
        const relatedM = allModels.find(m => m.id === property.relatedModelId);
        const namespace = relatedM?.namespace || 'Default';
        if (!acc[namespace]) {
          acc[namespace] = [];
        }
        acc[namespace].push({
          value: obj.id,
          label: getObjectDisplayValue(obj, relatedM, allModels, allDbObjects),
        });
        return acc;
      }, {} as Record<string, MultiSelectOption[]>);
    }
    return {};
  }, [relatedModel, property.relatedModelId, getObjectsByModelId, allModels, allDbObjects]);

  // Effect to set initial image preview if editing and value is a URL string
  useEffect(() => {
    const fieldValue = form.getValues(fieldName); // Use form.getValues
    if (formContext === 'edit' && property.type === 'image' && typeof fieldValue === 'string' && fieldValue) {
      // Check if it's a local upload path or an external URL
      if (fieldValue.startsWith('/uploads/') || fieldValue.startsWith('http')) {
        setImagePreviewUrl(fieldValue);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formContext, property.type, fieldName, form.getValues]); // Use form.getValues in dependency array


  if (formContext === 'create' && property.type === 'date' && property.autoSetOnCreate) {
    return null; // Hide field if auto-set on create
  }

  const renderField = (controllerField: ControllerRenderProps<TFieldValues, FieldPath<TFieldValues>>) => {
    let fieldIsDisabled = false;
    if (property.type === 'date') {
        if (formContext === 'edit' && (property.autoSetOnUpdate || property.autoSetOnCreate)) { // autoSetOnCreate should also disable in edit
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
              // Setting value to undefined or null for file input is tricky.
              // React Hook Form handles its state.
              // This `ref` and the `useEffect` below can help reset visually if needed.
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
        return <Input type="number" placeholder={`Enter ${property.name}`} {...controllerField}  value={controllerField.value ?? ''} onChange={e => controllerField.onChange(parseFloat(e.target.value) || null)} />;
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

        const flatOptions: MultiSelectOption[] = Object.values(relatedObjectsGrouped).flat();


        if (property.relationshipType === 'many') {
          return (
            <MultiSelectAutocomplete
              options={flatOptions}
              selected={controllerField.value || []}
              onChange={controllerField.onChange}
              placeholder={`Select ${relatedModel.name}(s)...`}
              emptyIndicator={`No ${relatedModel.name.toLowerCase()}s found.`}
            />
          );
        } else {
          const currentSelectValue = controllerField.value === "" || controllerField.value === null || typeof controllerField.value === 'undefined'
                                     ? INTERNAL_NONE_SELECT_VALUE
                                     : controllerField.value;
          return (
            <Select
              onValueChange={(value) => {
                controllerField.onChange(value === INTERNAL_NONE_SELECT_VALUE ? "" : value);
              }}
              value={currentSelectValue}
            >
              <SelectTrigger>
                <SelectValue placeholder={`Select ${relatedModel.name}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={INTERNAL_NONE_SELECT_VALUE}>-- None --</SelectItem>
                {Object.entries(relatedObjectsGrouped).map(([namespace, optionsInNamespace]) => (
                  <SelectGroup key={namespace}>
                    <UiSelectLabel>{namespace}</UiSelectLabel>
                    {optionsInNamespace.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
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
    default:
      // For string, number, markdown, keep undefined so RHF uses its own default handling
      // or value from form.reset() in parent page
      defaultValueForController = undefined;
  }


  return (
    <Controller
      name={fieldName}
      control={form.control} // Use form.control here
      defaultValue={defaultValueForController}
      render={({ field, fieldState: { error } }) => (
        <FormItem>
          <FormLabel>{property.name}{property.required && <span className="text-destructive">*</span>}</FormLabel>
          <FormControl>{renderField(field)}</FormControl>
          {error && <FormMessage>{error.message}</FormMessage>}
        </FormItem>
      )}
    />
  );
}

