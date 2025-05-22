
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
}

const getDisplayNameProperty = (model?: Model): string => {
  if (!model) return 'id';
  const nameProp = model.properties.find(p => p.name.toLowerCase() === 'name');
  if (nameProp) return nameProp.name;
  const titleProp = model.properties.find(p => p.name.toLowerCase() === 'title');
  if (titleProp) return titleProp.name;
  // Fallback to the first string property, or just ID
  const firstStringProp = model.properties.find(p => p.type === 'string');
  return firstStringProp ? firstStringProp.name : 'id';
};

const INTERNAL_NONE_SELECT_VALUE = "__EMPTY_SELECTION_VALUE__";

export default function AdaptiveFormField<TFieldValues extends FieldValues = FieldValues>({
  control,
  property,
}: AdaptiveFormFieldProps<TFieldValues>) {
  const { getModelById, getObjectsByModelId } = useData();
  const fieldName = property.name as FieldPath<TFieldValues>;

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
        return (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !controllerField.value && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {controllerField.value ? format(new Date(controllerField.value), "PPP") : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={controllerField.value ? new Date(controllerField.value) : undefined}
                onSelect={(date) => controllerField.onChange(date ? date.toISOString() : null)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        );
      case 'relationship':
        if (!property.relatedModelId || !relatedModel) {
          return <p className="text-destructive">Configuration error: Related model info missing.</p>;
        }
        
        const displayNameProperty = getDisplayNameProperty(relatedModel);
        const options: MultiSelectOption[] = relatedObjects.map((obj: DataObject) => ({
          value: obj.id,
          label: String(obj[displayNameProperty] ?? obj.id),
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
          // Map empty string (form value for "None") to internal value for SelectItem
          const currentSelectValue = controllerField.value === "" ? INTERNAL_NONE_SELECT_VALUE : controllerField.value;
          return (
            <Select
              onValueChange={(value) => {
                // Map internal "None" value back to empty string for form
                controllerField.onChange(value === INTERNAL_NONE_SELECT_VALUE ? "" : value);
              }}
              value={currentSelectValue || ""} // if currentSelectValue is undefined (initial), pass "" to show placeholder
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
      defaultValue={property.relationshipType === 'many' ? [] : property.type === 'boolean' ? false : '' as any}
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
