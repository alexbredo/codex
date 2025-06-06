
'use client';

import * as React from 'react';
import type { Model, DataObject, Property, WorkflowWithDetails, DataContextType } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Eye, Edit, Trash2, ArrowUp, ArrowDown, ChevronsUpDown, ArchiveRestore } from 'lucide-react';
import Link from 'next/link';
import { format as formatDateFns, isValid as isDateValidFn } from 'date-fns';
import { cn, getObjectDisplayValue } from '@/lib/utils';
import ColumnFilterPopover, { type ColumnFilterValue } from '@/components/objects/column-filter-popover';
import { StarDisplay } from '@/components/ui/star-display';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

// Column keys for metadata and actions, should match those in page.tsx
const SELECT_ALL_CHECKBOX_COLUMN_KEY = "select-all-checkbox";
const VIEW_ACTION_COLUMN_KEY = "view-action";
const ACTIONS_COLUMN_KEY = "actions";
const WORKFLOW_STATE_DISPLAY_COLUMN_KEY = "__WORKFLOW_STATE_DISPLAY_COLUMN__";
const OWNER_COLUMN_KEY = "__OWNER_COLUMN_KEY__";
const CREATED_AT_COLUMN_KEY = "__CREATED_AT_COLUMN_KEY__";
const UPDATED_AT_COLUMN_KEY = "__UPDATED_AT_COLUMN_KEY__";
const DELETED_AT_COLUMN_KEY = "__DELETED_AT_COLUMN_KEY__";


export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export interface IncomingRelationColumn {
  id: string;
  headerLabel: string;
  referencingModel: Model;
  referencingProperty: Property;
}

interface DataObjectsTableProps {
  model: Model;
  objectsToDisplay: DataObject[];
  allModels: Model[];
  allDbObjects: Record<string, DataObject[]>;
  currentWorkflow: WorkflowWithDetails | null;
  
  hiddenColumns: Set<string>;
  sortConfig: SortConfig | null;
  columnFilters: Record<string, ColumnFilterValue | null>;
  
  selectedObjectIds: Set<string>;
  isAllSelectedOnPage: boolean; // Specifically for the current page's selection state
  
  viewingRecycleBin: boolean;
  lastChangedInfo: { modelId: string, objectId: string, changeType: 'added' | 'updated' | 'restored' | 'deleted' } | null;
  
  virtualIncomingRelationColumns: IncomingRelationColumn[];

  // Callbacks
  requestSort: (key: string) => void;
  handleColumnFilterChange: (columnKey: string, filter: ColumnFilterValue | null) => void;
  handleSelectAllOnPage: (checked: boolean) => void;
  handleRowSelect: (objectId: string, checked: boolean) => void;
  handleView: (obj: DataObject) => void;
  handleEdit: (obj: DataObject) => void;
  handleDeleteObject: (objectId: string, objectName: string) => void;
  handleRestoreObject: (objectId: string, objectName: string) => void;
  getWorkflowStateName: (stateId: string | null | undefined) => string;
  getOwnerUsername: (ownerId: string | null | undefined) => string;
}

