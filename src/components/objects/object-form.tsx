
'use client';

import { Controller, type UseFormReturn } from 'react-hook-form';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import type { Model, DataObject, WorkflowWithDetails, User, ValidationRuleset } from '@/lib/types';
import AdaptiveFormField from './adaptive-form-field';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface ObjectFormProps {
  form: UseFormReturn<Record<string, any>>;
  model: Model;
  onCancel: () => void;
  onSubmit: (values: Record<string, any>) => Promise<void>;
  isLoading?: boolean;
  existingObject?: DataObject;
  currentWorkflow?: WorkflowWithDetails | null;
  allUsers?: User[];
  currentUser?: User | null;
  propertyIdsToShow?: string[];
  hiddenPropertyIds?: string[];
  showSubmitButtons?: boolean;
  validationRulesets: ValidationRuleset[];
  formObjectId?: string | null;
}

const INTERNAL_NO_STATE_CHANGE = "__NO_STATE_CHANGE__";
const INTERNAL_NO_OWNER_SELECTED = "__NO_OWNER_SELECTED__";


export default function ObjectForm({
  form,
  model,
  onCancel,
  onSubmit,
  isLoading,
  existingObject,
  currentWorkflow,
  allUsers = [],
  currentUser,
  propertyIdsToShow,
  hiddenPropertyIds = [],
  showSubmitButtons = true,
  validationRulesets,
  formObjectId,
}: ObjectFormProps) {
  const formContext = existingObject ? 'edit' : 'create';

  const allPropertiesSorted = model.properties.sort((a, b) => a.orderIndex - b.orderIndex);

  const visibleProperties = allPropertiesSorted.filter(property => {
    const isVisibleInStep = propertyIdsToShow ? propertyIdsToShow.includes(property.id) : true;
    const isMappedAndHidden = hiddenPropertyIds.includes(property.id);
    return isVisibleInStep && !isMappedAndHidden;
  });

  const propertiesToRenderAsHidden = allPropertiesSorted.filter(property =>
    hiddenPropertyIds.includes(property.id)
  );

  let availableStatesForSelect: Array<{ value: string; label: string; isCurrent: boolean }> = [];
  let currentStateName: string | undefined;

  if (formContext === 'edit' && currentWorkflow && existingObject) {
    const objCurrentStateId = existingObject.currentStateId;
    const objCurrentState = currentWorkflow.states.find(s => s.id === objCurrentStateId);
    
    if (objCurrentState) {
      currentStateName = objCurrentState.name;
      availableStatesForSelect.push({ value: objCurrentState.id, label: `${objCurrentState.name} (Current)`, isCurrent: true });
      objCurrentState.successorStateIds.forEach(successorId => {
        const successorState = currentWorkflow.states.find(s => s.id === successorId);
        if (successorState) {
          availableStatesForSelect.push({ value: successorState.id, label: successorState.name, isCurrent: false });
        }
      });
    } else if (objCurrentStateId === null || objCurrentStateId === undefined) {
      currentStateName = "None (No Current State)";
      availableStatesForSelect.push({ value: INTERNAL_NO_STATE_CHANGE, label: "(No Current State)", isCurrent: true });
      const initialWfState = currentWorkflow.states.find(s => s.isInitial);
      if(initialWfState) {
        availableStatesForSelect.push({ value: initialWfState.id, label: `${initialWfState.name} (Set Initial)`, isCurrent: false });
      }
    } else {
        currentStateName = `Unknown State (ID: ${objCurrentStateId.substring(0,8)}...)`;
        availableStatesForSelect.push({ value: objCurrentStateId, label: `${currentStateName} (Current)`, isCurrent: true });
    }
  }

  const isAdmin = currentUser?.roles.some(r => r.name.toLowerCase() === 'administrator');

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 h-full flex flex-col">
          <ScrollArea className="flex-grow min-h-0 pr-3">
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
                              {availableStatesForSelect.length === 0 && existingObject?.currentStateId && (
                                  <SelectItem value={existingObject.currentStateId} disabled>
                                      {currentStateName || `Current State (ID: ${existingObject.currentStateId.substring(0,8)}...)`}
                                  </SelectItem>
                              )}
                              {availableStatesForSelect.length === 0 && !existingObject?.currentStateId && (
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

                  {formContext === 'edit' && isAdmin && (
                    <FormField
                      control={form.control}
                      name="ownerId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Owner</FormLabel>
                          <Select
                            onValueChange={(value) => field.onChange(value === INTERNAL_NO_OWNER_SELECTED ? null : value)}
                            value={field.value || INTERNAL_NO_OWNER_SELECTED}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select an owner" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value={INTERNAL_NO_OWNER_SELECTED}>-- No Owner / Unassigned --</SelectItem>
                              {allUsers.map(user => (
                                <SelectItem key={user.id} value={user.id}>
                                  {user.username} ({user.roles.map(r => r.name).join(', ')})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Assign or change the owner of this record. (Admin only)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {visibleProperties.map((property) => (
                    <div key={property.id}>
                      <AdaptiveFormField
                        form={form}
                        property={property}
                        formContext={formContext}
                        modelId={model.id}
                        objectId={existingObject?.id || formObjectId}
                        validationRulesets={validationRulesets}
                      />
                    </div>
                  ))}
                  {propertiesToRenderAsHidden.map(property => (
                      <Controller
                          key={property.id}
                          name={property.name as any}
                          control={form.control}
                          render={({ field }) => (
                              <input
                                  type="hidden"
                                  {...field}
                                  value={field.value ?? ''}
                              />
                          )}
                      />
                  ))}
              </div>
          </ScrollArea>

          {showSubmitButtons && (
            <div className="flex-shrink-0 flex justify-end space-x-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} className="bg-primary hover:bg-primary/90">
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {existingObject ? 'Update Object' : 'Create Object'}
              </Button>
            </div>
          )}
      </form>
    </Form>
  );
}
