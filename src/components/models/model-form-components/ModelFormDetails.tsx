
'use client';

import * as React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelectAutocomplete, type MultiSelectOption } from '@/components/ui/multi-select-autocomplete';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { useData } from '@/contexts/data-context';
import type { ModelFormValues } from '../model-form-schema';
import NewModelGroupDialog from './NewModelGroupDialog';

const INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE = "__DEFAULT_DISPLAY_PROPERTY__";
const INTERNAL_DEFAULT_GROUP_ID = "00000000-0000-0000-0000-000000000001";
const INTERNAL_NO_WORKFLOW_VALUE = "__NO_WORKFLOW_SELECTED__";

interface ModelFormDetailsProps {
  form: UseFormReturn<ModelFormValues>;
  existingModel?: ModelFormValues;
}

export default function ModelFormDetails({ form }: ModelFormDetailsProps) {
  const { modelGroups, workflows, isReady: dataReady } = useData();
  const [isCreateGroupDialogOpen, setIsCreateGroupDialogOpen] = React.useState(false);
  const [newlyCreatedGroupId, setNewlyCreatedGroupId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (newlyCreatedGroupId && modelGroups.some(mg => mg.id === newlyCreatedGroupId)) {
      form.setValue('modelGroupId', newlyCreatedGroupId, { shouldValidate: true });
      setNewlyCreatedGroupId(null);
    }
  }, [newlyCreatedGroupId, modelGroups, form]);
  
  const watchedProperties = form.watch("properties");
  const watchedDisplayPropertyNames = form.watch("displayPropertyNames");

  const displayPropertyOptions: MultiSelectOption[] = React.useMemo(() => {
    return (watchedProperties || [])
      .filter(p => p.name && (p.type === 'string' || p.type === 'number' || p.type === 'date'))
      .map(p => ({ value: p.name!, label: p.name! }));
  }, [watchedProperties]);

  const selectedValuesForAutocomplete = React.useMemo(() => {
    const currentDisplayNames = Array.isArray(watchedDisplayPropertyNames) ? watchedDisplayPropertyNames : [];
    if (!currentDisplayNames.length) return [INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE];
    
    const validSelectedValues = currentDisplayNames.filter(name =>
      name === INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE || displayPropertyOptions.some(opt => opt.value === name)
    );
    
    if (validSelectedValues.length === 0) return [INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE];
    if (validSelectedValues.length > 1 && validSelectedValues.includes(INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE)) {
      return validSelectedValues.filter(v => v !== INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE);
    }
    return validSelectedValues;
  }, [watchedDisplayPropertyNames, displayPropertyOptions]);


  return (
    <div className="space-y-4">
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
        name="modelGroupId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Model Group (Namespace)</FormLabel>
            <div className="flex items-center gap-2">
              <Select
                onValueChange={(value) => field.onChange(value === INTERNAL_DEFAULT_GROUP_ID ? null : value)}
                value={field.value ?? INTERNAL_DEFAULT_GROUP_ID}
              >
                <FormControl>
                  <SelectTrigger className="flex-grow">
                    <SelectValue placeholder="Select a group" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {dataReady && modelGroups.sort((a,b) => a.name.localeCompare(b.name)).map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <NewModelGroupDialog
                isOpen={isCreateGroupDialogOpen}
                setIsOpen={setIsCreateGroupDialogOpen}
                onGroupCreated={setNewlyCreatedGroupId}
              />
            </div>
            <FormDescription>Organize models into groups. The 'Default' group is used if none is selected.</FormDescription>
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
              emptyIndicator={displayPropertyOptions.length === 0 ? "No string/number/date properties available." : "No matching properties."}
            />
            <FormDescription>Choose properties to represent this model's objects. If empty, a default (Name/Title/ID) will be used.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="workflowId"
        render={({ field }) => {
          const selectValue = field.value === null || field.value === undefined ? INTERNAL_NO_WORKFLOW_VALUE : field.value;
          return (
            <FormItem>
              <FormLabel>Workflow (Optional)</FormLabel>
              <Select onValueChange={(value) => field.onChange(value === INTERNAL_NO_WORKFLOW_VALUE ? null : value)} value={selectValue}>
                <FormControl><SelectTrigger><SelectValue placeholder="Assign a workflow" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value={INTERNAL_NO_WORKFLOW_VALUE}>-- No Workflow --</SelectItem>
                  {dataReady && workflows.sort((a, b) => a.name.localeCompare(b.name)).map((wf) => (
                    <SelectItem key={wf.id} value={wf.id}>{wf.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>Assign an optional workflow to manage the lifecycle of this model's objects.</FormDescription>
              <FormMessage />
            </FormItem>
          );
        }}
      />
    </div>
  );
}
