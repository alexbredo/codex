
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
    const columnById = columns.find(col => col.id === id);
    if (columnById) return columnById;
    for (const col of columns) {
        if (col.objects.some(obj => obj.id === id)) {
            return col;
        }
    }
    return null;
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
    if (!over || !activeId || active.id === over.id) return;

    const activeContainerId = active.data.current?.sortable?.containerId || findColumn(active.id)?.id;
    
    let overContainerId = over.data.current?.sortable?.containerId;
    if (!overContainerId) { // If 'over' is a column directly
        if (columns.find(col => col.id === over.id)) {
            overContainerId = String(over.id);
        }
    }
    
    // Only handle optimistic reordering within the same column.
    // Cross-column moves will be finalized in onDragEnd.
    if (activeContainerId && overContainerId && activeContainerId === overContainerId) {
      if (active.id !== over.id) { 
        setColumns(prev => {
          const columnIndex = prev.findIndex(c => c.id === activeContainerId);
          if (columnIndex === -1) return prev;

          const itemsInColumn = prev[columnIndex].objects;
          const oldIndex = itemsInColumn.findIndex(item => item.id === active.id);
          
          // Determine if 'over.id' is an item or the column itself (for dropping at the end)
          let newIndex = itemsInColumn.findIndex(item => item.id === over.id);
          if (newIndex === -1 && over.id === activeContainerId) { // Dropped onto column, not an item
            newIndex = itemsInColumn.length -1; // Effectively adding to end, but needs careful index for arrayMove
          }


          if (oldIndex !== -1 && newIndex !== -1) {
            // If dropping onto the column (not an item), newIndex might need adjustment for arrayMove
            // For simplicity, if over.id is the column id, we just ensure oldIndex !== newIndex
            // More precise logic would be needed if we want to allow dropping between items in an empty space of the same column
            const reorderedItems = arrayMove(itemsInColumn, oldIndex, newIndex);
            const newColumns = [...prev];
            newColumns[columnIndex] = { ...newColumns[columnIndex], objects: reorderedItems };
            return newColumns;
          }
          return prev;
        });
      }
    }
  };
  
  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;

    if (!over) return;

    const activeObjectId = String(active.id);
    const originalColumn = findColumn(activeObjectId);
    
    let targetColumn: KanbanColumn | null = null;
    if (columns.find(col => col.id === over.id)) { // 'over' is a column ID
        targetColumn = columns.find(col => col.id === over.id) || null;
    } else { // 'over' is an item ID, find its column
        targetColumn = findColumn(over.id);
    }

    if (!originalColumn || !targetColumn) {
      console.warn("Could not determine original or target column for drag end. Active:", active.id, "Over:", over.id);
      return;
    }
    
    if (originalColumn.id !== targetColumn.id) {
        setIsLoading(true);
        try {
          await onObjectUpdate(activeObjectId, targetColumn.id);
        } catch (error) {
            console.error("Error during onObjectUpdate in handleDragEnd:", error);
        } finally {
            setIsLoading(false);
        }
    } else {
      // Item moved within the same column - update local visual order
      const columnIndex = columns.findIndex(col => col.id === originalColumn.id);
      if (columnIndex !== -1) {
        const itemsInColumn = columns[columnIndex].objects;
        const oldIndex = itemsInColumn.findIndex(item => item.id === active.id);
        
        // Check if `over.id` is the column itself (meaning dropped into empty space or end of column)
        let newIndex;
        if (over.id === originalColumn.id) {
            newIndex = itemsInColumn.length -1; // Move to the end
        } else {
            newIndex = itemsInColumn.findIndex(item => item.id === over.id);
        }

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
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
    >
      <ScrollArea className="w-full rounded-md border">
        <div className="flex gap-4 p-4 min-h-[calc(100vh-20rem)]">
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

