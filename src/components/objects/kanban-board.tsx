
'use client';

import * as React from 'react';
import type { DataObject, Model, WorkflowWithDetails } from '@/lib/types';
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
  const [isLoading, setIsLoading] = React.useState(false); // For optimistic updates

  React.useEffect(() => {
    const initialStates = workflow.states.filter(s => s.isInitial);
    const otherStates = workflow.states.filter(s => !s.isInitial).sort((a, b) => a.name.localeCompare(b.name)); // Basic sort
    const orderedWorkflowStates = [...initialStates, ...otherStates];

    const newColumns = orderedWorkflowStates.map(state => ({
      id: state.id,
      title: state.name,
      objects: objects.filter(obj => obj.currentStateId === state.id).sort((a,b) => {
        // Simple sort by ID within columns, can be replaced with more sophisticated logic
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
        distance: 10, // Pixels
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
    const { active, over } = event;
    if (!over || !activeId) return;

    const activeContainerId = active.data.current?.sortable?.containerId || findColumn(active.id)?.id;
    let overContainerId = over.data.current?.sortable?.containerId;
    if (!overContainerId) { // If over a column directly (empty space)
        if (columns.find(col => col.id === over.id)) {
            overContainerId = over.id;
        }
    }

    if (!activeContainerId || !overContainerId || activeContainerId === overContainerId) {
      return;
    }

    setColumns(prev => {
      const activeColumnIndex = prev.findIndex(c => c.id === activeContainerId);
      const overColumnIndex = prev.findIndex(c => c.id === overContainerId);

      if (activeColumnIndex === -1 || overColumnIndex === -1) return prev;

      const activeItems = prev[activeColumnIndex].objects;
      const overItems = prev[overColumnIndex].objects;
      
      const activeItemIndex = activeItems.findIndex(item => item.id === active.id);
      const itemToMove = activeItems[activeItemIndex];

      if (!itemToMove) return prev;

      const newColumns = [...prev];
      newColumns[activeColumnIndex] = {
        ...newColumns[activeColumnIndex],
        objects: activeItems.filter(item => item.id !== active.id),
      };
      
      // Determine where to insert in the 'over' column
      let newIndexInOverColumn;
      const overItemIndex = overItems.findIndex(item => item.id === over.id);
      if (overItemIndex !== -1) {
        newIndexInOverColumn = overItemIndex;
      } else {
        newIndexInOverColumn = overItems.length; // Add to the end if not over a specific item
      }
      
      const updatedOverItems = [...overItems];
      updatedOverItems.splice(newIndexInOverColumn, 0, itemToMove);

      newColumns[overColumnIndex] = {
        ...newColumns[overColumnIndex],
        objects: updatedOverItems,
      };
      return newColumns;
    });
  };
  
  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;

    if (!over) return;

    const activeObjectId = String(active.id);
    
    const originalColumnId = active.data.current?.sortable?.containerId || findColumn(activeObjectId)?.id;
    let targetColumnId = over.data.current?.sortable?.containerId;
    if (!targetColumnId) { // If 'over' is a column directly
        if (columns.find(col => col.id === over.id)) {
            targetColumnId = over.id;
        }
    }

    if (!originalColumnId || !targetColumnId) {
      console.warn("Could not determine original or target column for drag end.");
      // Optionally refetch data to reset UI state if something went wrong with IDs
      // await onObjectUpdate(activeObjectId, originalColumnId || ''); // This would be a revert
      return;
    }
    
    if (originalColumnId !== targetColumnId) {
        setIsLoading(true); // For visual feedback during API call
        await onObjectUpdate(activeObjectId, String(targetColumnId));
        setIsLoading(false);
        // Data will be re-fetched by the page component's useEffect on 'objects' change via DataContext
    } else {
      // Item moved within the same column - reorder objects array for that column
      const columnIndex = columns.findIndex(col => col.id === originalColumnId);
      if (columnIndex !== -1) {
        const itemsInColumn = columns[columnIndex].objects;
        const oldIndex = itemsInColumn.findIndex(item => item.id === active.id);
        const newIndex = itemsInColumn.findIndex(item => item.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          setColumns(prev => {
            const newCols = [...prev];
            newCols[columnIndex] = {
              ...newCols[columnIndex],
              objects: arrayMove(itemsInColumn, oldIndex, newIndex),
            };
            return newCols;
          });
        }
      }
    }
  }
  
  const activeObject = activeId ? findObjectById(activeId) : null;

  if (!workflow.states || workflow.states.length === 0) {
    return <div className="p-4 text-center text-muted-foreground">This workflow has no states defined.</div>;
  }
  if (isLoading) { // Global loading state for API calls
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
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
    >
      <ScrollArea className="w-full rounded-md border">
        <div className="flex gap-4 p-4 min-h-[calc(100vh-20rem)]"> {/* Ensure droppable area has height */}
          {columns.map(column => (
            <Card key={column.id} id={column.id} className="w-80 flex-shrink-0 h-full flex flex-col bg-muted/50">
              <CardHeader className="p-3 border-b sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                <CardTitle className="text-base flex justify-between items-center">
                  {column.title}
                  <Badge variant="secondary">{column.objects.length}</Badge>
                </CardTitle>
              </CardHeader>
              <SortableContext items={column.objects.map(obj => obj.id)} strategy={verticalListSortingStrategy}>
                <ScrollArea className="flex-grow">
                   <CardContent className="p-3 space-y-2 min-h-[150px]"> {/* Min height for empty columns */}
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
            onViewObject={() => {}} // Dummy for overlay
            className="ring-2 ring-primary shadow-xl opacity-100 cursor-grabbing" // Make it look like it's being grabbed
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

