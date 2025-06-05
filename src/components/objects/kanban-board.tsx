
'use client';

import * as React from 'react';
import type { DataObject, Model, WorkflowWithDetails, WorkflowStateWithSuccessors } from '@/lib/types';
import { DndContext, closestCorners, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent, type DragOverEvent, DragOverlay, type UniqueIdentifier } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableKanbanItem, KanbanCard, DroppablePlaceholder } from './kanban-card'; // Added DroppablePlaceholder
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
  
  // tentativeOverColumnId stores the ID of the column an item is currently being dragged over,
  // but only if it's different from the item's original column.
  const [tentativeOverColumnId, setTentativeOverColumnId] = React.useState<string | null>(null);
  // activeItemOriginalColumnId stores the ID of the column where the drag started.
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
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  
  const findColumnById = (columnId: UniqueIdentifier | undefined | null): KanbanColumn | null => {
    if (!columnId) return null;
    return columns.find(col => col.id === columnId) || null;
  };

  const findColumnByObjectId = (objectId: UniqueIdentifier | undefined | null): KanbanColumn | null => {
    if (!objectId) return null;
    return columns.find(col => col.objects.some(obj => obj.id === objectId)) || null;
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
    const originalCol = findColumnByObjectId(event.active.id);
    setActiveItemOriginalColumnId(originalCol ? originalCol.id : null);
    setTentativeOverColumnId(null); 
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !active?.id || !activeItemOriginalColumnId) {
      console.log("[KanbanBoard] handleDragOver: Bailing early - no over, active.id, or originalColId.");
      return;
    }

    console.log(`[KanbanBoard] handleDragOver RAW: event.over.id = ${over.id}`);
    if (over.data.current?.sortable?.containerId) {
      console.log(`[KanbanBoard] handleDragOver RAW: event.over.data.current.sortable.containerId = ${over.data.current.sortable.containerId}`);
    } else if (over.data.current?.isPlaceholder) {
       console.log(`[KanbanBoard] handleDragOver RAW: event.over.data.current.isPlaceholder = true, columnId = ${over.data.current.columnId}`);
    } else {
      console.log("[KanbanBoard] handleDragOver RAW: event.over has no sortable.containerId or placeholder data.");
    }
    
    let potentialTargetColumnId: string | null = null;
    const overId = String(over.id);

    // Check if 'over' is a column itself (either SortableContext or DroppablePlaceholder, both use column.id)
    if (findColumnById(overId)) {
      potentialTargetColumnId = overId;
       console.log(`[KanbanBoard] handleDragOver: Derived potentialTargetColumnId = ${potentialTargetColumnId} (from over.id being a column ID directly)`);
    } 
    // Check if 'over' is an item and get its container (column) ID
    else if (over.data.current?.sortable?.containerId && findColumnById(String(over.data.current.sortable.containerId))) {
      potentialTargetColumnId = String(over.data.current.sortable.containerId);
      console.log(`[KanbanBoard] handleDragOver: Derived potentialTargetColumnId = ${potentialTargetColumnId} (from over.data.current.sortable.containerId)`);
    } 
    // Fallback if 'over' is an item but containerId wasn't directly found (should be less common)
    else {
      const parentColOfOverItem = findColumnByObjectId(overId);
      if (parentColOfOverItem) {
        potentialTargetColumnId = parentColOfOverItem.id;
        console.log(`[KanbanBoard] handleDragOver: Derived potentialTargetColumnId = ${potentialTargetColumnId} (from parentCol of item ${overId})`);
      }
    }

    if (potentialTargetColumnId && potentialTargetColumnId !== activeItemOriginalColumnId) {
      // Item is over a NEW column
      if (tentativeOverColumnId !== potentialTargetColumnId) {
        setTentativeOverColumnId(potentialTargetColumnId);
        console.log(`[KanbanBoard] handleDragOver: Tentative target column updated to: ${potentialTargetColumnId} (was ${tentativeOverColumnId || 'null'}). Original active column: ${activeItemOriginalColumnId}`);
      }
    } else if (potentialTargetColumnId && potentialTargetColumnId === activeItemOriginalColumnId) {
      // Item is dragged back over its original column
      if (tentativeOverColumnId !== null) { // Only reset if it was previously over a *new* column
        setTentativeOverColumnId(null);
        console.log(`[KanbanBoard] handleDragOver: Dragged back to original column ${activeItemOriginalColumnId}. Clearing tentativeOverColumnId (was ${tentativeOverColumnId}).`);
      }
    } else if (!potentialTargetColumnId && tentativeOverColumnId !== null) {
        // Item is dragged over something not a column (e.g. outside board), clear tentative
        setTentativeOverColumnId(null);
        console.log(`[KanbanBoard] handleDragOver: Dragged over no valid column. Clearing tentativeOverColumnId (was ${tentativeOverColumnId}).`);
    }
  };


  async function handleDragEnd(event: DragEndEvent) {
    console.log("[KanbanBoard] handleDragEnd triggered. Active:", event.active, "Over:", event.over);
    const { active, over } = event;
    
    const originalColumnId = activeItemOriginalColumnId;

    if (!active?.id) {
      console.warn("[KanbanBoard] handleDragEnd: No 'active' item.");
      setActiveId(null); setTentativeOverColumnId(null); setActiveItemOriginalColumnId(null); return;
    }
    if (!originalColumnId) {
      console.warn("[KanbanBoard] handleDragEnd: Could not determine original column for active item:", active.id);
      setActiveId(null); setTentativeOverColumnId(null); setActiveItemOriginalColumnId(null); return;
    }
    console.log(`[KanbanBoard] handleDragEnd: Original column ID: ${originalColumnId}`);
    console.log(`[KanbanBoard] handleDragEnd: Tentative target from onDragOver: ${tentativeOverColumnId}`);

    let targetColumnId: string | null = null;

    // Prioritize tentativeOverColumnId if it's set and represents a move to a NEW column
    if (tentativeOverColumnId && tentativeOverColumnId !== originalColumnId) {
      targetColumnId = tentativeOverColumnId;
      console.log(`[KanbanBoard] handleDragEnd: Using tentativeOverColumnId (a NEW column) as target: ${targetColumnId}`);
    } else if (over) { // Fallback to 'over' from onDragEnd if no clear new tentative target
      const overId = String(over.id);
      if (findColumnById(overId)) { // Check if over.id is a SortableContext (column) ID or DroppablePlaceholder ID
        targetColumnId = overId;
        console.log(`[KanbanBoard] handleDragEnd: Target column ID from over.id (column/placeholder): ${targetColumnId}`);
      } else if (over.data.current?.sortable?.containerId && findColumnById(String(over.data.current.sortable.containerId))) {
        targetColumnId = String(over.data.current.sortable.containerId);
        console.log(`[KanbanBoard] handleDragEnd: Target column ID from over.data.current.sortable.containerId: ${targetColumnId}`);
      } else {
        const columnContainingOverItem = findColumnByObjectId(overId);
        if (columnContainingOverItem) {
          targetColumnId = columnContainingOverItem.id;
          console.log(`[KanbanBoard] handleDragEnd: Target column ID by finding parent of over.id: ${targetColumnId}`);
        }
      }
    }

    if (!targetColumnId) {
      console.warn(`[KanbanBoard] handleDragEnd: Final target column could not be determined. Tentative: ${tentativeOverColumnId}, Over.id: ${over?.id}, Over.data:`, JSON.stringify(over?.data.current));
      setActiveId(null); setTentativeOverColumnId(null); setActiveItemOriginalColumnId(null); return;
    }
    console.log(`[KanbanBoard] handleDragEnd: Final Target column ID: ${targetColumnId}`);
    
    const targetColumnDef = columns.find(col => col.id === targetColumnId);
    if (!targetColumnDef) {
      console.warn("[KanbanBoard] handleDragEnd: Target column definition not found for ID:", targetColumnId);
      setActiveId(null); setTentativeOverColumnId(null); setActiveItemOriginalColumnId(null); return;
    }
    
    const activeObjectId = String(active.id);

    if (originalColumnId !== targetColumnDef.id) {
      console.log(`[KanbanBoard] handleDragEnd: Attempting to move object ${activeObjectId} from ${originalColumnId} to ${targetColumnDef.id}`);
      setIsLoading(true);
      try {
        await onObjectUpdate(activeObjectId, targetColumnDef.id);
        console.log(`[KanbanBoard] handleDragEnd: onObjectUpdate completed for ${activeObjectId} to ${targetColumnDef.id}`);
      } catch (error) {
        console.error("[KanbanBoard] handleDragEnd: Error during onObjectUpdate:", error);
      } finally {
        setIsLoading(false);
      }
    } else if (over) { 
      const columnIndex = columns.findIndex(col => col.id === originalColumnId);
      if (columnIndex !== -1) {
        const itemsInColumn = columns[columnIndex].objects;
        const oldIndex = itemsInColumn.findIndex(item => item.id === active.id);
        
        let newIndex = -1;
        if (over.id === originalColumnId || (over.data.current?.isPlaceholder && over.data.current?.columnId === originalColumnId)) {
            newIndex = itemsInColumn.length -1; 
        } else {
            newIndex = itemsInColumn.findIndex(item => item.id === over.id);
        }

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          console.log(`[KanbanBoard] handleDragEnd: Reordering object ${activeObjectId} within column ${originalColumnId} from index ${oldIndex} to ${newIndex}`);
          setColumns(prev => {
            const newCols = [...prev];
            newCols[columnIndex] = { ...newCols[columnIndex], objects: arrayMove(itemsInColumn, oldIndex, newIndex) };
            return newCols;
          });
        } else {
          console.log(`[KanbanBoard] handleDragEnd: No reorder needed within column ${originalColumnId}. Old index: ${oldIndex}, New index: ${newIndex}`);
        }
      }
    } else {
       console.log(`[KanbanBoard] handleDragEnd: Dropped back into the same column '${originalColumnId}', but 'over' target was null or invalid for reorder. No action taken.`);
    }
    setActiveId(null); setTentativeOverColumnId(null); setActiveItemOriginalColumnId(null);
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
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
    >
      <ScrollArea className="w-full rounded-md border">
        <div className="flex gap-4 p-4 min-h-[calc(100vh-20rem)]">
          {columns.map(column => (
            <Card key={column.id} className="w-80 flex-shrink-0 h-full flex flex-col bg-muted/50">
              <CardHeader className="p-3 border-b sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                <CardTitle className="text-base flex justify-between items-center">
                  {column.title}
                  <Badge variant="secondary">{column.objects.length}</Badge>
                </CardTitle>
              </CardHeader>
              <SortableContext id={column.id} items={column.objects.map(obj => obj.id)} strategy={verticalListSortingStrategy}>
                <CardContent className={cn("p-3 flex-grow overflow-y-auto min-h-[200px]", "flex flex-col")}>
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
                    <DroppablePlaceholder id={column.id} /> // Use column.id for the placeholder
                  )}
                </CardContent>
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
