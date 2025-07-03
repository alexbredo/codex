
'use client';

import * as React from 'react';
import { useFieldArray, useForm, type UseFormReturn } from 'react-hook-form';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ModelFormValues, PropertyFormValues } from '../model-form-schema';
import type { Model, ValidationRuleset } from '@/lib/types';
import { useData } from '@/contexts/data-context';
import { Accordion, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from '@/components/ui/button';
import { PlusCircle, GripVertical, Trash2 } from 'lucide-react';
import PropertyItem from './PropertyItem';

interface SortablePropertyItemProps {
  id: string;
  children: (props: { dragHandleListeners?: any }) => React.ReactNode;
  className?: string;
}

function SortablePropertyItem({ id, children, className }: SortablePropertyItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined };
  return <div ref={setNodeRef} style={style} {...attributes} className={className}>{children({ dragHandleListeners: listeners })}</div>;
}

interface PropertyListProps {
  form: UseFormReturn<ModelFormValues>;
  existingModel?: Model;
}

export default function PropertyList({ form, existingModel }: PropertyListProps) {
  const { models, modelGroups, validationRulesets } = useData();
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: 'properties', keyName: "id" });
  const [openAccordionItems, setOpenAccordionItems] = React.useState<string[]>([]);

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const modelsForRelations = React.useMemo(() => models.filter(m => !existingModel || m.id !== existingModel.id), [models, existingModel]);
  
  const modelsForRelationsGrouped = React.useMemo(() => {
    return modelsForRelations.reduce((acc, model) => {
      const group = modelGroups.find(g => g.id === model.modelGroupId);
      const groupName = group ? group.name : 'Default';
      if (!acc[groupName]) acc[groupName] = [];
      acc[groupName].push(model);
      return acc;
    }, {} as Record<string, Model[]>);
  }, [modelsForRelations, modelGroups]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = fields.findIndex((field) => field.id === active.id);
      const newIndex = fields.findIndex((field) => field.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        move(oldIndex, newIndex);
        const currentProperties = form.getValues('properties');
        currentProperties.forEach((prop, idx) => {
          form.setValue(`properties.${idx}.orderIndex`, idx, { shouldDirty: true });
        });
      }
    }
  }

  React.useEffect(() => {
    const errors = form.formState.errors.properties;
    if (Array.isArray(errors)) {
      const itemsToOpen = fields.filter((_, index) => errors[index]).map(field => field.id);
      if (itemsToOpen.length > 0) {
        setOpenAccordionItems(prev => Array.from(new Set([...prev, ...itemsToOpen])));
      }
    }
  }, [form.formState.errors.properties, fields]);

  return (
    <div>
      <h3 className="text-lg font-medium mb-2">Properties</h3>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
          <Accordion type="multiple" className="w-full space-y-2" value={openAccordionItems} onValueChange={setOpenAccordionItems}>
            {fields.map((fieldItem, index) => {
              const propertyName = form.watch(`properties.${index}.name`);
              const propertyType = form.watch(`properties.${index}.type`);
              const headerTitle = propertyName || `Property #${index + 1}`;
              return (
                <SortablePropertyItem key={fieldItem.id} id={fieldItem.id} className="bg-card rounded-md border">
                  {(dndProps) => (
                    <AccordionItem value={fieldItem.id} className="border-0">
                      <AccordionTrigger className="p-4 hover:no-underline data-[state=open]:border-b">
                        <div className="flex justify-between items-center w-full">
                          <div className="flex items-center gap-2">
                            <span {...dndProps.dragHandleListeners} className="cursor-grab p-1 -ml-1 text-muted-foreground hover:text-foreground"><GripVertical className="h-5 w-5" /></span>
                            <span className="text-lg font-medium text-foreground truncate mr-2">{headerTitle}</span>
                            {propertyType && <span className="text-xs text-muted-foreground">({propertyType})</span>}
                          </div>
                          <Button asChild variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); remove(index); }} className="text-destructive hover:bg-destructive/10 flex-shrink-0" aria-label="Remove property">
                            <span role="button" tabIndex={0}><Trash2 className="h-4 w-4" /></span>
                          </Button>
                        </div>
                      </AccordionTrigger>
                      <PropertyItem form={form} index={index} modelsForRelationsGrouped={modelsForRelationsGrouped} validationRulesetsForSelect={validationRulesets} />
                    </AccordionItem>
                  )}
                </SortablePropertyItem>
              );
            })}
          </Accordion>
        </SortableContext>
      </DndContext>
      <Button type="button" variant="outline" size="sm" onClick={() => append({ id: crypto.randomUUID(), name: '', type: 'string', required: false, relationshipType: 'one', orderIndex: fields.length } as PropertyFormValues, { shouldFocus: false })} className="mt-4 w-full border-dashed hover:border-solid">
        <PlusCircle className="mr-2 h-4 w-4" /> Add Property
      </Button>
    </div>
  );
}
