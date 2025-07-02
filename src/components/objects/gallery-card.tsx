

'use client';

import * as React from 'react'; // Import React
import type { DataObject, Model, Property, WorkflowWithDetails } from '@/lib/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, Edit, Trash2, CheckCircle2, ArchiveRestore, Paperclip, ExternalLink } from 'lucide-react'; // Added ExternalLink
import { getObjectDisplayValue, cn } from '@/lib/utils'; // Added cn
import Image from 'next/image';
import { format as formatDateFns, isValid as isDateValid } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { StarDisplay } from '@/components/ui/star-display';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";


interface GalleryCardProps {
  obj: DataObject;
  model: Model;
  allModels: Model[];
  allObjects: Record<string, DataObject[]>;
  currentWorkflow?: WorkflowWithDetails | null;
  getWorkflowStateName: (stateId: string | null | undefined) => string;
  onView: (obj: DataObject) => void;
  onEdit: (obj: DataObject) => void;
  onDeleteRequest: (obj: DataObject) => void; // Changed from onDelete
  onRestore?: (objId: string, objName: string) => void; // Changed signature
  viewingRecycleBin?: boolean;
  lastChangedInfo?: { modelId: string, objectId: string, changeType: 'added' | 'updated' | 'deleted' | 'restored' } | null;
}

