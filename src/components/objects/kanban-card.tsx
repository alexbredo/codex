
'use client';

import type { DataObject, Model } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, Edit, GripVertical } from 'lucide-react'; // Added Edit, GripVertical icon
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
  dragHandleListeners?: ReturnType<typeof useSortable>['listeners']; // For passing drag listeners
}

export function KanbanCard({
  object,
  model,
  allModels,
  allObjects,
  onViewObject,
  onEditObject,
  className,
  dragHandleListeners,
}: KanbanCardProps) {
  const displayName = getObjectDisplayValue(object, model, allModels, allObjects);

  let imageUrl: string | null = null;
  const imageProperty = model.properties.find(p => p.type === 'image' && object[p.name]);
  if (imageProperty && typeof object[imageProperty.name] === 'string') {
    imageUrl = object[imageProperty.name] as string;
  } else {
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
    <Card className={cn("mb-2 shadow-md hover:shadow-lg transition-shadow break-inside-avoid-column flex flex-col", className)}>
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
      <CardHeader 
        className={cn("p-3 flex flex-row items-center justify-between", imageUrl && "pt-2", dragHandleListeners && "cursor-grab")}
        {...(dragHandleListeners || {})} // Spread listeners here to make header the handle
      >
        <CardTitle className="text-sm font-semibold truncate" title={displayName}>{displayName}</CardTitle>
        {dragHandleListeners && <GripVertical className="h-5 w-5 text-muted-foreground flex-shrink-0" />}
      </CardHeader>
      <CardContent className="p-3 pt-0 text-xs text-muted-foreground flex-grow">
        <p className="truncate text-ellipsis text-gray-500">ID: {object.id.substring(0, 8)}...</p>
        {model.properties
          .filter(p => p.name.toLowerCase() !== 'name' && p.name.toLowerCase() !== 'title' && p.type !== 'image' && p.type !== 'markdown' && !model.displayPropertyNames?.includes(p.name))
          .slice(0, 1) 
          .map(prop => (
           <p key={prop.id} className="truncate text-ellipsis mt-1">
             <span className="font-medium text-foreground/80">{prop.name}: </span>
             {String(object[prop.name] ?? 'N/A')}
           </p>
        ))}
      </CardContent>
      <div className="p-2 border-t flex justify-end space-x-1 mt-auto">
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
        dragHandleListeners={listeners} // Pass listeners to be applied to the CardHeader
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

