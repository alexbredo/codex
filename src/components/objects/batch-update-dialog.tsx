
'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter as BatchUpdateDialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel as UiSelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { MultiSelectAutocomplete, type MultiSelectOption } from '@/components/ui/multi-select-autocomplete';
import { StarRatingInput } from '@/components/ui/star-rating-input';
import { Loader2, Edit3, CalendarIcon as CalendarIconLucide } from 'lucide-react';
import { useDataViewLogic } from '@/hooks/useDataViewLogic';
import type { Model, Property } from '@/lib/types';
import { getObjectDisplayValue, cn } from '@/lib/utils';
import { format as formatDateFns } from 'date-fns';

interface BatchUpdateDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  selectedObjectIds: Set<string>;
  property: string;
  setProperty: (prop: string) => void;
  value: any;
  setValue: (val: any) => void;
  date: Date | undefined;
  setDate: (date: Date | undefined) => void;
  onConfirm: () => void;
  onInteractOutside: (event: Event) => void;
}

const INTERNAL_WORKFLOW_STATE_UPDATE_KEY = "__WORKFLOW_STATE_UPDATE__";
const INTERNAL_CLEAR_RELATIONSHIP_VALUE = "__CLEAR_RELATIONSHIP__";

export default function BatchUpdateDialog({
  isOpen,
  setIsOpen,
  selectedObjectIds,
  property,
  setProperty,
  value,
  setValue,
  date,
  setDate,
  onConfirm,
  onInteractOutside,
}: BatchUpdateDialogProps) {
  const { currentModel, currentWorkflow, batchUpdatableProperties, getModelById, getObjectsByModelId, allModels, getAllObjects } = useDataViewLogic();
  const [isUpdating, setIsUpdating] = React.useState(false);

  const selectedBatchPropertyDetails = React.useMemo(() => {
    if (property === INTERNAL_WORKFLOW_STATE_UPDATE_KEY) {
        return { name: INTERNAL_WORKFLOW_STATE_UPDATE_KEY, type: 'workflow_state' as Property['type'], id: INTERNAL_WORKFLOW_STATE_UPDATE_KEY, label: 'Workflow State' };
    }
    return batchUpdatableProperties.find(p => p.name === property);
  }, [property, batchUpdatableProperties]);

  const relatedModelForBatchUpdate = React.useMemo(() => {
    if (selectedBatchPropertyDetails?.type === 'relationship' && selectedBatchPropertyDetails.relatedModelId) {
        return getModelById(selectedBatchPropertyDetails.relatedModelId);
    }
    return undefined;
  }, [selectedBatchPropertyDetails, getModelById]);

  const allDbObjects = React.useMemo(() => getAllObjects(true), [getAllObjects]);

  const relatedObjectsForBatchUpdateOptions = React.useMemo(() => {
    if (relatedModelForBatchUpdate?.id) {
        const relatedObjects = getObjectsByModelId(relatedModelForBatchUpdate.id); 
        return relatedObjects.map(obj => ({
            value: obj.id,
            label: getObjectDisplayValue(obj, relatedModelForBatchUpdate, allModels, allDbObjects),
        })).sort((a, b) => a.label.localeCompare(b.label));
    }
    return [];
  }, [relatedModelForBatchUpdate, getObjectsByModelId, allModels, allDbObjects]);

  const relatedObjectsForBatchUpdateGrouped = React.useMemo(() => {
    if (relatedModelForBatchUpdate?.id) {
        const relatedObjects = getObjectsByModelId(relatedModelForBatchUpdate.id); 
        return relatedObjects.reduce((acc, obj) => {
            const groupName = allModels.find(m => m.id === relatedModelForBatchUpdate.id)?.namespace || 'Default';
            if (!acc[groupName]) acc[groupName] = [];
            acc[groupName].push({
                value: obj.id,
                label: getObjectDisplayValue(obj, relatedModelForBatchUpdate, allModels, allDbObjects),
            });
            return acc;
        }, {} as Record<string, MultiSelectOption[]>);
    }
    return {};
  }, [relatedModelForBatchUpdate, getObjectsByModelId, allModels, allDbObjects]);
  
  if (!isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setProperty('');
    }} modal={false}>
        <DialogContent onInteractOutside={onInteractOutside}>
            <DialogHeader>
                <DialogTitle>Batch Update {selectedObjectIds.size} Items</DialogTitle>
                <DialogDescription>Select a property and a new value to apply to all selected items.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="batch-property" className="text-right">Property</Label>
                    <Select value={property} onValueChange={setProperty}>
                        <SelectTrigger id="batch-property" className="col-span-3">
                            <SelectValue placeholder="Select property..." />
                        </SelectTrigger>
                        <SelectContent>
                            {batchUpdatableProperties.map(prop => (
                                <SelectItem key={prop.id} value={prop.name}>{prop.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {selectedBatchPropertyDetails && (
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="batch-value" className="text-right">New Value</Label>
                        {/* Render input based on property type */}
                        {selectedBatchPropertyDetails.type === 'boolean' && <Switch id="batch-value" checked={Boolean(value)} onCheckedChange={setValue} className="col-span-3" />}
                        {selectedBatchPropertyDetails.type === 'string' && <Input id="batch-value" value={String(value)} onChange={(e) => setValue(e.target.value)} className="col-span-3" />}
                        {selectedBatchPropertyDetails.type === 'number' && <Input id="batch-value" type="number" value={String(value)} onChange={(e) => setValue(e.target.value)} className="col-span-3" />}
                        {selectedBatchPropertyDetails.type === 'rating' && <div className="col-span-3"><StarRatingInput value={Number(value) || 0} onChange={setValue} /></div>}
                        {selectedBatchPropertyDetails.type === 'date' && (
                            <Popover><PopoverTrigger asChild><Button variant={"outline"} className="col-span-3 justify-start text-left font-normal">
                                <CalendarIconLucide className="mr-2 h-4 w-4" />{date ? formatDateFns(date, "PPP") : <span>Pick a date</span>}
                            </Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={setDate} initialFocus /></PopoverContent></Popover>
                        )}
                        {selectedBatchPropertyDetails.type === 'workflow_state' && currentWorkflow && (
                            <Select value={value} onValueChange={setValue}><SelectTrigger id="batch-workflow-state-value" className="col-span-3"><SelectValue placeholder="Select target state..." /></SelectTrigger>
                            <SelectContent>{currentWorkflow.states.map(state => (<SelectItem key={state.id} value={state.id}>{state.name}</SelectItem>))}</SelectContent></Select>
                        )}
                        {selectedBatchPropertyDetails.type === 'relationship' && relatedModelForBatchUpdate && (
                            <div className="col-span-3">
                                {selectedBatchPropertyDetails.relationshipType === 'many' ? (
                                    <MultiSelectAutocomplete options={relatedObjectsForBatchUpdateOptions} selected={Array.isArray(value) ? value : []} onChange={setValue} placeholder={`Select ${relatedModelForBatchUpdate.name}(s)...`} emptyIndicator={`No ${relatedModelForBatchUpdate.name.toLowerCase()}s found.`} />
                                ) : (
                                    <Select value={String(value) || INTERNAL_CLEAR_RELATIONSHIP_VALUE} onValueChange={(val) => setValue(val === INTERNAL_CLEAR_RELATIONSHIP_VALUE ? '' : val)}>
                                        <SelectTrigger><SelectValue placeholder={`Select ${relatedModelForBatchUpdate.name}...`} /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={INTERNAL_CLEAR_RELATIONSHIP_VALUE}>-- Clear Relationship --</SelectItem>
                                            {Object.entries(relatedObjectsForBatchUpdateGrouped).map(([namespace, options]) => (
                                                <SelectGroup key={namespace}><UiSelectLabel>{namespace}</UiSelectLabel>{options.map(o => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectGroup>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
            <BatchUpdateDialogFooter>
                <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isUpdating}>Cancel</Button>
                <Button onClick={onConfirm} disabled={!selectedBatchPropertyDetails || isUpdating} className="bg-primary hover:bg-primary/90">
                    {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Update Items"}
                </Button>
            </BatchUpdateDialogFooter>
        </DialogContent>
    </Dialog>
  );
}