export default function DataObjectsTable({
  model,
  objectsToDisplay,
  allModels,
  allDbObjects,
  currentWorkflow,
  hiddenColumns,
  sortConfig,
  columnFilters,
  selectedObjectIds,
  isAllSelectedOnPage,
  viewingRecycleBin,
  lastChangedInfo,
  virtualIncomingRelationColumns,
  requestSort,
  handleColumnFilterChange,
  handleSelectAllOnPage,
  handleRowSelect,
  handleView,
  handleEdit,
  handleDeleteObject,
  handleRestoreObject,
  getWorkflowStateName,
  getOwnerUsername,
}: DataObjectsTableProps) {

  const getSortIcon = (columnKey: string) => {
    if (!sortConfig || sortConfig.key !== columnKey) {
      return <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />;
    }
    return sortConfig.direction === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
  };

  const displayDateCellContent = (isoDateString: string | undefined | null) => {
    if (!isoDateString) return <span className="text-muted-foreground">N/A</span>;
    try {
      const date = new Date(isoDateString);
      return isDateValidFn(date) ? formatDateFns(date, 'PP p') : <span className="text-muted-foreground italic">Invalid Date</span>;
    } catch {
      return <span className="text-muted-foreground italic">Error</span>;
    }
  };
  
  const displayCellContent = (obj: DataObject, property: Property) => {
    const value = obj[property.name];
    if (value === null || typeof value === 'undefined' || (Array.isArray(value) && value.length === 0) || String(value).trim() === '') {
      if (property.type === 'number' && property.unit) return <span className="text-muted-foreground">N/A ({property.unit})</span>;
      if (property.type === 'markdown') return <Badge variant="outline">Markdown</Badge>;
      if (property.type === 'image') return <Badge variant="outline">Image</Badge>;
      if (property.type === 'rating') return <StarDisplay rating={0} />;
      return <span className="text-muted-foreground">N/A</span>;
    }
    switch (property.type) {
      case 'boolean': return value ? <Badge variant="default" className="bg-green-500 hover:bg-green-600">Yes</Badge> : <Badge variant="secondary">No</Badge>;
      case 'date': try { const date = new Date(value); return isDateValidFn(date) ? formatDateFns(date, 'PP') : String(value); } catch { return String(value); }
      case 'number':
        const numValue = parseFloat(String(value));
        const precision = property.precision === undefined ? 2 : property.precision;
        const unitText = property.unit || '';
        const formattedValue = isNaN(numValue) ? <span className="text-muted-foreground">N/A{unitText ? ` (${unitText})` : ''}</span> : `${numValue.toFixed(precision)}${unitText ? ` ${unitText}` : ''}`;

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
            <div className="flex flex-col space-y-1 w-full max-w-[150px]">
              <span className="truncate" title={String(formattedValue)}>{formattedValue}</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                     <Progress value={percentage} className="h-2" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{`${percentage.toFixed(0)}% (Min: ${min}${unitText}, Max: ${max}${unitText})`}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          );
        }
        return formattedValue;
      case 'markdown': return <Badge variant="outline">Markdown</Badge>;
      case 'image':
        const imgUrl = String(value); return (
          <a href={imgUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center text-xs">
            <Link className="h-3 w-3 mr-1" href={imgUrl} /> {imgUrl.length > 30 ? imgUrl.substring(0, 27) + '...' : imgUrl} <Link className="h-3 w-3 ml-1 opacity-70" href={imgUrl} />
          </a>);
      case 'rating': return <StarDisplay rating={value as number} />;
      case 'relationship':
        if (!property.relatedModelId) return <span className="text-destructive">Config Err</span>;
        const relatedModelForCell = allModels.find(m => m.id === property.relatedModelId); 
        if (!relatedModelForCell) return <span className="text-destructive">Model N/A</span>;

        if (property.relationshipType === 'many') {
          if (!Array.isArray(value) || value.length === 0) return <span className="text-muted-foreground">N/A</span>;
          const relatedItems = value.map(itemId => { 
            const relatedObj = (allDbObjects[property.relatedModelId!] || []).find(o => o.id === itemId); 
            return { id: itemId, name: getObjectDisplayValue(relatedObj, relatedModelForCell, allModels, allDbObjects), obj: relatedObj }; 
          });
          if (relatedItems.length > 2) return <Badge variant="outline" title={relatedItems.map(i=>i.name).join(', ')}>{relatedItems.length} {relatedModelForCell.name}(s)</Badge>;
          return relatedItems.map(item => item.obj ? ( <Link key={item.id} href={`/data/${relatedModelForCell.id}/view/${item.obj.id}`} className="inline-block"> <Badge variant="outline" className="mr-1 mb-1 hover:bg-secondary">{item.name}</Badge> </Link> ) : ( <Badge key={item.id} variant="outline" className="mr-1 mb-1">{item.name}</Badge> ));
        } else {
          const relatedObj = (allDbObjects[property.relatedModelId] || []).find(o => o.id === value); 
          const displayVal = getObjectDisplayValue(relatedObj, relatedModelForCell, allModels, allDbObjects);
          return relatedObj ? ( <Link href={`/data/${relatedModelForCell.id}/view/${relatedObj.id}`} className="inline-block"> <Badge variant="outline" className="hover:bg-secondary">{displayVal}</Badge> </Link> ) : <span className="text-xs font-mono" title={String(value)}>{displayVal}</span>;
        }
      default: const strValue = String(value); return strValue.length > 50 ? <span title={strValue}>{strValue.substring(0, 47) + '...'}</span> : strValue;
    }
  };

  const directPropertiesToShowInTable = model.properties.sort((a,b) => a.orderIndex - b.orderIndex);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {!hiddenColumns.has(SELECT_ALL_CHECKBOX_COLUMN_KEY) && (
            <TableHead className="w-[60px] text-center">
              <Checkbox
                checked={isAllSelectedOnPage}
                onCheckedChange={handleSelectAllOnPage}
                aria-label="Select all rows on current page"
                className="mx-auto"
              />
            </TableHead>
          )}
          {!hiddenColumns.has(VIEW_ACTION_COLUMN_KEY) && <TableHead className="w-[60px] text-center">View</TableHead>}
          
          {directPropertiesToShowInTable.map((prop) => (
            !hiddenColumns.has(prop.id) && (
              <TableHead key={prop.id}>
                <div className="flex items-center">
                  <Button variant="ghost" onClick={() => requestSort(prop.id)} className="px-1 text-left justify-start flex-grow">
                    {prop.name} {getSortIcon(prop.id)}
                  </Button>
                  <ColumnFilterPopover
                    columnKey={prop.id}
                    columnName={prop.name}
                    property={prop}
                    currentFilter={columnFilters[prop.id] || null}
                    onFilterChange={handleColumnFilterChange}
                  />
                </div>
              </TableHead>
            )
          ))}

          {!hiddenColumns.has(CREATED_AT_COLUMN_KEY) && (
            <TableHead>
              <div className="flex items-center">
                <Button variant="ghost" onClick={() => requestSort(CREATED_AT_COLUMN_KEY)} className="px-1 text-left justify-start flex-grow">
                  Created At {getSortIcon(CREATED_AT_COLUMN_KEY)}
                </Button>
                <ColumnFilterPopover columnKey={CREATED_AT_COLUMN_KEY} columnName="Created At" property={{ type: 'date' } as Property} currentFilter={columnFilters[CREATED_AT_COLUMN_KEY] || null} onFilterChange={handleColumnFilterChange} />
              </div>
            </TableHead>
          )}
          {!hiddenColumns.has(UPDATED_AT_COLUMN_KEY) && (
            <TableHead>
              <div className="flex items-center">
                <Button variant="ghost" onClick={() => requestSort(UPDATED_AT_COLUMN_KEY)} className="px-1 text-left justify-start flex-grow">
                  Updated At {getSortIcon(UPDATED_AT_COLUMN_KEY)}
                </Button>
                <ColumnFilterPopover columnKey={UPDATED_AT_COLUMN_KEY} columnName="Updated At" property={{ type: 'date' } as Property} currentFilter={columnFilters[UPDATED_AT_COLUMN_KEY] || null} onFilterChange={handleColumnFilterChange} />
              </div>
            </TableHead>
          )}
          {viewingRecycleBin && !hiddenColumns.has(DELETED_AT_COLUMN_KEY) && (
            <TableHead>
              <div className="flex items-center">
                <Button variant="ghost" onClick={() => requestSort(DELETED_AT_COLUMN_KEY)} className="px-1 text-left justify-start flex-grow">
                  Deleted At {getSortIcon(DELETED_AT_COLUMN_KEY)}
                </Button>
                <ColumnFilterPopover columnKey={DELETED_AT_COLUMN_KEY} columnName="Deleted At" property={{ type: 'date' } as Property} currentFilter={columnFilters[DELETED_AT_COLUMN_KEY] || null} onFilterChange={handleColumnFilterChange} />
              </div>
            </TableHead>
          )}
          {currentWorkflow && !hiddenColumns.has(WORKFLOW_STATE_DISPLAY_COLUMN_KEY) && (
            <TableHead>
              <div className="flex items-center">
                <Button variant="ghost" onClick={() => requestSort(WORKFLOW_STATE_DISPLAY_COLUMN_KEY)} className="px-1 text-left justify-start flex-grow">
                  State {getSortIcon(WORKFLOW_STATE_DISPLAY_COLUMN_KEY)}
                </Button>
                <ColumnFilterPopover columnKey={WORKFLOW_STATE_DISPLAY_COLUMN_KEY} columnName="State" currentWorkflow={currentWorkflow} currentFilter={columnFilters[WORKFLOW_STATE_DISPLAY_COLUMN_KEY] || null} onFilterChange={handleColumnFilterChange} />
              </div>
            </TableHead>
          )}
          {!hiddenColumns.has(OWNER_COLUMN_KEY) && (
            <TableHead>
              <div className="flex items-center">
                <Button variant="ghost" onClick={() => requestSort(OWNER_COLUMN_KEY)} className="px-1 text-left justify-start flex-grow">
                  Owned By {getSortIcon(OWNER_COLUMN_KEY)}
                </Button>
                <ColumnFilterPopover columnKey={OWNER_COLUMN_KEY} columnName="Owned By" filterTypeOverride="relationship" currentFilter={columnFilters[OWNER_COLUMN_KEY] || null} onFilterChange={handleColumnFilterChange} />
              </div>
            </TableHead>
          )}
          {virtualIncomingRelationColumns.map((col) => (
            !hiddenColumns.has(col.id) && (
              <TableHead key={col.id} className="text-xs">
                <div className="flex items-center">
                  <Button variant="ghost" onClick={() => requestSort(col.id)} className="px-1 text-xs text-left justify-start flex-grow">
                    {col.headerLabel} {getSortIcon(col.id)}
                  </Button>
                  <ColumnFilterPopover columnKey={col.id} columnName={col.headerLabel} currentFilter={columnFilters[col.id] || null} onFilterChange={handleColumnFilterChange} filterTypeOverride="specificIncomingReference" referencingModel={col.referencingModel} referencingProperty={col.referencingProperty} />
                </div>
              </TableHead>
            )
          ))}
          {!hiddenColumns.has(ACTIONS_COLUMN_KEY) && <TableHead className="text-right w-[120px]">Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {objectsToDisplay.map((obj) => {
          const isHighlightedAdded = lastChangedInfo?.objectId === obj.id && lastChangedInfo?.modelId === model.id && lastChangedInfo?.changeType === 'added';
          const isHighlightedUpdated = lastChangedInfo?.objectId === obj.id && lastChangedInfo?.modelId === model.id && lastChangedInfo?.changeType === 'updated';
          const isHighlightedRestored = lastChangedInfo?.objectId === obj.id && lastChangedInfo?.modelId === model.id && lastChangedInfo?.changeType === 'restored';
          return (
            <TableRow key={obj.id} data-state={selectedObjectIds.has(obj.id) ? "selected" : ""} className={cn(isHighlightedAdded && "animate-highlight-green", isHighlightedUpdated && "animate-highlight-yellow", isHighlightedRestored && "animate-highlight-blue")}>
              {!hiddenColumns.has(SELECT_ALL_CHECKBOX_COLUMN_KEY) && (
                <TableCell className="text-center">
                  <Checkbox checked={selectedObjectIds.has(obj.id)} onCheckedChange={(checked) => handleRowSelect(obj.id, !!checked)} aria-label={`Select row ${obj.id}`} />
                </TableCell>
              )}
              {!hiddenColumns.has(VIEW_ACTION_COLUMN_KEY) && (
                <TableCell className="text-center">
                  <Button variant="ghost" size="sm" onClick={() => handleView(obj)} className="px-2 hover:text-primary">
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              )}
              {directPropertiesToShowInTable.map((prop) => (
                !hiddenColumns.has(prop.id) && <TableCell key={`${obj.id}-${prop.id}`}>{displayCellContent(obj, prop)}</TableCell>
              ))}
              {!hiddenColumns.has(CREATED_AT_COLUMN_KEY) && <TableCell>{displayDateCellContent(obj.createdAt)}</TableCell>}
              {!hiddenColumns.has(UPDATED_AT_COLUMN_KEY) && <TableCell>{displayDateCellContent(obj.updatedAt)}</TableCell>}
              {viewingRecycleBin && !hiddenColumns.has(DELETED_AT_COLUMN_KEY) && <TableCell>{displayDateCellContent(obj.deletedAt)}</TableCell>}
              {currentWorkflow && !hiddenColumns.has(WORKFLOW_STATE_DISPLAY_COLUMN_KEY) && (
                <TableCell><Badge variant={obj.currentStateId ? "outline" : "secondary"}>{getWorkflowStateName(obj.currentStateId)}</Badge></TableCell>
              )}
              {!hiddenColumns.has(OWNER_COLUMN_KEY) && <TableCell>{getOwnerUsername(obj.ownerId)}</TableCell>}
              {virtualIncomingRelationColumns.map((colDef) => {
                if (hiddenColumns.has(colDef.id)) return null;
                const referencingData = allDbObjects[colDef.referencingModel.id] || [];
                const linkedItems = referencingData.filter(refObj => {
                  const linkedValue = refObj[colDef.referencingProperty.name];
                  if (colDef.referencingProperty.relationshipType === 'many') return Array.isArray(linkedValue) && linkedValue.includes(obj.id);
                  return linkedValue === obj.id;
                });
                if (linkedItems.length === 0) return <TableCell key={colDef.id}><span className="text-muted-foreground">N/A</span></TableCell>;
                return (
                  <TableCell key={colDef.id} className="space-x-1 space-y-1">
                    {linkedItems.map(item => (
                      <Link key={item.id} href={`/data/${colDef.referencingModel.id}/view/${item.id}`} className="inline-block">
                        <Badge variant="secondary" className="hover:bg-muted cursor-pointer">
                          {getObjectDisplayValue(item, colDef.referencingModel, allModels, allDbObjects)}
                        </Badge>
                      </Link>
                    ))}
                  </TableCell>
                );
              })}
              {!hiddenColumns.has(ACTIONS_COLUMN_KEY) && (
                <TableCell className="text-right">
                  {viewingRecycleBin ? (
                    <Button variant="outline" size="sm" onClick={() => handleRestoreObject(obj.id, getObjectDisplayValue(obj, model, allModels, allDbObjects))} className="text-green-600 border-green-600/50 hover:bg-green-600/10 hover:text-green-600">
                      <ArchiveRestore className="h-4 w-4 mr-1" /> Restore
                    </Button>
                  ) : (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(obj)} className="px-2 mr-1 hover:text-primary">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="px-2 hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action will move this {model.name.toLowerCase()} object to the recycle bin.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteObject(obj.id, getObjectDisplayValue(obj, model, allModels, allDbObjects))}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
