
'use client';

import type { DataObject, Model, Property } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, Edit, GripVertical, Trash2 } from 'lucide-react';
import { getObjectDisplayValue, cn } from '@/lib/utils';
import { useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import Image from 'next/image';
import { format as formatDateFns, isValid as isDateValid } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { StarDisplay } from '@/components/ui/star-display';
import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface KanbanCardProps {
  object: DataObject;
  model: Model;
  allModels: Model[];
  allObjects: Record<string, DataObject[]>;
  onViewObject: (object: DataObject) => void;
  onEditObject: (object: DataObject) => void;
  onDeleteObject: (objectId: string) => void; // Added onDeleteObject
  className?: string;
  dragHandleListeners?: ReturnType<typeof useSortable>['listeners'];
}

export function KanbanCard({
  object,
  model,
  allModels,
  allObjects,
  onViewObject,
  onEditObject,
  onDeleteObject, // Added onDeleteObject
  className,
  dragHandleListeners,
}: KanbanCardProps) {
  const displayName = getObjectDisplayValue(object, model, allModels, allObjects);

  let imageProp: Property | undefined = model.properties.find(p => p.type === 'image' && object[p.name]);
  let imageUrlFromProp: string | null = imageProp && object[imageProp.name] ? String(object[imageProp.name]) : null;

  if (!imageUrlFromProp) {
    const fallbackImageProp = model.properties.find(
      (p) => (p.name.toLowerCase().includes('image') ||
              p.name.toLowerCase().includes('picture') ||
              p.name.toLowerCase().includes('photo') ||
              p.name.toLowerCase().includes('url')) &&
              p.type === 'string' &&
              object[p.name] &&
              typeof object[p.name] === 'string' &&
              ((object[p.name] as string).startsWith('http') || (object[p.name] as string).startsWith('/uploads'))
    );
    if (fallbackImageProp && object[fallbackImageProp.name]) {
      imageUrlFromProp = object[fallbackImageProp.name] as string;
      imageProp = fallbackImageProp;
    }
  }

  const placeholderImageForError = `https://placehold.co/300x200.png`;
  const displayImage = imageUrlFromProp && (imageUrlFromProp.startsWith('http') || imageUrlFromProp.startsWith('/uploads'));
  const imageAltText = imageProp ? `${displayName} ${imageProp.name}` : `${displayName} image`;


  const propertiesToDisplay = model.properties
    .filter(p =>
      p.name.toLowerCase() !== 'name' &&
      p.name.toLowerCase() !== 'title' &&
      p.id !== imageProp?.id &&
      p.type !== 'markdown' &&
      !model.displayPropertyNames?.includes(p.name) &&
      object[p.name] !== null && object[p.name] !== undefined && String(object[p.name]).trim() !== ''
    )
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .slice(0, 3);

  const getCompactPropertyValue = (property: Property, value: any): React.ReactNode => {
    if (value === null || typeof value === 'undefined' || String(value).trim() === '') {
      return <span className="text-muted-foreground italic">N/A</span>;
    }
    switch (property.type) {
      case 'string':
        const strValue = String(value);
        return <span className="truncate" title={strValue}>{strValue.length > 25 ? strValue.substring(0, 22) + '...' : strValue}</span>;
      case 'number':
        const numValue = parseFloat(String(value));
        const precision = property.precision === undefined ? 0 : property.precision;
        const unitText = property.unit ? ` ${property.unit}` : '';
        return isNaN(numValue) ? <span className="text-muted-foreground italic">N/A</span> : <span>{numValue.toFixed(precision)}{unitText}</span>;
      case 'boolean':
        return value ? <Badge variant="default" className="text-xs px-1 py-0 bg-green-500 hover:bg-green-600">Yes</Badge> : <Badge variant="secondary" className="text-xs px-1 py-0">No</Badge>;
      case 'date':
        try {
          const date = new Date(value);
          return <span>{isDateValid(date) ? formatDateFns(date, 'PP') : String(value)}</span>;
        } catch { return <span>{String(value)}</span>; }
      case 'rating':
        return <StarDisplay rating={value as number} size="sm"/>;
      case 'relationship':
        if (!property.relatedModelId) return <span className="text-destructive text-xs">Config Err</span>;
        const relatedModelDef = allModels.find(m => m.id === property.relatedModelId);
        if (!relatedModelDef) return <span className="text-destructive text-xs">Model N/A</span>;

        if (property.relationshipType === 'many') {
            const ids = Array.isArray(value) ? value : [];
            if (ids.length === 0) return <span className="text-muted-foreground italic">None</span>;
            const firstRelatedObj = (allObjects[property.relatedModelId] || []).find(o => o.id === ids[0]);
            const firstDisplay = getObjectDisplayValue(firstRelatedObj, relatedModelDef, allModels, allObjects);
            return <Badge variant="outline" className="text-xs px-1 py-0" title={ids.map(id => getObjectDisplayValue((allObjects[property.relatedModelId!] || []).find(o => o.id === id), relatedModelDef, allModels, allObjects)).join(', ')}>{firstDisplay.substring(0,15) + '...'}{ids.length > 1 ? ` +${ids.length -1}` : ''}</Badge>;
        } else {
            const relatedObjSingle = (allObjects[property.relatedModelId] || []).find(o => o.id === value);
            const displayValSingle = getObjectDisplayValue(relatedObjSingle, relatedModelDef, allModels, allObjects);
             return <Badge variant="outline" className="text-xs px-1 py-0" title={displayValSingle}>{displayValSingle.substring(0,20) + (displayValSingle.length > 20 ? '...' : '')}</Badge>;
        }
      default:
        const defaultVal = String(value);
        return <span className="truncate" title={defaultVal}>{defaultVal.length > 25 ? defaultVal.substring(0, 22) + '...' : defaultVal}</span>;
    }
  };

  return (
    <Card className={cn("mb-2 shadow-md hover:shadow-lg transition-shadow break-inside-avoid-column flex flex-col", className)}>
      {displayImage && imageUrlFromProp && (
        <div className="aspect-video relative w-full bg-muted rounded-t-lg overflow-hidden">
          <Image
            src={imageUrlFromProp}
            alt={imageAltText}
            layout="fill"
            objectFit="cover"
            data-ai-hint={model.name.toLowerCase()}
             onError={(e) => { (e.target as HTMLImageElement).src = placeholderImageForError; (e.target as HTMLImageElement).dataset.aiHint = 'placeholder image'; }}
          />
        </div>
      )}
      <CardHeader
        className={cn(
          "p-3 flex flex-row items-center justify-between",
          (displayImage && imageUrlFromProp) ? "pt-2" : "",
          dragHandleListeners && "cursor-grab"
        )}
        {...(dragHandleListeners || {})}
      >
        <CardTitle className="text-sm font-semibold truncate" title={displayName}>{displayName}</CardTitle>
        {dragHandleListeners && <GripVertical className="h-5 w-5 text-muted-foreground flex-shrink-0" />}
      </CardHeader>
      <CardContent className="p-3 pt-0 text-xs text-muted-foreground flex-grow space-y-0.5">
        {propertiesToDisplay.map(prop => (
           <div key={prop.id} className="flex items-center text-xs">
             <span className="font-medium text-foreground/70 mr-1.5 shrink-0">{prop.name}:</span>
             <div className="truncate flex-grow min-w-0">
                {getCompactPropertyValue(prop, object[prop.name])}
             </div>
           </div>
        ))}
        {propertiesToDisplay.length === 0 && (!displayImage || !imageUrlFromProp) && (
            <p className="text-xs text-muted-foreground italic">No additional details to display.</p>
        )}
      </CardContent>
      <div className="p-2 border-t flex justify-end space-x-1 mt-auto bg-muted/30">
        <Button variant="ghost" size="xs" onClick={() => onViewObject(object)} title="View Details">
          <Eye className="h-3 w-3 mr-1" /> View
        </Button>
        <Button variant="ghost" size="xs" onClick={() => onEditObject(object)} title="Edit Object">
          <Edit className="h-3 w-3 mr-1" /> Edit
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="xs" className="hover:text-destructive" title="Delete Object">
              <Trash2 className="h-3 w-3 mr-1" /> Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the object "{displayName}".
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDeleteObject(object.id)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Card>
  );
}

interface SortableKanbanItemProps extends Omit<KanbanCardProps, 'dragHandleListeners'> {
  id: string;
}

export function SortableKanbanItem(props: SortableKanbanItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 100 : 'auto',
    boxShadow: isDragging ? '0 0 15px rgba(var(--primary-rgb), 0.5)' : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} >
      <KanbanCard
        {...props}
        className={isDragging ? 'ring-2 ring-primary' : ''}
        dragHandleListeners={listeners}
      />
    </div>
  );
}

interface DroppablePlaceholderProps {
  id: string;
  className?: string;
}

export function DroppablePlaceholder({ id, className }: DroppablePlaceholderProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: id,
    data: {
      isPlaceholder: true,
      columnId: id,
    }
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-grow flex items-center justify-center text-sm text-muted-foreground p-4 border-2 border-dashed rounded-md min-h-[100px] pointer-events-none",
        isOver && "bg-accent/20 border-accent-foreground/20 border-accent",
        className
      )}
    >
      Drag items here
    </div>
  );
}
