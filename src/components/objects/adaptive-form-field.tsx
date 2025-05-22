'use client';

import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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
  FormDescription,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import type { Property, DataObject } from '@/lib/types';
import { useData } from '@/contexts/data-context';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';


interface AdaptiveFormFieldProps<TFieldValues extends FieldValues = FieldValues> {
  control: Control<TFieldValues>;
  property: Property;
}

export default function AdaptiveFormField<TFieldValues extends FieldValues = FieldValues>({
  control,
  property,
}: AdaptiveFormFieldProps<TFieldValues>) {
  const { getModelById, getObjectsByModelId } = useData();
  const fieldName = property.name as FieldPath<TFieldValues>;

  const renderField = (controllerField: any) => {
    switch (property.type) {
      case 'string':
        // Check for long text potential, naive check for now
        if (property.name.toLowerCase().includes('description') || property.name.toLowerCase().includes('notes')) {
            return <Textarea placeholder={`Enter ${property.name}`} {...controllerField} value={controllerField.value ?? ''} />;
        }
        return <Input placeholder={`Enter ${property.name}`} {...controllerField} value={controllerField.value ?? ''} />;
      case 'number':
        return <Input type="number" placeholder={`Enter ${property.name}`} {...controllerField}  value={controllerField.value ?? ''} onChange={e => controllerField.onChange(parseFloat(e.target.value))} />;
      case 'boolean':
        return <Switch checked={controllerField.value} onCheckedChange={controllerField.onChange} />;
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
        if (!property.relatedModelId) {
          return <p className="text-destructive-foreground">Configuration error: Related model ID missing.</p>;
        }
        const relatedModel = getModelById(property.relatedModelId);
        const relatedObjects = getObjectsByModelId(property.relatedModelId);
        if (!relatedModel) {
          return <p className="text-destructive-foreground">Configuration error: Related model not found.</p>;
        }
        // Attempt to find a 'name' or 'title' property for display in Select
        const displayProperty = relatedModel.properties.find(p => p.name.toLowerCase() === 'name' || p.name.toLowerCase() === 'title') || relatedModel.properties[0];

        return (
          <Select onValueChange={controllerField.onChange} defaultValue={controllerField.value}>
            <SelectTrigger>
              <SelectValue placeholder={`Select ${relatedModel.name}`} />
            </SelectTrigger>
            <SelectContent>
              {relatedObjects.map((obj: DataObject) => (
                <SelectItem key={obj.id} value={obj.id}>
                  {displayProperty ? String(obj[displayProperty.name]) : obj.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      default:
        return <Input placeholder={`Unsupported type: ${property.type}`} {...controllerField} disabled />;
    }
  };

  return (
    <Controller
      name={fieldName}
      control={control}
      render={({ field, fieldState: { error } }) => (
        <FormItem>
          <FormLabel>{property.name}{property.required && <span className="text-destructive">*</span>}</FormLabel>
          <FormControl>{renderField(field)}</FormControl>
          {/* <FormDescription>Any specific instructions for this field.</FormDescription> */}
          {error && <FormMessage>{error.message}</FormMessage>}
        </FormItem>
      )}
    />
  );
}
