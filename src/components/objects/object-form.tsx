
'use client';

import type { UseFormReturn, ControllerRenderProps, FieldValues, FieldPath } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form';
import type { Model, DataObject, WorkflowWithDetails, WorkflowStateWithSuccessors } from '@/lib/types';
import AdaptiveFormField from './adaptive-form-field';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ObjectFormProps {
  form: UseFormReturn<Record<string, any>>;
  model: Model;
  onSubmit: (values: Record<string, any>) => void;
  onCancel: () => void;
  isLoading?: boolean;
  existingObject?: DataObject;
  formObjectId?: string | null; // Used to pass objectId for image uploads
  currentWorkflow?: WorkflowWithDetails | null;
}

const INTERNAL_NO_STATE_CHANGE = "__NO_STATE_CHANGE__";

export default function ObjectForm({
  form,
  model,
  onSubmit,
  onCancel,
  isLoading,
  existingObject,
  formObjectId,
  currentWorkflow,
}: ObjectFormProps) {
  const formContext = existingObject ? 'edit' : 'create';

  let availableStatesForSelect: Array<{ value: string; label: string; isCurrent: boolean }> = [];
  let currentStateName: string | undefined;

  if (formContext === 'edit' && currentWorkflow && existingObject) {
    const objCurrentStateId = existingObject.currentStateId;
    const objCurrentState = currentWorkflow.states.find(s => s.id === objCurrentStateId);
    
    if (objCurrentState) {
      currentStateName = objCurrentState.name;
      // Add current state as an option (marked as current)
      availableStatesForSelect.push({ value: objCurrentState.id, label: `${objCurrentState.name} (Current)`, isCurrent: true });
      
      // Add successor states
      objCurrentState.successorStateIds.forEach(successorId => {
        const successorState = currentWorkflow.states.find(s => s.id === successorId);
        if (successorState) {
          availableStatesForSelect.push({ value: successorState.id, label: successorState.name, isCurrent: false });
        }
      });
    } else if (objCurrentStateId === null || objCurrentStateId === undefined) {
      // If object has no current state, but workflow exists, allow selection of initial state if any
      currentStateName = "None (No Current State)";
      availableStatesForSelect.push({ value: INTERNAL_NO_STATE_CHANGE, label: "(No Current State)", isCurrent: true });
      const initialWfState = currentWorkflow.states.find(s => s.isInitial);
      if(initialWfState) {
        availableStatesForSelect.push({ value: initialWfState.id, label: `${initialWfState.name} (Set Initial)`, isCurrent: false });
      }
    } else {
        // Current state ID exists but not found in workflow (edge case, e.g. workflow changed)
        currentStateName = `Unknown State (ID: ${objCurrentStateId.substring(0,8)}...)`;
        availableStatesForSelect.push({ value: objCurrentStateId, label: `${currentStateName} (Current)`, isCurrent: true });
    }
  }


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-4 ">
                {formContext === 'edit' && currentWorkflow && existingObject && (
                  <FormField
                    control={form.control}
                    name="currentStateId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State</FormLabel>
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value === INTERNAL_NO_STATE_CHANGE ? (existingObject?.currentStateId || null) : value)
                          }}
                          // Ensure value is a string, RHF might provide null. If null/undefined, use placeholder.
                          value={field.value ? String(field.value) : (existingObject?.currentStateId ? String(existingObject.currentStateId) : INTERNAL_NO_STATE_CHANGE) }
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select state" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {availableStatesForSelect.map(stateOption => (
                              <SelectItem key={stateOption.value} value={stateOption.value}>
                                {stateOption.label}
                              </SelectItem>
                            ))}
                             {availableStatesForSelect.length === 0 && objCurrentStateId && (
                                 <SelectItem value={objCurrentStateId} disabled>
                                    {currentStateName || `Current State (ID: ${objCurrentStateId.substring(0,8)}...)`}
                                </SelectItem>
                            )}
                            {availableStatesForSelect.length === 0 && !objCurrentStateId && (
                                 <SelectItem value={INTERNAL_NO_STATE_CHANGE} disabled>
                                    (No Current State)
                                </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Current state: {currentStateName || "Not set"}. Change to a valid next state.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {model.properties.map((property) => (
                <AdaptiveFormField
                    key={property.id}
                    form={form} 
                    property={property}
                    formContext={formContext}
                    modelId={model.id}
                    objectId={formObjectId || existingObject?.id}
                />
                ))}
            </div>
        </ScrollArea>
        <div className="flex justify-end space-x-2 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading || form.formState.isSubmitting} className="bg-primary hover:bg-primary/90">
            {isLoading || form.formState.isSubmitting ? 'Saving...' : (existingObject ? `Update ${model.name}` : `Create ${model.name}`)}
          </Button>
        </div>
      </form>
    </Form>
  );
}
