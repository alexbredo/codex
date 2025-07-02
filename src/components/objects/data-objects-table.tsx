

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
import { Eye, Edit, Trash2, ArrowUp, ArrowDown, ChevronsUpDown, ArchiveRestore, Paperclip, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { format as formatDateFns, isValid as isDateValidFn } from 'date-fns';
import { cn, getObjectDisplayValue } from '@/lib/utils';
import ColumnFilterPopover, { type ColumnFilterValue } from '@/components/objects/column-filter-popover';
import { StarDisplay } from '@/components/ui/star-display';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader as LightboxDialogHeader,
  DialogTitle as LightboxDialogTitle,
  DialogDescription as LightboxDialogDescription,
} from "@/components/ui/dialog";
import Image from 'next/image';

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
  handleDeleteRequest: (obj: DataObject) => void;
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
  handleDeleteRequest,
  handleRestoreObject,
  getWorkflowStateName,
  getOwnerUsername,
}: DataObjectsTableProps) {
  const [lightboxImageUrl, setLightboxImageUrl] = React.useState<string | null>(null);

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
      if (property.type === 'fileAttachment') return <Badge variant="outline">File</Badge>;
      if (property.type === 'url') return <Badge variant="outline">URL</Badge>;
      if (property.type === 'rating') return <StarDisplay rating={0} />;
      return <span className="text-muted-foreground">N/A</span>;
    }
    switch (property.type) {
      case 'boolean': return value ? <Badge variant="default" className="bg-green-500 hover:bg-green-600">Yes</Badge> : <Badge variant="secondary">No</Badge>;
      case 'date': try { const date = new Date(value); return isDateValidFn(date) ? formatDateFns(date, 'PP') : String(value); } catch { return String(value); }
      case 'time': return <span className="font-mono">{value}</span>;
      case 'datetime': try { const date = new Date(value); return isDateValidFn(date) ? formatDateFns(date, 'PPp') : String(value); } catch { return String(value); }
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
        const imgUrl = String(value);
        if (!imgUrl) return <Badge variant="outline">Image</Badge>;
        const placeholderImage = `https://placehold.co/100x100.png`;
        return (
          <button
            onClick={() => setLightboxImageUrl(imgUrl)}
            className="w-16 h-16 rounded-md overflow-hidden border p-0.5 hover:ring-2 hover:ring-primary focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label={`View image for ${property.name}`}
          >
            <Image
              src={imgUrl}
              alt={property.name}
              width={64}
              height={64}
              className="w-full h-full object-cover rounded-sm"
              onError={(e) => { (e.target as HTMLImageElement).src = placeholderImage; }}
            />
          </button>
        );
      case 'fileAttachment':
        if (typeof value === 'object' && value.url && value.name) {
          return (
            <a href={value.url} download={value.name} className="text-primary hover:underline inline-flex items-center text-xs">
              <Paperclip className="h-3 w-3 mr-1" /> {value.name}
            </a>
          );
        }
        return <Badge variant="outline">File</Badge>;
      case 'url':
        if (typeof value === 'object' && value !== null && value.url) {
          return (
            <a href={value.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 text-xs" title={value.url}>
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate">{value.title || value.url}</span>
            </a>
          );
        }
        return <span className="text-muted-foreground italic">N/A</span>;
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
    <>
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
                        <Button variant="ghost" size="sm" className="px-2 hover:text-destructive" onClick={() => handleDeleteRequest(obj)}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Dialog open={!!lightboxImageUrl} onOpenChange={(open) => !open && setLightboxImageUrl(null)}>
        <DialogContent className="w-[90vw] max-w-[1600px] bg-transparent border-0 p-0 shadow-none">
          <LightboxDialogHeader className="sr-only">
            <LightboxDialogTitle>Image Lightbox</LightboxDialogTitle>
            <LightboxDialogDescription>A larger view of the selected image. Click outside the image or press escape to close.</LightboxDialogDescription>
          </LightboxDialogHeader>
          {lightboxImageUrl && (
            <Image
              src={lightboxImageUrl}
              alt="Lightbox view"
              width={1920}
              height={1080}
              className="w-full h-auto object-contain max-h-[90vh] rounded-lg"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://placehold.co/800x600.png`;
                (e.target as HTMLImageElement).alt = 'Image failed to load';
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
