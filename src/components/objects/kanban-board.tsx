
'use client';

import * as React from 'react';
import type { DataObject, Model, WorkflowWithDetails, WorkflowStateWithSuccessors } from '@/lib/types';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragOverEvent, DragOverlay, type UniqueIdentifier } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableKanbanItem, KanbanCard } from './kanban-card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface KanbanBoardProps {
  model: Model;
  workflow: WorkflowWithDetails;
  objects: DataObject[];
  allModels: Model[];
  allObjects: Record<string, DataObject[]>;
  onObjectUpdate: (objectId: string, newStateId: string) => Promise<void>;
  onViewObject: (object: DataObject) => void;
}

interface KanbanColumn {
  id: string; // state.id
  title: string; // state.name
  objects: DataObject[];
}

export default function KanbanBoard({ model, workflow, objects, allModels, allObjects, onObjectUpdate, onViewObject }: KanbanBoardProps) {
  const [activeId, setActiveId] = React.useState<UniqueIdentifier | null>(null);
  const [columns, setColumns] = React.useState<KanbanColumn[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [tentativeOverColumnId, setTentativeOverColumnId] = React.useState<string | null>(null);
  const [activeItemOriginalColumnId, setActiveItemOriginalColumnId] = React.useState<string | null>(null);


  React.useEffect(() => {
    const allWorkflowStates = workflow.states;

    const initialStates: WorkflowStateWithSuccessors[] = [];
    const terminalStates: WorkflowStateWithSuccessors[] = [];
    const intermediateStates: WorkflowStateWithSuccessors[] = [];

    allWorkflowStates.forEach(state => {
      if (state.isInitial) {
        initialStates.push(state);
      } else if (!state.successorStateIds || state.successorStateIds.length === 0) {
        terminalStates.push(state);
      } else {
        intermediateStates.push(state);
      }
    });

    intermediateStates.sort((a, b) => a.name.localeCompare(b.name));
    terminalStates.sort((a, b) => a.name.localeCompare(b.name));
    const orderedWorkflowStates = [...initialStates, ...intermediateStates, ...terminalStates];

    const newColumns = orderedWorkflowStates.map(state => ({
      id: state.id,
      title: state.name,
      objects: objects.filter(obj => obj.currentStateId === state.id).sort((a,b) => {
        const aName = String(a.id || '');
        const bName = String(b.id || '');
        return aName.localeCompare(bName);
      })
    }));
    setColumns(newColumns);
  }, [workflow, objects]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // activationConstraint: { distance: 5 }, // Removed for simplicity, defaults are usually fine
    })
  );

  const findColumn = (id: UniqueIdentifier | undefined | null): KanbanColumn | null => {
    if (!id) return null;
    return columns.find(col => col.id === id || col.objects.some(obj => obj.id === id)) || null;
  };

  const findObjectById = (id: UniqueIdentifier | undefined | null): DataObject | null => {
     if (!id) return null;
     for (const col of columns) {
        const obj = col.objects.find(o => o.id === id);
        if (obj) return obj;
     }
     return null;
  };

  const handleDragStart = (event: any) => {
    console.log("[KanbanBoard] handleDragStart. Active:", event.active);
    setActiveId(event.active.id);
    const originalCol = findColumn(event.active.id);
    setActiveItemOriginalColumnId(originalCol ? originalCol.id : null);
    setTentativeOverColumnId(null); // Reset tentative target on new drag start
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !active) {
        if (tentativeOverColumnId !== null) {
             // console.log(`[KanbanBoard] handleDragOver: Dragged out of any known column area. Resetting tentativeOverColumnId.`);
             // Do not reset here, let onDragEnd handle the final state or if it goes over nothing.
        }
      return;
    }

    let potentialTargetColumnId: string | null = null;

    if (columns.some(col => col.id === over.id)) {
        potentialTargetColumnId = String(over.id);
    } else if (over.data.current?.sortable?.containerId && columns.some(col => col.id === over.data.current.sortable.containerId)) {
        potentialTargetColumnId = String(over.data.current.sortable.containerId);
    } else {
        const columnContainingOverItem = findColumn(over.id);
        if (columnContainingOverItem) {
            potentialTargetColumnId = columnContainingOverItem.id;
        }
    }

    if (potentialTargetColumnId && potentialTargetColumnId !== tentativeOverColumnId) {
      console.log(`[KanbanBoard] handleDragOver: Tentative target column updated to: ${potentialTargetColumnId} (was ${tentativeOverColumnId}). Original active column: ${activeItemOriginalColumnId}`);
      setTentativeOverColumnId(potentialTargetColumnId);
    }
  };


  async function handleDragEnd(event: DragEndEvent) {
    console.log("[KanbanBoard] handleDragEnd triggered. Active:", event.active, "Over:", event.over);
    const { active, over } = event;

    if (!active) {
        setActiveId(null);
        setTentativeOverColumnId(null);
        setActiveItemOriginalColumnId(null);
        console.warn("[KanbanBoard] handleDragEnd: No 'active' item. Bailing.");
        return;
    }
    
    const activeObjectId = String(active.id);
    const originalColumnId = activeItemOriginalColumnId;

    if (!originalColumnId) {
      console.warn("[KanbanBoard] handleDragEnd: Could not determine original column for active item:", activeObjectId);
      setActiveId(null);
      setTentativeOverColumnId(null);
      setActiveItemOriginalColumnId(null);
      return;
    }
    console.log(`[KanbanBoard] handleDragEnd: Original column ID: ${originalColumnId}`);
    console.log(`[KanbanBoard] handleDragEnd: Tentative target from onDragOver: ${tentativeOverColumnId}`);

    let targetColumnId: string | null = null;

    // Strategy:
    // 1. Use tentativeOverColumnId if it's valid and different from original. This captures intentional moves over other columns.
    // 2. If not, or if it's the same, then analyze 'over' from onDragEnd to determine the target.
    
    if (tentativeOverColumnId && tentativeOverColumnId !== originalColumnId) {
        targetColumnId = tentativeOverColumnId;
        console.log(`[KanbanBoard] handleDragEnd: Using tentativeOverColumnId as target: ${targetColumnId}`);
    } else if (over) {
        if (columns.some(col => col.id === over.id)) {
            targetColumnId = String(over.id);
            console.log(`[KanbanBoard] handleDragEnd: Target column ID from over.id (direct column drop): ${targetColumnId}`);
        } else if (over.data.current?.sortable?.containerId && columns.some(col => col.id === over.data.current.sortable.containerId)) {
            targetColumnId = String(over.data.current.sortable.containerId);
            console.log(`[KanbanBoard] handleDragEnd: Target column ID from over.data.current.sortable.containerId: ${targetColumnId}`);
        } else {
            const columnContainingOverItem = findColumn(over.id);
            if (columnContainingOverItem) {
                targetColumnId = columnContainingOverItem.id;
                console.log(`[KanbanBoard] handleDragEnd: Target column ID by finding parent of over.id (item drop fallback): ${targetColumnId}`);
            }
        }
    } else { // if over is null, but tentativeOverColumnId was set (and potentially to original column)
         targetColumnId = tentativeOverColumnId; // Could be null or original column
         console.log(`[KanbanBoard] handleDragEnd: 'over' is null, using tentativeOverColumnId: ${targetColumnId}`);
    }


    if (!targetColumnId) {
        console.warn(`[KanbanBoard] handleDragEnd: Final target column could not be determined. Over.id: ${over?.id}, Over.data:`, JSON.stringify(over?.data.current));
        setActiveId(null);
        setTentativeOverColumnId(null);
        setActiveItemOriginalColumnId(null);
        return;
    }

    console.log(`[KanbanBoard] handleDragEnd: Final Target column ID: ${targetColumnId}`);
    const targetColumn = columns.find(col => col.id === targetColumnId);

    if (!targetColumn) {
        console.warn("[KanbanBoard] handleDragEnd: Target column definition not found for ID:", targetColumnId);
        setActiveId(null);
        setTentativeOverColumnId(null);
        setActiveItemOriginalColumnId(null);
        return;
    }

    if (originalColumnId !== targetColumn.id) {
        console.log(`[KanbanBoard] handleDragEnd: Attempting to move object ${activeObjectId} from ${originalColumnId} to ${targetColumn.id}`);
        setIsLoading(true);
        try {
          await onObjectUpdate(activeObjectId, targetColumn.id);
          console.log(`[KanbanBoard] handleDragEnd: onObjectUpdate completed for ${activeObjectId} to ${targetColumn.id}`);
        } catch (error) {
            console.error("[KanbanBoard] handleDragEnd: Error during onObjectUpdate:", error);
        } finally {
            setIsLoading(false);
        }
    } else if (over) { // Only attempt reorder if 'over' is defined (i.e., dropped on a valid target)
      const columnIndex = columns.findIndex(col => col.id === originalColumnId);
      if (columnIndex !== -1) {
        const itemsInColumn = columns[columnIndex].objects;
        const oldIndex = itemsInColumn.findIndex(item => item.id === active.id);

        let newIndex = -1;
        // If dropped directly on the column (SortableContext) or if over.id isn't an item in this column, place at end.
        if (over.id === originalColumnId || !itemsInColumn.some(item => item.id === over.id)) {
            newIndex = itemsInColumn.length -1; // Place at the end if dropped on column itself or unknown item
        } else { // Dropped on another item in the same column
            newIndex = itemsInColumn.findIndex(item => item.id === over.id);
        }

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          console.log(`[KanbanBoard] handleDragEnd: Reordering object ${activeObjectId} within column ${originalColumnId} from index ${oldIndex} to ${newIndex}`);
          setColumns(prev => {
            const newCols = [...prev];
            newCols[columnIndex] = {
              ...newCols[columnIndex],
              objects: arrayMove(itemsInColumn, oldIndex, newIndex),
            };
            return newCols;
          });
        } else {
            console.log(`[KanbanBoard] handleDragEnd: No reorder needed within column ${originalColumnId}. Old index: ${oldIndex}, New index: ${newIndex}`);
        }
      }
    } else {
         console.log(`[KanbanBoard] handleDragEnd: Dropped back into the same column '${originalColumnId}', but 'over' target was null or invalid for reorder. No action taken.`);
    }

    setActiveId(null);
    setTentativeOverColumnId(null);
    setActiveItemOriginalColumnId(null);
  }

  const activeObject = activeId ? findObjectById(activeId) : null;

  if (!workflow.states || workflow.states.length === 0) {
    return <div className="p-4 text-center text-muted-foreground">This workflow has no states defined.</div>;
  }
  if (isLoading) {
    return (
      <div className="flex w-full justify-center items-center p-10">
        <Skeleton className="h-10 w-10 rounded-full animate-spin" />
        <p className="ml-2">Updating state...</p>
      </div>
    );
  }

  return (
    <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
    >
      <ScrollArea className="w-full rounded-md border">
        <div className="flex gap-4 p-4 min-h-[calc(100vh-20rem)]">
          {columns.map(column => (
            <SortableContext key={column.id} id={column.id} items={column.objects.map(obj => obj.id)} strategy={verticalListSortingStrategy}>
              <Card className="w-80 flex-shrink-0 h-full flex flex-col bg-muted/50">
                <CardHeader className="p-3 border-b sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                  <CardTitle className="text-base flex justify-between items-center">
                    {column.title}
                    <Badge variant="secondary">{column.objects.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className={cn(
                    "p-3 space-y-2 flex-grow overflow-y-auto min-h-[200px]",
                    "flex flex-col"
                  )}>
                  {column.objects.length > 0 ? (
                    column.objects.map(object => (
                      <SortableKanbanItem
                        key={object.id}
                        id={object.id}
                        object={object}
                        model={model}
                        allModels={allModels}
                        allObjects={allObjects}
                        onViewObject={onViewObject}
                      />
                    ))
                  ) : (
                    <div className="flex-grow flex items-center justify-center text-sm text-muted-foreground p-4 border-2 border-dashed border-gray-300 rounded-md min-h-[100px]">
                        Drag items here
                    </div>
                  )}
                </CardContent>
              </Card>
            </SortableContext>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <DragOverlay dropAnimation={null}>
        {activeObject && activeId ? (
          <KanbanCard
            object={activeObject}
            model={model}
            allModels={allModels}
            allObjects={allObjects}
            onViewObject={() => {}}
            className="ring-2 ring-primary shadow-xl opacity-100 cursor-grabbing"
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
    