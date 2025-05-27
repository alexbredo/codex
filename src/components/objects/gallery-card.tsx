
'use client';

import type { DataObject, Model, Property } from '@/lib/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, Edit, Trash2 } from 'lucide-react';
import { getObjectDisplayValue } from '@/lib/utils';
import Image from 'next/image';
import { format as formatDateFns, isValid as isDateValid } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { StarDisplay } from '@/components/ui/star-display';
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

interface GalleryCardProps {
  obj: DataObject;
  model: Model;
  allModels: Model[];
  allObjects: Record<string, DataObject[]>;
  onView: (obj: DataObject) => void;
  onEdit: (obj: DataObject) => void;
  onDelete: (objId: string) => void; // Pass only ID for delete confirmation
}

export default function GalleryCard({
  obj,
  model,
  allModels,
  allObjects,
  onView,
  onEdit,
  onDelete,
}: GalleryCardProps) {
  const displayName = getObjectDisplayValue(obj, model, allModels, allObjects);

  // Attempt to find an image URL property
  const imageProp = model.properties.find(
    (p) => (p.name.toLowerCase().includes('image') || p.name.toLowerCase().includes('picture') ||  p.name.toLowerCase().includes('photo') || p.name.toLowerCase().includes('url')) && p.type === 'string'
  );
  const imageUrl = imageProp && obj[imageProp.name] ? String(obj[imageProp.name]) : `https://placehold.co/600x400.png`;
  const imageAltText = imageProp ? `${displayName} ${imageProp.name}` : `${displayName} placeholder image`;

  const displayProperties = model.properties
    .filter(p => p.name !== imageProp?.name && model.displayPropertyNames?.includes(p.name) === false) // Exclude image and already displayed names
    .sort((a,b) => a.orderIndex - b.orderIndex)
    .slice(0, 2); // Show up to 2 additional properties

  const displayPropertyValue = (property: Property, value: any) => {
     if (value === null || typeof value === 'undefined' || (Array.isArray(value) && value.length === 0) || String(value).trim() === '') {
      if (property.type === 'number' && property.unit) {
        return <span className="text-xs text-muted-foreground">N/A ({property.unit})</span>;
      }
      if (property.type === 'rating') return <StarDisplay rating={0} size="sm"/>;
      return <span className="text-xs text-muted-foreground">N/A</span>;
    }
    switch (property.type) {
      case 'boolean':
        return value ? <Badge variant="default" className="text-xs bg-green-500 hover:bg-green-600">Yes</Badge> : <Badge variant="secondary" className="text-xs">No</Badge>;
      case 'date':
        try {
          const date = new Date(value);
          return <span className="text-xs">{isDateValid(date) ? formatDateFns(date, 'PP') : String(value)}</span>;
        } catch { return <span className="text-xs">{String(value)}</span>; }
      case 'number':
        const precision = property.precision === undefined ? 2 : property.precision;
        const unitText = property.unit || '';
        const parsedValue = parseFloat(value);
         if (isNaN(parsedValue)) {
          const displayUnit = unitText ? ` (${unitText})` : '';
          return <span className="text-xs text-muted-foreground">N/A{displayUnit}</span>;
        }
        return <span className="text-xs">{`${parsedValue.toFixed(precision)}${unitText ? ` ${unitText}` : ''}`}</span>;
      case 'markdown':
        return <Badge variant="outline" className="text-xs">Markdown Content</Badge>;
      case 'rating':
        return <StarDisplay rating={value as number} size="sm"/>;
      case 'relationship':
        return <Badge variant="outline" className="text-xs">Relationship</Badge>; // Simplified for card
      default:
        const strValue = String(value);
        return <span className="text-xs truncate" title={strValue}>{strValue.length > 30 ? strValue.substring(0, 27) + '...' : strValue}</span>;
    }
  };

  return (
    <Card className="flex flex-col overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="p-0">
        <div className="aspect-[3/2] relative w-full">
          <Image
            src={imageUrl}
            alt={imageAltText}
            layout="fill"
            objectFit="cover"
            data-ai-hint={model.name.toLowerCase()}
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://placehold.co/600x400.png`; // Fallback placeholder
              (e.target as HTMLImageElement).dataset.aiHint = 'placeholder image';
            }}
          />
        </div>
      </CardHeader>
      <CardContent className="p-4 flex-grow">
        <CardTitle className="text-lg mb-1 truncate" title={displayName}>{displayName}</CardTitle>
        {displayProperties.map(prop => (
          <div key={prop.id} className="text-sm text-muted-foreground mt-1">
            <span className="font-medium text-foreground/80">{prop.name}: </span>
            {displayPropertyValue(prop, obj[prop.name])}
          </div>
        ))}
      </CardContent>
      <CardFooter className="p-3 border-t bg-muted/50 flex justify-end space-x-2">
        <Button variant="ghost" size="icon" onClick={() => onView(obj)} title="View Details">
          <Eye className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => handleEdit(obj)} title="Edit Object">
          <Edit className="h-4 w-4" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="hover:text-destructive" title="Delete Object">
              <Trash2 className="h-4 w-4" />
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
              <AlertDialogAction onClick={() => onDelete(obj.id)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}
