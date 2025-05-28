
'use client';

import type { UseFormReturn, UseFieldArrayReturn } from 'react-hook-form';
import { useFieldArray, useWatch } from 'react-hook-form';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Trash2, PlusCircle, GripVertical, Network } from 'lucide-react';
import type { WorkflowFormValues, WorkflowStateFormValues } from './workflow-form-schema';
import type { WorkflowWithDetails } from '@/lib/types';
import { MultiSelectAutocomplete, type MultiSelectOption } from '@/components/ui/multi-select-autocomplete';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useToast } from '@/hooks/use-toast';

interface WorkflowFormProps {
  form: UseFormReturn<WorkflowFormValues>;
  onSubmit: (values: WorkflowFormValues) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  existingWorkflow?: WorkflowWithDetails;
}

interface SortableStateItemProps {
  id: string;
  children: (props: { dragHandleListeners?: any }) => React.ReactNode;
  className?: string;
}

function SortableStateItem({ id, children, className }: SortableStateItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined };
  return (<div ref={setNodeRef} style={style} {...attributes} className={className}>{children({ dragHandleListeners: listeners })}</div>);
}


function StateFields({ control, form, statesFieldArray }: {
  control: UseFormReturn<WorkflowFormValues>['control'],
  form: UseFormReturn<WorkflowFormValues>,
  statesFieldArray: UseFieldArrayReturn<WorkflowFormValues, "states", "id">
}) {
  const { fields, append, remove, move } = statesFieldArray;
  const [openAccordionItems, setOpenAccordionItems] = React.useState<string[]>([]);
  const { toast } = useToast();

  const watchedStates = useWatch({ control, name: "states" });

  const stateOptionsForSuccessors = React.useMemo(() => {
    return (watchedStates || [])
      .filter(s => s.name?.trim() !== '')
      .map(s => ({ value: s.name!, label: s.name! }));
  }, [watchedStates]);

  const handleInitialStateChange = (changedIndex: number, isChecked: boolean) => {
    if (isChecked) {
      form.getValues().states.forEach((_, index) => {
        if (index !== changedIndex) {
          form.setValue(`states.${index}.isInitial`, false);
        }
      });
    }
    form.setValue(`states.${changedIndex}.isInitial`, isChecked);
  };

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = fields.findIndex((field) => field.id === active.id);
      const newIndex = fields.findIndex((field) => field.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        move(oldIndex, newIndex);
      }
    }
  }
  
  React.useEffect(() => {
    const itemsToOpen = new Set<string>();
    const statesErrors = form.formState.errors.states;
    if (Array.isArray(statesErrors)) {
      fields.forEach((fieldItem, idx) => {
        const stateErrorAtIndex = statesErrors[idx] as any;
        if (stateErrorAtIndex && typeof stateErrorAtIndex === 'object' && Object.keys(stateErrorAtIndex).length > 0) {
          if (Object.values(stateErrorAtIndex).some((errorField: any) => errorField && typeof errorField.message === 'string')) {
            itemsToOpen.add(fieldItem.id);
          }
        }
      });
    }
    if (itemsToOpen.size > 0) {
      setOpenAccordionItems(prev => Array.from(new Set([...prev, ...itemsToOpen])));
    }
  }, [form.formState.errors.states, fields]);


  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
        <Accordion type="multiple" className="w-full space-y-2" value={openAccordionItems} onValueChange={setOpenAccordionItems}>
          {fields.map((fieldItem, index) => {
            const stateName = form.watch(`states.${index}.name`);
            const headerTitle = stateName || `State #${index + 1}`;
            return (
              <SortableStateItem key={fieldItem.id} id={fieldItem.id} className="bg-card rounded-md border">
                {(dndProps) => (
                  <AccordionItem value={fieldItem.id} className="border-0">
                    <AccordionTrigger className="p-4 hover:no-underline data-[state=open]:border-b">
                      <div className="flex justify-between items-center w-full">
                        <div className="flex items-center gap-2">
                          <span {...dndProps.dragHandleListeners} className="cursor-grab p-1 -ml-1 text-muted-foreground hover:text-foreground">
                            <GripVertical className="h-5 w-5" />
                          </span>
                          <span className="text-lg font-medium text-foreground truncate mr-2">{headerTitle}</span>
                        </div>
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); remove(index); }}
                          className="text-destructive hover:bg-destructive/10 flex-shrink-0"
                          aria-label="Remove state"
                        >
                          <span role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); remove(index); } }}>
                            <Trash2 className="h-4 w-4" />
                          </span>
                        </Button>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="p-4 pt-0">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <FormField control={control} name={`states.${index}.name`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>State Name</FormLabel>
                              <FormControl><Input placeholder="e.g., Open, In Review" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField control={control} name={`states.${index}.description`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Description (Optional)</FormLabel>
                              <FormControl><Textarea placeholder="Brief description of this state." {...field} value={field.value ?? ''} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField control={control} name={`states.${index}.isInitial`}
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 mb-4">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={(checked) => handleInitialStateChange(index, !!checked)} />
                            </FormControl>
                            <div className="space-y-0.5 leading-none">
                              <FormLabel className="text-sm">Initial State</FormLabel>
                              <FormDescription className="text-xs">Is this the starting state for new records?</FormDescription>
                            </div>
                          </FormItem>
                        )}
                      />
                      <FormField control={control} name={`states.${index}.successorStateNames`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Successor States (Optional)</FormLabel>
                            <MultiSelectAutocomplete
                              options={stateOptionsForSuccessors.filter(opt => opt.value !== stateName)} // Cannot be its own successor
                              selected={field.value || []}
                              onChange={field.onChange}
                              placeholder="Select next possible states..."
                              emptyIndicator="No other states defined yet, or all are selected."
                            />
                            <FormDescription className="text-xs">Which states can this state transition to?</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </AccordionContent>
                  </AccordionItem>
                )}
              </SortableStateItem>
            );
          })}
        </Accordion>
      </SortableContext>
      <Button type="button" variant="outline" size="sm"
        onClick={() => append({ id: crypto.randomUUID(), name: '', description: '', isInitial: false, successorStateNames: [] })}
        className="mt-4 w-full border-dashed hover:border-solid"
      >
        <PlusCircle className="mr-2 h-4 w-4" /> Add State
      </Button>
    </DndContext>
  );
}

