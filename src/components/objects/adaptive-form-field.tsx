
'use client';

import type { Control, FieldPath, FieldValues, ControllerRenderProps } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import type { Property, DataObject, Model } from '@/lib/types';
import { useData } from '@/contexts/data-context';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { MultiSelectAutocomplete, type MultiSelectOption } from '@/components/ui/multi-select-autocomplete';
import { useMemo } from 'react';

interface AdaptiveFormFieldProps<TFieldValues extends FieldValues = FieldValues> {
  control: Control<TFieldValues>;
  property: Property;
  formContext: 'create' | 'edit';
}

// Centralized display value logic
const getObjectDisplayValue = (
    obj: DataObject | undefined,
    model: Model | undefined,
    allModels: Model[],
    allObjects: Record<string, DataObject[]>
): string => {
  if (!obj || !model) return obj?.id ? `ID: ...${obj.id.slice(-6)}` : 'N/A';

  if (model.displayPropertyNames && model.displayPropertyNames.length > 0) {
    const displayValues = model.displayPropertyNames
      .map(propName => {
        const propValue = obj[propName];
        if (propValue === null || typeof propValue === 'undefined' || String(propValue).trim() === '') {
          return null;
        }
        const propertyDefinition = model.properties.find(p => p.name === propName);
        if (propertyDefinition?.type === 'relationship' && propertyDefinition.relatedModelId) {
            const relatedModelForProp = allModels.find(m => m.id === propertyDefinition.relatedModelId);
            const relatedObjForProp = (allObjects[propertyDefinition.relatedModelId] || []).find(o => o.id === propValue);
            return getObjectDisplayValue(relatedObjForProp, relatedModelForProp, allModels, allObjects);
        }
        return String(propValue);
      })
      .filter(value => value !== null && value.trim() !== '');

    if (displayValues.length > 0) {
      return displayValues.join(' - ');
    }
  }

  const nameProp = model.properties.find(p => p.name.toLowerCase() === 'name');
  if (nameProp && obj[nameProp.name] !== null && typeof obj[nameProp.name] !== 'undefined' && String(obj[nameProp.name]).trim() !== '') {
    return String(obj[nameProp.name]);
  }

  const titleProp = model.properties.find(p => p.name.toLowerCase() === 'title');
  if (titleProp && obj[titleProp.name] !== null && typeof obj[titleProp.name] !== 'undefined' && String(obj[titleProp.name]).trim() !== '') {
    return String(obj[titleProp.name]);
  }

  const firstStringProp = model.properties.find(p => p.type === 'string');
  if (firstStringProp && obj[firstStringProp.name] !== null && typeof obj[firstStringProp.name] !== 'undefined' && String(obj[firstStringProp.name]).trim() !== '') {
    return String(obj[firstStringProp.name]);
  }

  return obj.id ? `ID: ...${obj.id.slice(-6)}` : 'N/A';
};


const INTERNAL_NONE_SELECT_VALUE = "__EMPTY_SELECTION_VALUE__";

export default function AdaptiveFormField<TFieldValues extends FieldValues = FieldValues>({
  control,
  property,
  formContext,
}: AdaptiveFormFieldProps<TFieldValues>) {
  const { models: allModels, getModelById, getObjectsByModelId, getAllObjects } = useData();
  const fieldName = property.name as FieldPath<TFieldValues>;

  const allDbObjects = useMemo(() => getAllObjects(), [getAllObjects]);


  const relatedModel = useMemo(() => {
    if (property.type === 'relationship' && property.relatedModelId) {
      return getModelById(property.relatedModelId);
    }
    return undefined;
  }, [property.type, property.relatedModelId, getModelById]);

  const relatedObjects = useMemo(() => {
    if (relatedModel && property.relatedModelId) {
      return getObjectsByModelId(property.relatedModelId);
    }
    return [];
  }, [relatedModel, property.relatedModelId, getObjectsByModelId]);


  const renderField = (controllerField: ControllerRenderProps<TFieldValues, FieldPath<TFieldValues>>) => {
    let fieldIsDisabled = false;
    if (property.type === 'date') {
      if (formContext === 'create' && property.autoSetOnCreate) {
          fieldIsDisabled = true;
      } else if (formContext === 'edit' && (property.autoSetOnCreate || property.autoSetOnUpdate)) {
          fieldIsDisabled = true;
      }
    }

    switch (property.type) {
      case 'string':
        if (property.name.toLowerCase().includes('description') || property.name.toLowerCase().includes('notes')) {
            return <Textarea placeholder={`Enter ${property.name}`} {...controllerField} value={controllerField.value ?? ''} />;
        }
        return <Input placeholder={`Enter ${property.name}`} {...controllerField} value={controllerField.value ?? ''} />;
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
            dateButtonText = "Invalid Date"; // Should not happen with ISO strings
          }
        } else {
          if (fieldIsDisabled) {
            // If disabled and no value, it's typically an auto-set field on a new form
            dateButtonText = (formContext === 'create' && property.autoSetOnCreate) || (formContext === 'edit' && property.autoSetOnUpdate) 
                             ? "Auto-set by system" 
                             : "N/A";
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

        const options: MultiSelectOption[] = relatedObjects.map((obj: DataObject) => ({
          value: obj.id,
          label: getObjectDisplayValue(obj, relatedModel, allModels, allDbObjects),
        }));

        if (property.relationshipType === 'many') {
          return (
            <MultiSelectAutocomplete
              options={options}
              selected={controllerField.value || []}
              onChange={controllerField.onChange}
              placeholder={`Select ${relatedModel.name}(s)...`}
              emptyIndicator={`No ${relatedModel.name.toLowerCase()}s found.`}
            />
          );
        } else { // 'one' or undefined
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
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }
      default:
        return <Input placeholder={`Unsupported type: ${property.type}`} {...controllerField} disabled />;
    }
  };

  return (
    <Controller
      name={fieldName}
      control={control}
      defaultValue={property.relationshipType === 'many' ? [] : property.type === 'boolean' ? false : property.type === 'date' ? null : '' as any}
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
