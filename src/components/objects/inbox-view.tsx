
'use client';

import * as React from 'react';
import type { DataObject, Model } from '@/lib/types';
import { getObjectDisplayValue } from '@/lib/utils';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import ObjectDetailView from './object-detail-view';
import { Inbox as InboxIcon } from 'lucide-react';

interface InboxViewProps {
  model: Model;
  objects: DataObject[];
}

export default function InboxView({ model, objects }: InboxViewProps) {
  const [selectedObjectId, setSelectedObjectId] = React.useState<string | null>(null);

  React.useEffect(() => {
    // If there are objects but none is selected, select the first one.
    if (objects.length > 0 && !selectedObjectId) {
      setSelectedObjectId(objects[0].id);
    }
    // If the currently selected object is no longer in the list, clear selection.
    if (selectedObjectId && !objects.some(obj => obj.id === selectedObjectId)) {
      setSelectedObjectId(objects.length > 0 ? objects[0].id : null);
    }
  }, [objects, selectedObjectId]);
  
  const selectedObject = React.useMemo(() => {
    return objects.find(obj => obj.id === selectedObjectId);
  }, [selectedObjectId, objects]);

  return (
    <div className="flex h-[calc(100vh-14rem)] border rounded-lg">
      <div className="w-1/3 border-r h-full flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">{model.name} Inbox</h2>
          <p className="text-sm text-muted-foreground">{objects.length} items</p>
        </div>
        <ScrollArea className="flex-1">
          <ul>
            {objects.map(obj => (
              <li key={obj.id}>
                <button
                  onClick={() => setSelectedObjectId(obj.id)}
                  className={cn(
                    "w-full text-left p-4 border-b hover:bg-accent",
                    selectedObjectId === obj.id && "bg-muted hover:bg-muted"
                  )}
                >
                  <p className="font-semibold truncate">{getObjectDisplayValue(obj, model, [], {})}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(obj.createdAt!), 'PP p')}</p>
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </div>
      <div className="w-2/3 h-full flex flex-col">
        <ScrollArea className="flex-1">
          {selectedObject ? (
            <ObjectDetailView model={model} viewingObject={selectedObject} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <InboxIcon className="h-16 w-16 mb-4" />
              <p className="text-lg">Select an item to view its details</p>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
