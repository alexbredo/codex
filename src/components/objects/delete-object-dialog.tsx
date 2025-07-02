
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
import { Loader2, AlertTriangle, Trash2, ArrowRight } from 'lucide-react';
import { useData } from '@/contexts/data-context';
import type { DataObject, Model } from '@/lib/types';
import type { DependencyCheckResult } from '@/app/api/codex-structure/objects/[objectId]/dependencies/route';


interface DeleteObjectDialogProps {
  objectToDelete: DataObject | null;
  model: Model | null;
  onClose: () => void;
  onSuccess: () => void;
}

async function fetchDependencies(objectId: string): Promise<DependencyCheckResult> {
    const response = await fetch(`/api/codex-structure/objects/${objectId}/dependencies`);
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch object dependencies');
    }
    return response.json();
}


export default function DeleteObjectDialog({ objectToDelete, model, onClose, onSuccess }: DeleteObjectDialogProps) {
  const { batchDeleteAcrossModels } = useData();
  const [selectedToDelete, setSelectedToDelete] = React.useState<Set<string>>(new Set());

  const { data: dependencies, isLoading, error } = useQuery<DependencyCheckResult>({
    queryKey: ['objectDependencies', objectToDelete?.id],
    queryFn: () => fetchDependencies(objectToDelete!.id),
    enabled: !!objectToDelete,
    retry: 1,
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => batchDeleteAcrossModels(ids),
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (err: Error) => {
      // Toast is handled by onSuccess/onError in the calling component
    },
  });

  const handleConfirmDelete = () => {
    if (!objectToDelete) return;
    const idsToDelete = [objectToDelete.id, ...Array.from(selectedToDelete)];
    deleteMutation.mutate(idsToDelete);
  };

  const handleCheckboxChange = (objectId: string, checked: boolean) => {
    setSelectedToDelete(prev => {
        const newSet = new Set(prev);
        if (checked) {
            newSet.add(objectId);
        } else {
            newSet.delete(objectId);
        }
        return newSet;
    });
  };

  const hasIncomingRelations = dependencies && dependencies.incoming.length > 0;

  return (
    <Dialog open={!!objectToDelete} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
             <AlertTriangle className="h-6 w-6 text-destructive" />
            Confirm Deletion
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this object? This action will move the object to the recycle bin.
          </DialogDescription>
        </DialogHeader>
        
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

        {dependencies && (
            <div className="space-y-4">
                <div className="p-3 border rounded-md bg-muted/50">
                    <p className="font-semibold text-foreground">{model?.name}: {objectToDelete?.name || `ID: ...${objectToDelete?.id.slice(-6)}`}</p>
                    <p className="text-sm text-muted-foreground">This object will be moved to the recycle bin.</p>
                </div>
                
                {hasIncomingRelations && (
                    <div>
                        <h4 className="font-semibold mb-2">Warning: Found Related Objects</h4>
                        <p className="text-sm text-muted-foreground mb-3">The following objects link to the item you are deleting. Deleting it will break these relationships. You can choose to delete these related objects as well.</p>
                        <ScrollArea className="max-h-60 border rounded-md p-2">
                           <div className="space-y-2">
                             {dependencies.incoming.map(rel => (
                                <div key={rel.objectId} className="flex items-center space-x-3 p-2 rounded hover:bg-muted">
                                    <Checkbox
                                        id={`delete-${rel.objectId}`}
                                        onCheckedChange={(checked) => handleCheckboxChange(rel.objectId, !!checked)}
                                        checked={selectedToDelete.has(rel.objectId)}
                                    />
                                    <label htmlFor={`delete-${rel.objectId}`} className="text-sm w-full">
                                        <div className="flex justify-between items-center">
                                            <span className="font-medium truncate" title={rel.objectDisplayValue}>{rel.objectDisplayValue}</span>
                                            <Badge variant="secondary" className="text-xs">{rel.modelName}</Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            (via property: <span className="font-mono">{rel.viaPropertyName}</span>)
                                        </p>
                                    </label>
                                </div>
                             ))}
                           </div>
                        </ScrollArea>
                    </div>
                )}

                {!hasIncomingRelations && (
                    <Alert>
                        <AlertDescription>No incoming relationships were found for this object.</AlertDescription>
                    </Alert>
                )}
            </div>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleteMutation.isPending}>Cancel</Button>
          <Button variant="destructive" onClick={handleConfirmDelete} disabled={isLoading || deleteMutation.isPending}>
            {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete {1 + selectedToDelete.size} Item(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