export default function WorkflowForm({ form, onSubmit, onCancel, isLoading, existingWorkflow }: WorkflowFormProps) {
  const statesFieldArray = useFieldArray({ control: form.control, name: 'states', keyName: "id" });
  const { toast } = useToast();
  
  const handleFormSubmit = async (values: WorkflowFormValues) => {
    const initialStates = values.states.filter(s => s.isInitial);
    if (initialStates.length > 1) {
        toast({ variant: "destructive", title: "Validation Error", description: "A workflow can only have one initial state."});
        form.setError("states", { type: "manual", message: "A workflow can only have one initial state." });
        return;
    }
    // Ensure all successor state names are valid by checking against current state names
    let allSuccessorsValid = true;
    values.states.forEach((state, stateIndex) => {
        if(state.successorStateNames) {
            state.successorStateNames.forEach(successorName => {
                if (!values.states.some(s => s.name === successorName && s.name !== state.name)) {
                    allSuccessorsValid = false;
                    form.setError(`states.${stateIndex}.successorStateNames`, { 
                        type: "manual", 
                        message: `Successor state "${successorName}" is not a valid state name in this workflow or is self-referential.` 
                    });
                }
            });
        }
    });

    if (!allSuccessorsValid) {
        toast({ variant: "destructive", title: "Validation Error", description: "One or more successor states are invalid. Please check state names."});
        return;
    }


    await onSubmit(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-8 h-full flex flex-col">
        <ScrollArea className="flex-grow min-h-0 pr-3">
          <div className="space-y-6 p-1">
            <Card>
              <CardHeader><CardTitle className="text-xl">Workflow Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <FormField control={form.control} name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Workflow Name</FormLabel>
                      <FormControl><Input placeholder="e.g., Document Approval, Task Management" {...field} /></FormControl>
                      <FormDescription>A unique name for this workflow.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField control={form.control} name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl><Textarea placeholder="Describe the purpose of this workflow." {...field} value={field.value ?? ''} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <div>
              <h3 className="text-lg font-medium mb-2 flex items-center"><Network className="mr-2 h-5 w-5 text-primary" /> States & Transitions</h3>
               <FormField
                  control={form.control}
                  name="states" 
                  render={() => ( 
                    <FormItem>
                      <FormMessage className="text-destructive mt-2" />
                    </FormItem>
                  )}
                />
              <StateFields control={form.control} form={form} statesFieldArray={statesFieldArray} />
            </div>
          </div>
        </ScrollArea>

        <div className="flex-shrink-0 flex justify-end space-x-2 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>Cancel</Button>
          <Button type="submit" disabled={isLoading || form.formState.isSubmitting} className="bg-primary hover:bg-primary/90">
            {isLoading || form.formState.isSubmitting ? 'Saving...' : (existingWorkflow ? 'Update Workflow' : 'Create Workflow')}
          </Button>
        </div>
      </form>
    </Form>
  );
}

