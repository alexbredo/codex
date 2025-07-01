

'use client';

import * as React from 'react';
import type { UseFormReturn, UseFieldArrayReturn } from 'react-hook-form';
import { useFieldArray, useWatch } from 'react-hook-form';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useData } from '@/contexts/data-context';
import { useToast } from '@/hooks/use-toast';
import type { WizardFormValues, WizardStepFormValues } from './wizard-form-schema';
import type { Model, Property } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, PlusCircle, GripVertical, Wand2, Database, ListChecks, Edit2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WizardFormProps {
  form: UseFormReturn<WizardFormValues>;
  onSubmit: (values: WizardFormValues) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  isEditing?: boolean;
}

interface SortableItemProps {
  id: string;
  children: (props: { dragHandleListeners?: any }) => React.ReactNode;
  className?: string;
}

function SortableItem({ id, children, className }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined };
  return (<div ref={setNodeRef} style={style} {...attributes} className={className}>{children({ dragHandleListeners: listeners })}</div>);
}

function StepPropertySelector({ model, selectedPropertyIds, onSelectionChange }: { model: Model; selectedPropertyIds: string[]; onSelectionChange: (ids: string[]) => void; }) {
    return (
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Select Properties for "{model.name}"</DialogTitle>
                <DialogDescription>Choose which fields from the model to include in this wizard step.</DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-80 border rounded-md p-4">
                <div className="space-y-3">
                    {model.properties.sort((a,b) => a.orderIndex - b.orderIndex).map(prop => (
                        <div key={prop.id} className="flex items-center space-x-2">
                            <Checkbox
                                id={`prop-${model.id}-${prop.id}`}
                                checked={selectedPropertyIds.includes(prop.id)}
                                onCheckedChange={checked => {
                                    const newSelected = checked
                                        ? [...selectedPropertyIds, prop.id]
                                        : selectedPropertyIds.filter(id => id !== prop.id);
                                    onSelectionChange(newSelected);
                                }}
                            />
                            <label htmlFor={`prop-${model.id}-${prop.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                {prop.name} <span className="text-xs text-muted-foreground">({prop.type})</span>
                            </label>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </DialogContent>
    );
}

function WizardStepsManager({ form, statesFieldArray }: { form: UseFormReturn<WizardFormValues>; statesFieldArray: UseFieldArrayReturn<WizardFormValues, "steps", "id"> }) {
  const { fields, append, remove, move } = statesFieldArray;
  const { models } = useData();
  const { toast } = useToast();
  const [openAccordionItems, setOpenAccordionItems] = React.useState<string[]>([]);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
        const oldIndex = fields.findIndex((field) => field.id === active.id);
        const newIndex = fields.findIndex((field) => field.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
            move(oldIndex, newIndex);
            const currentSteps = form.getValues('steps');
            currentSteps.forEach((step, idx) => {
                form.setValue(`steps.${idx}.orderIndex`, idx, { shouldDirty: true });
            });
        }
    }
  };
  
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
        <Accordion type="multiple" className="w-full space-y-2" value={openAccordionItems} onValueChange={setOpenAccordionItems}>
          {fields.map((fieldItem, index) => {
            const selectedModelId = form.watch(`steps.${index}.modelId`);
            const modelForStep = models.find(m => m.id === selectedModelId);
            const headerTitle = modelForStep ? modelForStep.name : `Step #${index + 1}`;
            const selectedProps = form.watch(`steps.${index}.propertyIds`) || [];

            return (
              <SortableItem key={fieldItem.id} id={fieldItem.id} className="bg-card rounded-md border">
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
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); remove(index); }}
                          className="text-destructive hover:bg-destructive/10 flex-shrink-0"
                          aria-label="Remove step"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="p-4 pt-2 space-y-4">
                        <FormField
                            control={form.control}
                            name={`steps.${index}.modelId`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Model for this Step</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl><SelectTrigger><SelectValue placeholder="Select a model..." /></SelectTrigger></FormControl>
                                        <SelectContent>{models.sort((a,b) => a.name.localeCompare(b.name)).map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name={`steps.${index}.instructions`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Instructions (Optional)</FormLabel>
                                    <FormControl><Textarea placeholder="Explain what the user should do in this step." {...field} value={field.value ?? ''} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name={`steps.${index}.propertyIds`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Included Properties</FormLabel>
                                    <Dialog>
                                        <DialogTrigger asChild>
                                            <Button type="button" variant="outline" className="w-full justify-start" disabled={!modelForStep}>
                                                <ListChecks className="mr-2 h-4 w-4"/> {selectedProps.length} of {modelForStep?.properties.length || 0} properties selected
                                            </Button>
                                        </DialogTrigger>
                                        {modelForStep && <StepPropertySelector model={modelForStep} selectedPropertyIds={field.value || []} onSelectionChange={field.onChange} />}
                                    </Dialog>
                                    <FormDescription>Select which fields from "{modelForStep?.name || 'the model'}" to show in this step.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </AccordionContent>
                  </AccordionItem>
                )}
              </SortableItem>
            );
          })}
        </Accordion>
      </SortableContext>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ id: crypto.randomUUID(), modelId: '', instructions: '', propertyIds: [], orderIndex: fields.length })}
        className="mt-4 w-full border-dashed hover:border-solid"
      >
        <PlusCircle className="mr-2 h-4 w-4" /> Add Step
      </Button>
    </DndContext>
  );
}

export default function WizardForm({ form, onSubmit, onCancel, isLoading, isEditing }: WizardFormProps) {
  const stepsFieldArray = useFieldArray({ control: form.control, name: 'steps', keyName: "id" });
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 h-full flex flex-col">
        <ScrollArea className="flex-grow min-h-0 pr-3">
          <div className="space-y-6 p-1">
            <Card>
              <CardHeader><CardTitle className="text-xl">Wizard Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <FormField control={form.control} name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Wizard Name</FormLabel>
                      <FormControl><Input placeholder="e.g., New Employee Onboarding" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField control={form.control} name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl><Textarea placeholder="Describe the purpose of this wizard." {...field} value={field.value ?? ''} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <div>
              <h3 className="text-lg font-medium mb-2 flex items-center"><Database className="mr-2 h-5 w-5 text-primary" /> Wizard Steps</h3>
              <FormField control={form.control} name="steps" render={() => (<FormItem><FormMessage className="text-destructive mb-2" /></FormItem>)} />
              <WizardStepsManager form={form} statesFieldArray={stepsFieldArray} />
            </div>
          </div>
        </ScrollArea>

        <div className="flex-shrink-0 flex justify-end space-x-2 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>Cancel</Button>
          <Button type="submit" disabled={isLoading || form.formState.isSubmitting} className="bg-primary hover:bg-primary/90">
            {isLoading || form.formState.isSubmitting ? 'Saving...' : (isEditing ? 'Update Wizard' : 'Create Wizard')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
