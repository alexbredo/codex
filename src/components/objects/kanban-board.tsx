
'use client';

import * as React from 'react';
import type { DataObject, Model, WorkflowWithDetails, WorkflowStateWithSuccessors } from '@/lib/types';
import { DndContext, closestCorners, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent, type DragOverEvent, DragOverlay, type UniqueIdentifier, rectIntersection } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { SortableKanbanItem, KanbanCard, DroppablePlaceholder } from './kanban-card';
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
  onEditObject: (object: DataObject) => void;
  onDeleteObject: (objectId: string) => void;
}

interface KanbanColumn {
  id: string; // state.id
  title: string; // state.name
  color?: string | null; // state.color
  objects: DataObject[];
}

export default function KanbanBoard({ model, workflow, objects, allModels, allObjects, onObjectUpdate, onViewObject, onEditObject, onDeleteObject }: KanbanBoardProps) {
  const [activeId, setActiveId] = React.useState<UniqueIdentifier | null>(null);
  const [columns, setColumns] = React.useState<KanbanColumn[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  const [tentativeOverColumnId, setTentativeOverColumnId] = React.useState<string | null>(null);
  const [activeItemOriginalColumnId, setActiveItemOriginalColumnId] = React.useState<string | null>(null);


  React.useEffect(() => {
    const orderedWorkflowStates = workflow.states; // Already sorted by orderIndex

    const newColumns = orderedWorkflowStates.map(state => ({
      id: state.id,
      title: state.name,
      color: state.color ?? null,
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

  const findColumnById = React.useCallback((columnId: UniqueIdentifier | undefined | null): KanbanColumn | null => {
    if (!columnId) return null;
    return columns.find(col => col.id === String(columnId)) || null;
  }, [columns]);

  const findColumnByObjectId = React.useCallback((objectId: UniqueIdentifier | undefined | null): KanbanColumn | null => {
    if (!objectId) return null;
    return columns.find(col => col.objects.some(obj => obj.id === String(objectId))) || null;
  }, [columns]);

  const findObjectById = React.useCallback((id: UniqueIdentifier | undefined | null): DataObject | null => {
     if (!id) return null;
     for (const col of columns) {
        const obj = col.objects.find(o => o.id === String(id));
        if (obj) return obj;
     }
     return null;
  }, [columns]);

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
    const originalCol = findColumnByObjectId(event.active.id);
    setActiveItemOriginalColumnId(originalCol ? originalCol.id : null);
    setTentativeOverColumnId(null);
  };

 const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    const originalColId = activeItemOriginalColumnId;

    if (!over || !active?.id || !originalColId) {
      return;
    }

    let potentialTargetColumnId: string | null = null;
    const overId = String(over.id);

    if (findColumnById(overId)) {
      potentialTargetColumnId = overId;
    }
    else if (over.data.current?.sortable?.containerId && findColumnById(String(over.data.current.sortable.containerId))) {
      potentialTargetColumnId = String(over.data.current.sortable.containerId);
    }
    else {
      const parentColOfOverItem = findColumnByObjectId(overId);
      if (parentColOfOverItem) {
        potentialTargetColumnId = parentColOfOverItem.id;
      }
    }

    if (potentialTargetColumnId && potentialTargetColumnId !== originalColId) {
      if (tentativeOverColumnId !== potentialTargetColumnId) {
        setTentativeOverColumnId(potentialTargetColumnId);
      }
    } else if (potentialTargetColumnId && potentialTargetColumnId === originalColId) {
      if (tentativeOverColumnId !== null) {
        setTentativeOverColumnId(null);
      }
    } else if (!potentialTargetColumnId && tentativeOverColumnId !== null) {
        setTentativeOverColumnId(null);
    }
  };


  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const originalColumnId = activeItemOriginalColumnId;

    if (!active?.id) {
      setActiveId(null); setTentativeOverColumnId(null); setActiveItemOriginalColumnId(null); return;
    }
    if (!originalColumnId) {
      setActiveId(null); setTentativeOverColumnId(null); setActiveItemOriginalColumnId(null); return;
    }

    let targetColumnId: string | null = null;

    if (tentativeOverColumnId && tentativeOverColumnId !== originalColumnId) {
      targetColumnId = tentativeOverColumnId;
    } else if (over) {
      const overId = String(over.id);
      if (findColumnById(overId)) {
        targetColumnId = overId;
      }
      else if (over.data.current?.sortable?.containerId && findColumnById(String(over.data.current.sortable.containerId))) {
        targetColumnId = String(over.data.current.sortable.containerId);
      }
      else {
        const columnContainingOverItem = findColumnByObjectId(overId);
        if (columnContainingOverItem) {
          targetColumnId = columnContainingOverItem.id;
        }
      }
    }

    if (!targetColumnId) {
      setActiveId(null); setTentativeOverColumnId(null); setActiveItemOriginalColumnId(null); return;
    }

    const targetColumnDef = columns.find(col => col.id === targetColumnId);
    if (!targetColumnDef) {
      setActiveId(null); setTentativeOverColumnId(null); setActiveItemOriginalColumnId(null); return;
    }

    const activeObjectId = String(active.id);

    if (originalColumnId !== targetColumnDef.id) {
      setIsLoading(true);
      try {
        await onObjectUpdate(activeObjectId, targetColumnDef.id);
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
          setColumns(prev => {
            const newCols = [...prev];
            newCols[columnIndex] = { ...newCols[columnIndex], objects: arrayMove(itemsInColumn, oldIndex, newIndex) };
            return newCols;
          });
        }
      }
    }
    setActiveId(null); setTentativeOverColumnId(null); setActiveItemOriginalColumnId(null);
  }

  const activeObject = activeId ? findObjectById(activeId) : null;
  const activeState = activeObject ? workflow.states.find(s => s.id === activeObject.currentStateId) : null;
  const activeStateColor = activeState?.color;


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
            <Card key={column.id} className="w-80 flex-shrink-0 h-full flex flex-col bg-muted/50 relative">
              {/* Column color bar removed */}
              <CardHeader className={cn("p-3 border-b sticky top-0 bg-muted/80 backdrop-blur-sm z-10")}>
                <CardTitle className="text-base flex justify-between items-center">
                  {column.title}
                  <Badge variant="secondary">{column.objects.length}</Badge>
                </CardTitle>
              </CardHeader>
              <SortableContext id={column.id} items={column.objects.map(obj => obj.id)} strategy={verticalListSortingStrategy}>
                <CardContent className={cn("p-3 flex-grow overflow-y-auto min-h-[200px] flex flex-col")}>
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
                        onEditObject={onEditObject}
                        onDeleteObject={onDeleteObject}
                        workflowStates={workflow.states}
                      />
                    ))
                  ) : (
                     <DroppablePlaceholder id={column.id} />
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
            onEditObject={() => {}}
            onDeleteObject={() => {}}
            stateColor={activeStateColor} 
            className="ring-2 ring-primary shadow-xl opacity-100 cursor-grabbing"
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
