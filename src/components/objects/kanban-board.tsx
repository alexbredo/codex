
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
        const aName = String(a.id || ''); // Fallback to ID if name-like props are missing
        const bName = String(b.id || '');
        return aName.localeCompare(bName);
      })
    }));
    setColumns(newColumns);
  }, [workflow, objects]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10, // Users have to drag an item by 10 pixels before a drag event is triggered
      },
    })
  );
  
  const findColumn = (id: UniqueIdentifier | undefined | null): KanbanColumn | null => {
    if (!id) return null;
    // Check if the id is a column id itself
    const columnById = columns.find(col => col.id === id);
    if (columnById) return columnById;

    // If not, check if it's an object id within a column
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
    // No optimistic updates for now to simplify debugging inter-column drags.
    // The DragOverlay will provide visual feedback.
    // The item will "snap" after handleDragEnd completes and data is refetched.
  };
  
  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;

    if (!over) {
      return;
    }

    const activeObjectId = String(active.id);
    const originalColumn = findColumn(activeObjectId); // Original column of the dragged item

    if (!originalColumn) {
      console.warn("DragEnd: Could not find original column for active item:", activeObjectId);
      return;
    }

    // Determine target column
    let targetColumnId: string | null = null;
    // Case 1: Dropped directly onto a column Card (which is a droppable target)
    if (columns.some(col => col.id === over.id)) { // over.id is a column id
        targetColumnId = String(over.id);
    } 
    // Case 2: Dropped onto an item within a column (SortableKanbanItem) or empty space in a sortable container
    // The containerId of the sortable item/context is the column's ID.
    else if (over.data.current?.sortable?.containerId) {
        targetColumnId = String(over.data.current.sortable.containerId);
    } 
    // Case 3: Fallback - if 'over.id' is an item id but not caught by sortable.containerId
    // This case might be less common if items are always within a sortable context that provides containerId.
    else {
        const columnContainingOverItem = findColumn(over.id);
        if (columnContainingOverItem) {
            targetColumnId = columnContainingOverItem.id;
        }
    }

    if (!targetColumnId) {
        console.warn("DragEnd: Could not determine target column ID from 'over' object:", over);
        return;
    }
    
    const targetColumn = columns.find(col => col.id === targetColumnId);

    if (!targetColumn) {
        console.warn("DragEnd: Target column not found for ID:", targetColumnId);
        return;
    }
    
    // Logic for handling the drop
    if (originalColumn.id !== targetColumn.id) {
        // Item moved to a different column (state change)
        setIsLoading(true);
        try {
          await onObjectUpdate(activeObjectId, targetColumn.id);
          // Parent component (DataObjectsPage) is responsible for calling fetchData 
          // via its onObjectUpdate -> updateObject (in context) chain.
          // The KanbanBoard will re-render when its 'objects' prop changes.
        } catch (error) {
            console.error("Error during onObjectUpdate in handleDragEnd:", error);
            // Parent should also handle reverting or re-fetching on error.
        } finally {
            setIsLoading(false);
        }
    } else {
      // Item moved within the same column - update local visual order
      const columnIndex = columns.findIndex(col => col.id === originalColumn.id);
      if (columnIndex !== -1) {
        const itemsInColumn = columns[columnIndex].objects;
        const oldIndex = itemsInColumn.findIndex(item => item.id === active.id);
        
        let newIndex;
        // If 'over.id' is the column id itself, it means item was dropped in empty space of column
        if (over.id === originalColumn.id) {
            newIndex = itemsInColumn.length - 1; // Place at the end of the column
        } else { // Dropped onto another item in the same column
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
        <div className="flex gap-4 p-4 min-h-[calc(100vh-20rem)]"> {/* Ensure columns have space */}
          {columns.map(column => (
            <Card key={column.id} id={column.id} className="w-80 flex-shrink-0 h-full flex flex-col bg-muted/50">
              <CardHeader className="p-3 border-b sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                <CardTitle className="text-base flex justify-between items-center">
                  {column.title}
                  <Badge variant="secondary">{column.objects.length}</Badge>
                </CardTitle>
              </CardHeader>
              <SortableContext items={column.objects.map(obj => obj.id)} strategy={verticalListSortingStrategy}>
                <ScrollArea className="flex-grow"> {/* Allow columns to scroll internally */}
                   <CardContent className="p-3 space-y-2 min-h-[150px]"> {/* min-h for drop target visibility */}
                    {column.objects.length > 0 ? column.objects.map(object => (
                      <SortableKanbanItem
                        key={object.id}
                        id={object.id} // This ID is used by dnd-kit
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
            className="ring-2 ring-primary shadow-xl opacity-100 cursor-grabbing"
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