const GalleryCard = React.memo(function GalleryCard({
  obj,
  model,
  allModels,
  allObjects,
  currentWorkflow,
  getWorkflowStateName,
  onView,
  onEdit,
  onDeleteRequest,
  onRestore,
  viewingRecycleBin,
  lastChangedInfo,
}: GalleryCardProps) {
  const displayName = getObjectDisplayValue(obj, model, allModels, allObjects);
  const stateName = currentWorkflow ? getWorkflowStateName(obj.currentStateId) : null;


  let imageProp = model.properties.find(p => p.type === 'image' && obj[p.name]);
  let imageUrl = imageProp && obj[imageProp.name] ? String(obj[imageProp.name]) : null;
  let imageAltText = imageProp ? `${displayName} ${imageProp.name}` : `${displayName} gallery image`;
  
  if (!imageUrl) {
    const fallbackImageProp = model.properties.find(
      (p) => (p.name.toLowerCase().includes('image') ||
              p.name.toLowerCase().includes('picture') ||
              p.name.toLowerCase().includes('photo') ||
              p.name.toLowerCase().includes('url')) &&
              p.type === 'string' &&
              obj[p.name]
    );
    if (fallbackImageProp && obj[fallbackImageProp.name]) {
      imageUrl = String(obj[fallbackImageProp.name]);
      imageAltText = `${displayName} ${fallbackImageProp.name}`;
      imageProp = fallbackImageProp; 
    }
  }

  const placeholderImage = `https://placehold.co/600x400.png`;
  if (!imageUrl || typeof imageUrl !== 'string' || (!imageUrl.startsWith('http') && !imageUrl.startsWith('/uploads'))) {
     imageUrl = placeholderImage;
     imageAltText = `${displayName} placeholder image`;
  }
  
  const displayImage = imageUrl && imageUrl !== placeholderImage;

  const displayProperties = model.properties
    .filter(p => p.name !== imageProp?.name && model.displayPropertyNames?.includes(p.name) === false)
    .sort((a,b) => a.orderIndex - b.orderIndex)
    .slice(0, 2);

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
      case 'time':
        return <span className="text-xs font-mono">{value}</span>;
      case 'datetime':
        try {
          const date = new Date(value);
          return <span className="text-xs">{isDateValid(date) ? formatDateFns(date, 'PPp') : String(value)}</span>;
        } catch { return <span className="text-xs">{String(value)}</span>; }
      case 'number':
        const numValue = parseFloat(String(value));
        const precision = property.precision === undefined ? 2 : property.precision;
        const unitText = property.unit || '';
        const formattedValue = isNaN(numValue) ? <span className="text-xs text-muted-foreground">N/A{unitText ? ` (${unitText})` : ''}</span> : <span className="text-xs">{`${numValue.toFixed(precision)}${unitText ? ` ${unitText}` : ''}`}</span>;

        if (typeof property.minValue === 'number' && typeof property.maxValue === 'number' && property.minValue < property.maxValue && !isNaN(numValue)) {
          const min = Number(property.minValue);
          const max = Number(property.maxValue);
          const val = Number(numValue);
          let percentage = 0;
          if (max > min) {
            percentage = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
          } else {
            percentage = val >= min ? 100 : 0;
          }
          return (
            <div className="flex items-center space-x-2">
              {formattedValue}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Progress value={percentage} className="h-1.5 w-10 flex-shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="start">
                    <p className="text-xs">{`${percentage.toFixed(0)}% (Min: ${min}${unitText}, Max: ${max}${unitText})`}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          );
        }
        return formattedValue;
      case 'markdown':
        return <Badge variant="outline" className="text-xs">Markdown Content</Badge>;
      case 'image':
        return <Badge variant="outline" className="text-xs">Image</Badge>;
      case 'fileAttachment':
        if (typeof value === 'object' && value.url && value.name) {
          return (
            <a href={value.url} download={value.name} className="text-primary hover:underline inline-flex items-center text-xs" onClick={(e) => e.stopPropagation()}>
              <Paperclip className="h-3 w-3 mr-1" />
              <span className="truncate" title={value.name}>
                {value.name.length > 20 ? value.name.substring(0, 17) + '...' : value.name}
              </span>
            </a>
          );
        }
        return <Badge variant="outline" className="text-xs">File</Badge>;
      case 'url':
        if (typeof value === 'object' && value !== null && value.url) {
          return (
            <a href={value.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 text-xs" onClick={(e) => e.stopPropagation()}>
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate" title={value.url}>
                {value.title || value.url}
              </span>
            </a>
          );
        }
        return <span className="text-muted-foreground italic text-xs">Invalid URL data</span>;
      case 'rating':
        return <StarDisplay rating={value as number} size="sm"/>;
      case 'relationship':
        return <Badge variant="outline" className="text-xs">Relationship</Badge>;
      default:
        const strValue = String(value);
        return <span className="text-xs truncate" title={strValue}>{strValue.length > 30 ? strValue.substring(0, 27) + '...' : strValue}</span>;
    }
  };

  const isHighlightedAdded = lastChangedInfo?.objectId === obj.id && lastChangedInfo?.modelId === model.id && lastChangedInfo?.changeType === 'added';
  const isHighlightedUpdated = lastChangedInfo?.objectId === obj.id && lastChangedInfo?.modelId === model.id && lastChangedInfo?.changeType === 'updated';
  const isHighlightedRestored = lastChangedInfo?.objectId === obj.id && lastChangedInfo?.modelId === model.id && lastChangedInfo?.changeType === 'restored';


  return (
    <Card className={cn(
        "flex flex-col overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300",
        isHighlightedAdded && "animate-highlight-green",
        isHighlightedUpdated && "animate-highlight-yellow",
        isHighlightedRestored && "animate-highlight-blue" // Or another color for restored
      )}>
      <CardHeader className="p-0">
        <div className="aspect-[3/2] relative w-full">
          <Image
            src={imageUrl}
            alt={imageAltText}
            layout="fill"
            objectFit="cover"
            data-ai-hint={model.name.toLowerCase()}
             onError={(e) => {
              (e.target as HTMLImageElement).src = placeholderImage;
              (e.target as HTMLImageElement).dataset.aiHint = 'placeholder image';
            }}
          />
           {viewingRecycleBin && (
            <Badge variant="destructive" className="absolute top-2 right-2">Deleted</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 flex-grow">
        <CardTitle className="text-lg mb-1 truncate" title={displayName}>{displayName}</CardTitle>
        {stateName && stateName !== 'N/A' && !viewingRecycleBin && (
            <Badge variant={obj.currentStateId ? "outline" : "secondary"} className="text-xs mb-2">
                 <CheckCircle2 className="mr-1 h-3 w-3" /> {stateName}
            </Badge>
        )}
        {displayProperties.map(prop => (
          <div key={prop.id} className="text-sm text-muted-foreground mt-1">
            <span className="font-medium text-foreground/80">{prop.name}: </span>
            {displayPropertyValue(prop, obj[prop.name])}
          </div>
        ))}
        {displayProperties.length === 0 && (!displayImage || !imageUrl) && (
            <p className="text-xs text-muted-foreground italic">No additional details to display.</p>
        )}
        {obj.deletedAt && viewingRecycleBin && (
          <p className="text-xs text-destructive mt-2">
            Deleted on: {formatDateFns(new Date(obj.deletedAt), 'PP p')}
          </p>
        )}
      </CardContent>
      <CardFooter className="p-3 border-t bg-muted/50 flex justify-end space-x-2">
        {viewingRecycleBin && onRestore ? (
          <Button variant="outline" size="sm" onClick={() => onRestore(obj.id, displayName)} title="Restore Object">
            <ArchiveRestore className="h-4 w-4 mr-1" /> Restore
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="icon" onClick={() => onView(obj)} title="View Details">
              <Eye className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onEdit(obj)} title="Edit Object">
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="hover:text-destructive" title="Delete Object" onClick={() => onDeleteRequest(obj)}>
                <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
});

export default GalleryCard;
