
'use client';

import type { DataObject, Model } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, Edit } from 'lucide-react'; // Added Edit icon
import { getObjectDisplayValue, cn } from '@/lib/utils'; // Ensure cn is imported
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Image from 'next/image'; // For image display
import { useDroppable } from '@dnd-kit/core'; // Added for DroppablePlaceholder

interface KanbanCardProps {
  object: DataObject;
  model: Model;
  allModels: Model[];
  allObjects: Record<string, DataObject[]>;
  onViewObject: (object: DataObject) => void;
  onEditObject: (object: DataObject) => void; // Added onEditObject prop
  className?: string;
}

export function KanbanCard({ object, model, allModels, allObjects, onViewObject, onEditObject, className }: KanbanCardProps) {
  const displayName = getObjectDisplayValue(object, model, allModels, allObjects);

  // Attempt to find an image URL property for the card
  let imageUrl: string | null = null;
  const imageProperty = model.properties.find(p => p.type === 'image' && object[p.name]);
  if (imageProperty && typeof object[imageProperty.name] === 'string') {
    imageUrl = object[imageProperty.name] as string;
  } else {
    // Fallback: check for properties named 'image', 'picture', 'photo', 'url' of type string
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
    if (fallbackImageProp) {
      imageUrl = object[fallbackImageProp.name] as string;
    }
  }
  
  const placeholderImage = `https://placehold.co/300x200.png`;


  return (
    <Card className={cn("mb-2 shadow-md hover:shadow-lg transition-shadow break-inside-avoid-column", className)}>
      {imageUrl && (
        <div className="aspect-video relative w-full bg-muted rounded-t-lg overflow-hidden">
          <Image
            src={imageUrl.startsWith('http') || imageUrl.startsWith('/uploads') ? imageUrl : placeholderImage}
            alt={`Image for ${displayName}`}
            layout="fill"
            objectFit="cover"
            data-ai-hint={`${model.name.toLowerCase()} image`}
            onError={(e) => { (e.target as HTMLImageElement).src = placeholderImage; }}
          />
        </div>
      )}
      <CardHeader className={cn("p-3", imageUrl && "pt-2")}>
        <CardTitle className="text-sm font-semibold truncate" title={displayName}>{displayName}</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 text-xs text-muted-foreground">
        <p className="truncate text-ellipsis text-gray-500">ID: {object.id.substring(0, 8)}...</p>
        {model.properties
          .filter(p => p.name.toLowerCase() !== 'name' && p.name.toLowerCase() !== 'title' && p.type !== 'image' && p.type !== 'markdown' && !model.displayPropertyNames?.includes(p.name))
          .slice(0, 1) // Show one additional property
          .map(prop => (
           <p key={prop.id} className="truncate text-ellipsis mt-1">
             <span className="font-medium text-foreground/80">{prop.name}: </span>
             {String(object[prop.name] ?? 'N/A')}
           </p>
        ))}
      </CardContent>
      <div className="p-2 border-t flex justify-end space-x-1">
        <Button variant="ghost" size="xs" onClick={() => onViewObject(object)} title="View Details">
          <Eye className="h-3 w-3 mr-1" /> View
        </Button>
        <Button variant="ghost" size="xs" onClick={() => onEditObject(object)} title="Edit Object">
          <Edit className="h-3 w-3 mr-1" /> Edit
        </Button>
      </div>
    </Card>
  );
}

interface SortableKanbanItemProps extends KanbanCardProps {
  id: string; // dnd-kit requires id to be a string for SortableItem
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
    boxShadow: isDragging ? '0 0 15px rgba(var(--primary-rgb), 0.5)' : undefined, // Visual cue for dragging
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanCard {...props} className={isDragging ? 'ring-2 ring-primary' : ''} />
    </div>
  );
}


interface DroppablePlaceholderProps {
  id: string; // This ID will be column.id, making this part of the column's droppable area
  className?: string;
}

export function DroppablePlaceholder({ id, className }: DroppablePlaceholderProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: id, // The ID for this droppable area is the column's ID
    data: {
      isPlaceholder: true, // Custom data to identify this as a placeholder droppable
      columnId: id,
    }
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-grow flex items-center justify-center text-sm text-muted-foreground p-4 border-2 border-dashed rounded-md min-h-[100px] pointer-events-none", // Added pointer-events-none
        isOver && "bg-accent/20 border-accent-foreground/20 border-accent", // Highlight when dragged over
        className
      )}
    >
      Drag items here
    </div>
  );
}
