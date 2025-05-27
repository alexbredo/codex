
'use client';

import type { Control, FieldPath, FieldValues, ControllerRenderProps } from 'react-hook-form';
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
import { useMemo } from 'react';
import { StarRatingInput } from '@/components/ui/star-rating-input'; // Import StarRatingInput

interface AdaptiveFormFieldProps<TFieldValues extends FieldValues = FieldValues> {
  control: Control<TFieldValues>;
  property: Property;
  formContext: 'create' | 'edit';
}

const INTERNAL_NONE_SELECT_VALUE = "__EMPTY_SELECTION_VALUE__";

export default function AdaptiveFormField<TFieldValues extends FieldValues = FieldValues>({
  control,
  property,
  formContext,
}: AdaptiveFormFieldProps<TFieldValues>) {
  const { models: allModels, getModelById, getObjectsByModelId, getAllObjects } = useData();
  const fieldName = property.name as FieldPath<TFieldValues>;

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


  if (formContext === 'create' && property.type === 'date' && property.autoSetOnCreate) {
    return null; 
  }

  const renderField = (controllerField: ControllerRenderProps<TFieldValues, FieldPath<TFieldValues>>) => {
    let fieldIsDisabled = false;
    if (property.type === 'date' && formContext === 'edit' && (property.autoSetOnCreate || property.autoSetOnUpdate)) {
      fieldIsDisabled = true;
    }
     if (property.type === 'date' && formContext === 'create' && property.autoSetOnCreate){
        // This field is hidden by the check above, but if it were to render, it would be disabled.
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
            disabled={fieldIsDisabled} // Though rating fields typically aren't auto-set
          />
        );
      default:
        return <Input placeholder={`Unsupported type: ${property.type}`} {...controllerField} disabled />;
    }
  };

  let defaultValue: any;
  switch(property.type) {
    case 'relationship':
      defaultValue = property.relationshipType === 'many' ? [] : '';
      break;
    case 'boolean':
      defaultValue = false;
      break;
    case 'date':
      defaultValue = null;
      break;
    case 'rating':
      defaultValue = 0; // 0 for not rated
      break;
    default:
      defaultValue = '';
  }


  return (
    <Controller
      name={fieldName}
      control={control}
      defaultValue={defaultValue}
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
