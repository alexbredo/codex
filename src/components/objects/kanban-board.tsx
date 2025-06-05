
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
    useSensor(PointerSensor)
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
    setTentativeOverColumnId(null); // Reset tentative target on new drag start
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over) {
      setTentativeOverColumnId(null);
      return;
    }

    let potentialTargetColumnId: string | null = null;

    // Is 'over.id' a direct column ID?
    if (columns.some(col => col.id === over.id)) {
        potentialTargetColumnId = String(over.id);
    } 
    // Is 'over.data.current.sortable.containerId' a column ID? (item dropped into another item's sortable context)
    else if (over.data.current?.sortable?.containerId && columns.some(col => col.id === over.data.current.sortable.containerId)) {
        potentialTargetColumnId = String(over.data.current.sortable.containerId);
    } 
    // Fallback: if over.id is an item, find its column
    else {
        const columnContainingOverItem = findColumn(over.id);
        if (columnContainingOverItem) {
            potentialTargetColumnId = columnContainingOverItem.id;
        }
    }
    
    if (potentialTargetColumnId && potentialTargetColumnId !== tentativeOverColumnId) {
      console.log(`[KanbanBoard] handleDragOver: Tentative target column updated to: ${potentialTargetColumnId} (was ${tentativeOverColumnId})`);
      setTentativeOverColumnId(potentialTargetColumnId);
    } else if (!potentialTargetColumnId && tentativeOverColumnId !== null) {
      // Dragged out of any known column area
      setTentativeOverColumnId(null);
    }
  };


  async function handleDragEnd(event: DragEndEvent) {
    console.log("[KanbanBoard] handleDragEnd triggered. Active:", event.active, "Over:", event.over);
    setActiveId(null);
    const { active, over } = event;

    if (!over && !tentativeOverColumnId) { // Check tentativeOverColumnId as well
      console.warn("[KanbanBoard] handleDragEnd: No 'over' target and no tentative target from onDragOver.");
      setTentativeOverColumnId(null);
      return;
    }

    const activeObjectId = String(active.id);
    let originalColumnId = active.data.current?.sortable?.containerId;
    
    if (!originalColumnId) {
        const foundOriginalColumn = findColumn(activeObjectId);
        if (foundOriginalColumn) {
            originalColumnId = foundOriginalColumn.id;
        }
    }

    if (!originalColumnId) {
      console.warn("[KanbanBoard] handleDragEnd: Could not determine original column for active item:", activeObjectId, "Active Data:", JSON.stringify(active.data.current));
      setTentativeOverColumnId(null); // Reset tentative target
      return;
    }
    console.log(`[KanbanBoard] handleDragEnd: Original column ID: ${originalColumnId}`);

    // Determine targetColumnId using tentativeOverColumnId first, then fallback to 'over' object analysis
    let targetColumnId: string | null = tentativeOverColumnId;
    console.log(`[KanbanBoard] handleDragEnd: Tentative target from onDragOver: ${tentativeOverColumnId}`);

    if (!targetColumnId && over) { // Fallback if tentativeOverColumnId is null (e.g., drag ended very quickly)
        console.log("[KanbanBoard] handleDragEnd: Tentative target was null, determining from 'over' object.");
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
    }
    
    if (!targetColumnId) {
        console.warn(`[KanbanBoard] handleDragEnd: Final target column could not be determined. Over.id: ${over?.id}, Over.data:`, JSON.stringify(over?.data.current));
        setTentativeOverColumnId(null); // Reset tentative target
        return;
    }
    
    const targetColumn = columns.find(col => col.id === targetColumnId); 
    
    if (!targetColumn) {
        console.warn("[KanbanBoard] handleDragEnd: Target column definition not found for ID:", targetColumnId);
        setTentativeOverColumnId(null);
        return;
    }
    console.log(`[KanbanBoard] handleDragEnd: Final Target column ID: ${targetColumn.id}`);


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
    } else {
      const columnIndex = columns.findIndex(col => col.id === originalColumnId);
      if (columnIndex !== -1 && over) { // Ensure 'over' is not null for reordering
        const itemsInColumn = columns[columnIndex].objects;
        const oldIndex = itemsInColumn.findIndex(item => item.id === active.id);
        
        let newIndex = -1;
        if (over.id === originalColumnId || !itemsInColumn.some(item => item.id === over.id)) { 
            newIndex = itemsInColumn.length -1;
        } else { 
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
    }
    setTentativeOverColumnId(null); // Reset after handling drag end
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
                    "flex flex-col" // Ensure CardContent can grow
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
                    // Make sure this div takes up space and is part of the droppable area
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

    
