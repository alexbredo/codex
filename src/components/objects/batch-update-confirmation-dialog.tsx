
'use client';

import * as React from 'react';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, AlertTriangle } from 'lucide-react';
import type { DataObject, Model, Property, WorkflowWithDetails } from '@/lib/types';
import { getObjectDisplayValue } from '@/lib/utils';

interface BatchUpdateConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isConfirming: boolean;
  model: Model | null;
  selectedObjects: DataObject[];
  propertyBeingUpdated: (Property & { type: 'workflow_state' | Property['type'] }) | undefined;
  newValue: any;
  currentWorkflow: WorkflowWithDetails | null;
  allModels: Model[];
  allDbObjects: Record<string, DataObject[]>;
}

export default function BatchUpdateConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  isConfirming,
  model,
  selectedObjects,
  propertyBeingUpdated,
  newValue,
  currentWorkflow,
  allModels,
  allDbObjects,
}: BatchUpdateConfirmationDialogProps) {

  if (!isOpen || !model || !propertyBeingUpdated) {
    return null;
  }
  
  const getDisplayValue = (value: any, property: Property | undefined) => {
    if (value === null || typeof value === 'undefined' || String(value).trim() === '') return <span className="text-muted-foreground italic">Not Set</span>;

    if (!property) {
        // Handle workflow state or other special cases
        if (propertyBeingUpdated?.type === 'workflow_state' && currentWorkflow) {
            const state = currentWorkflow.states.find(s => s.id === value);
            return state ? state.name : `Unknown State`;
        }
        return String(value);
    }
    
    // Simplified display logic for the dialog
    switch (property.type) {
        case 'boolean':
            return value ? 'Yes' : 'No';
        case 'relationship':
            if (property.relatedModelId) {
                const relatedModel = allModels.find(m => m.id === property.relatedModelId);
                const relatedObj = (allDbObjects[property.relatedModelId] || []).find(o => o.id === value);
                return getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects);
            }
            return String(value);
        default:
            return String(value);
    }
  };

  const newDisplayValue = getDisplayValue(newValue, propertyBeingUpdated);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
            Confirm Batch Update
          </DialogTitle>
          <DialogDescription>
            You are about to update the property "{propertyBeingUpdated.name}" for {selectedObjects.length} item(s). Please review the changes below.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
            <ScrollArea className="max-h-80 border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Object</TableHead>
                            <TableHead>Current Value</TableHead>
                            <TableHead className="text-primary">New Value</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {selectedObjects.map(obj => (
                            <TableRow key={obj.id}>
                                <TableCell className="font-medium truncate" title={getObjectDisplayValue(obj, model, allModels, allDbObjects)}>
                                  {getObjectDisplayValue(obj, model, allModels, allDbObjects)}
                                </TableCell>
                                <TableCell className="truncate">
                                    {getDisplayValue(
                                        propertyBeingUpdated.type === 'workflow_state' ? obj.currentStateId : obj[propertyBeingUpdated.name],
                                        propertyBeingUpdated
                                    )}
                                </TableCell>
                                <TableCell className="font-medium text-primary truncate">
                                    {newDisplayValue}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isConfirming}>Cancel</Button>
          <Button onClick={onConfirm} disabled={isConfirming} className="bg-primary hover:bg-primary/90">
            {isConfirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
