
'use client';

import * as React from 'react';
import type { DataObject, Model, WorkflowWithDetails, WorkflowStateWithSuccessors } from '@/lib/types';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragOverEvent, DragOverlay, type UniqueIdentifier, MeasuringStrategy } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableKanbanItem, KanbanCard } from './kanban-card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

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
      activationConstraint: {
        distance: 10,
      },
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
    setActiveId(event.active.id);
  };

  const handleDragOver = (event: DragOverEvent) => {
    // No-op for inter-column. Visual updates are handled by DragOverlay.
    // Final state update and re-render happens after handleDragEnd completes.
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    // Optimistic reordering within the same column
    const activeColumn = findColumn(active.id);
    const overColumn = findColumn(over.id);

    if (activeColumn && overColumn && activeColumn.id === overColumn.id) {
      setColumns(prev => {
        const activeColumnIndex = prev.findIndex(col => col.id === activeColumn.id);
        if (activeColumnIndex === -1) return prev;

        const activeItems = prev[activeColumnIndex].objects;
        const oldIndex = activeItems.findIndex(item => item.id === active.id);
        const newIndex = activeItems.findIndex(item => item.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const newCols = [...prev];
          newCols[activeColumnIndex] = {
            ...newCols[activeColumnIndex],
            objects: arrayMove(activeItems, oldIndex, newIndex),
          };
          return newCols;
        }
        return prev;
      });
    }
  };

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;

    console.log("[KanbanBoard] handleDragEnd triggered. Active:", active, "Over:", over);

    if (!over) {
      console.warn("[KanbanBoard] handleDragEnd: No 'over' target.");
      return;
    }

    const activeObjectId = String(active.id);
    const originalColumn = findColumn(activeObjectId);

    if (!originalColumn) {
      console.warn("[KanbanBoard] handleDragEnd: Could not find original column for active item:", activeObjectId);
      return;
    }
    console.log(`[KanbanBoard] handleDragEnd: Original column ID:`, originalColumn.id);


    let targetColumnId: string | null = null;

    // Priority 1: Check if 'over.id' is a direct column ID
    if (over.id && columns.some(col => col.id === over.id)) {
      targetColumnId = String(over.id);
      console.log(`[KanbanBoard] handleDragEnd: Target column ID from over.id (direct column drop):`, targetColumnId);
    } 
    // Priority 2: Check data from sortable context (often when dropping on an item or empty space in sortable)
    else if (over.data.current?.sortable?.containerId) {
      targetColumnId = String(over.data.current.sortable.containerId);
      console.log(`[KanbanBoard] handleDragEnd: Target column ID from over.data.current.sortable.containerId:`, targetColumnId);
    }
    // Fallback: If over.id is an object ID, find its parent column
    else {
      const columnContainingOverItem = findColumn(over.id);
      if (columnContainingOverItem) {
        targetColumnId = columnContainingOverItem.id;
        console.log(`[KanbanBoard] handleDragEnd: Target column ID by finding parent of over.id (item drop):`, targetColumnId);
      }
    }


    if (!targetColumnId) {
        console.warn(`[KanbanBoard] handleDragEnd: Target column not found for over.id: ${over.id}, over.data:`, JSON.stringify(over.data.current));
        return;
    }

    const targetColumn = columns.find(col => col.id === targetColumnId);

    if (!targetColumn) {
        console.warn("[KanbanBoard] handleDragEnd: Target column definition not found for ID:", targetColumnId);
        return;
    }
    console.log(`[KanbanBoard] handleDragEnd: Final Target column ID:`, targetColumn.id);


    if (originalColumn.id !== targetColumn.id) {
        console.log(`[KanbanBoard] handleDragEnd: Attempting to move object ${activeObjectId} from ${originalColumn.id} to ${targetColumn.id}`);
        setIsLoading(true);
        try {
          await onObjectUpdate(activeObjectId, targetColumn.id);
          console.log(`[KanbanBoard] handleDragEnd: onObjectUpdate completed for ${activeObjectId} to ${targetColumn.id}`);
        } catch (error) {
            console.error("[KanbanBoard] handleDragEnd: Error during onObjectUpdate:", error);
        } finally {
            setIsLoading(false);
        }
    } else {
      // Handle reordering within the same column
      const columnIndex = columns.findIndex(col => col.id === originalColumn.id);
      if (columnIndex !== -1) {
        const itemsInColumn = columns[columnIndex].objects;
        const oldIndex = itemsInColumn.findIndex(item => item.id === active.id);

        let newIndex;
        if (over.id === originalColumn.id) { 
            newIndex = itemsInColumn.length -1; // Move to end if dropped on column itself
        } else { 
            newIndex = itemsInColumn.findIndex(item => item.id === over.id);
        }

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          console.log(`[KanbanBoard] handleDragEnd: Reordering object ${activeObjectId} within column ${originalColumn.id} from index ${oldIndex} to ${newIndex}`);
          setColumns(prev => {
            const newCols = [...prev];
            newCols[columnIndex] = {
              ...newCols[columnIndex],
              objects: arrayMove(itemsInColumn, oldIndex, newIndex),
            };
            return newCols;
          });
        } else {
            console.log(`[KanbanBoard] handleDragEnd: No reorder needed within column ${originalColumn.id}. Old index: ${oldIndex}, New index: ${newIndex}`);
        }
      }
    }
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
        measuring={{ droppable: { strategy: MeasuringStrategy.Always }}}
    >
      <ScrollArea className="w-full rounded-md border">
        <div className="flex gap-4 p-4 min-h-[calc(100vh-20rem)]">
          {columns.map(column => (
            <Card key={column.id} /* Removed id={column.id} from here */ className="w-80 flex-shrink-0 h-full flex flex-col bg-muted/50">
              <CardHeader className="p-3 border-b sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                <CardTitle className="text-base flex justify-between items-center">
                  {column.title}
                  <Badge variant="secondary">{column.objects.length}</Badge>
                </CardTitle>
              </CardHeader>
              <SortableContext id={column.id} items={column.objects.map(obj => obj.id)} strategy={verticalListSortingStrategy}>
                <ScrollArea className="flex-grow">
                   <CardContent className="p-3 space-y-2 min-h-[150px]">
                    {column.objects.length > 0 ? column.objects.map(object => (
                      <SortableKanbanItem
                        key={object.id}
                        id={object.id}
                        object={object}
                        model={model}
                        allModels={allModels}
                        allObjects={allObjects}
                        onViewObject={onViewObject}
                      />
                    )) : (
                        <div className="text-center text-sm text-muted-foreground py-10 h-full flex items-center justify-center">
                            No items in this state.
                        </div>
                    )}
                  </CardContent>
                </ScrollArea>
              </SortableContext>
            </Card>
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

