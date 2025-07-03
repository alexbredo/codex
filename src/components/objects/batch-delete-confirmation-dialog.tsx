'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, Trash2 } from 'lucide-react';
import { useData } from '@/contexts/data-context';
import type { DataObject } from '@/lib/types';

interface RelationInfo {
  objectId: string;
  objectDisplayValue: string;
  modelId: string;
  modelName: string;
  relationType: 'incoming' | 'outgoing';
  linkedVia: {
    sourceObjectId: string;
    sourceObjectDisplay: string;
    propertyName: string;
  }[];
}

async function fetchBatchDependencies(objectIds: string[]): Promise<{ relations: RelationInfo[] }> {
  if (objectIds.length === 0) return { relations: [] };
  const response = await fetch(`/api/codex-structure/objects/batch-dependencies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objectIds }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to fetch object dependencies');
  }
  return response.json();
}

interface BatchDeleteConfirmationDialogProps {
  objectsToDelete: DataObject[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function BatchDeleteConfirmationDialog({ objectsToDelete, onClose, onSuccess }: BatchDeleteConfirmationDialogProps) {
  const { batchDeleteAcrossModels } = useData();
  const [additionalIdsToDelete, setAdditionalIdsToDelete] = React.useState<Set<string>>(new Set());

  const objectIds = React.useMemo(() => objectsToDelete.map(o => o.id), [objectsToDelete]);

  const { data, isLoading, error } = useQuery<{ relations: RelationInfo[] }>({
    queryKey: ['batchObjectDependencies', objectIds],
    queryFn: () => fetchBatchDependencies(objectIds),
    enabled: !!objectsToDelete && objectsToDelete.length > 0,
    retry: 1,
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => batchDeleteAcrossModels(ids),
    onSuccess: onSuccess,
  });

  const handleConfirmDelete = () => {
    if (!objectsToDelete) return;
    const finalIdsToDelete = [...objectIds, ...Array.from(additionalIdsToDelete)];
    deleteMutation.mutate(finalIdsToDelete);
  };

  const handleCheckboxChange = (objectId: string, checked: boolean) => {
    setAdditionalIdsToDelete(prev => {
        const newSet = new Set(prev);
        if (checked) newSet.add(objectId);
        else newSet.delete(objectId);
        return newSet;
    });
  };

  const allRelations = React.useMemo(() => {
    if (!data?.relations) return [];
    return [...data.relations].sort((a, b) => a.objectDisplayValue.localeCompare(b.objectDisplayValue));
  }, [data]);
  
  const hasRelations = data?.relations && data.relations.length > 0;
  const totalItemsToDelete = objectsToDelete.length + additionalIdsToDelete.size;

  return (
    <Dialog open={objectsToDelete.length > 0} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
             <AlertTriangle className="h-6 w-6 text-destructive" />
            Confirm Batch Deletion
          </DialogTitle>
          <DialogDescription>
            You are about to delete {objectsToDelete.length} item(s). This action moves them to the recycle bin.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-grow overflow-y-auto pr-2 space-y-4">
          <div className="p-3 border rounded-md bg-muted/50">
            <h4 className="font-semibold mb-2">Items to be Deleted:</h4>
            <ScrollArea className="max-h-32">
              <ul className="list-disc pl-5 text-sm space-y-1">
                {objectsToDelete.map(obj => (
                  <li key={obj.id}>{obj.name || `ID: ...${obj.id.slice(-6)}`}</li>
                ))}
              </ul>
            </ScrollArea>
          </div>

          {isLoading && (
            <div className="flex justify-center items-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Checking for related objects...</span>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>Could not check for dependencies: {error.message}</AlertDescription>
            </Alert>
          )}

          {hasRelations && (
            <div>
              <h4 className="font-semibold mb-2">Warning: Found {allRelations.length} Related Object(s)</h4>
              <p className="text-sm text-muted-foreground mb-3">
                Deleting the selected items will break these relationships. You can choose to delete these related objects as well.
              </p>
              <ScrollArea className="max-h-64 border rounded-md p-2">
                <div className="space-y-2">
                  {allRelations.map(rel => (
                    <div key={rel.objectId} className="flex items-start space-x-3 p-2 rounded hover:bg-muted">
                      <Checkbox
                        id={`delete-${rel.objectId}`}
                        onCheckedChange={(checked) => handleCheckboxChange(rel.objectId, !!checked)}
                        checked={additionalIdsToDelete.has(rel.objectId)}
                        className="mt-1"
                      />
                      <label htmlFor={`delete-${rel.objectId}`} className="text-sm w-full">
                        <div className="flex justify-between items-center">
                          <span className="font-medium truncate" title={rel.objectDisplayValue}>{rel.objectDisplayValue}</span>
                          <Badge variant={rel.relationType === 'incoming' ? 'secondary' : 'outline'} className="text-xs">{rel.modelName}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          {rel.relationType === 'incoming' ? 'Links to' : 'Linked from'}
                          <span className="font-semibold text-foreground truncate" title={rel.linkedVia.map(l => l.sourceObjectDisplay).join(', ')}>
                            {rel.linkedVia[0].sourceObjectDisplay}
                          </span>
                          {rel.linkedVia.length > 1 && ` (+${rel.linkedVia.length - 1} others)`}
                        </p>
                      </label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {!isLoading && !error && !hasRelations && (
            <Alert>
              <AlertDescription>No other objects appear to be related to the items selected for deletion.</AlertDescription>
            </Alert>
          )}
        </div>
        
        <DialogFooter className="flex-shrink-0 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={deleteMutation.isPending}>Cancel</Button>
          <Button variant="destructive" onClick={handleConfirmDelete} disabled={isLoading || deleteMutation.isPending}>
            {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete {totalItemsToDelete} Item(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
