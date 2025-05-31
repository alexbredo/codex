
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useData } from '@/contexts/data-context';
import type { Model, DataObject, Property, WorkflowWithDetails } from '@/lib/types';
import { PlusCircle, Edit, Trash2, Search, ArrowLeft, ListChecks, ArrowUp, ArrowDown, ChevronsUpDown, Download, Eye, LayoutGrid, List as ListIcon, ExternalLink, Image as ImageIcon, CheckCircle2, FilterX } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format as formatDateFns, isValid as isDateValid, startOfDay, isEqual as isEqualDate } from 'date-fns';
import Link from 'next/link';
import { getObjectDisplayValue } from '@/lib/utils';
import { StarDisplay } from '@/components/ui/star-display';
import GalleryCard from '@/components/objects/gallery-card';
import ColumnFilterPopover, { type ColumnFilterValue } from '@/components/objects/column-filter-popover';

const ITEMS_PER_PAGE = 10;
type ViewMode = 'table' | 'gallery';

type SortDirection = 'asc' | 'desc';
interface SortConfig {
  key: string;
  direction: SortDirection;
}

interface IncomingRelationColumn {
  id: string;
  headerLabel: string;
  referencingModel: Model;
  referencingProperty: Property;
}


export default function DataObjectsPage() {
  const router = useRouter();
  const params = useParams();
  const modelId = params.modelId as string;

  const {
    models: allModels,
    getModelById,
    getObjectsByModelId,
    deleteObject,
    getAllObjects,
    getWorkflowById,
    isReady
  } = useData();
  const { toast } = useToast();

  const [currentModel, setCurrentModel] = useState<Model | null>(null);
  const [objects, setObjects] = useState<DataObject[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowWithDetails | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilterValue | null>>({});


  const allDbObjects = useMemo(() => getAllObjects(), [getAllObjects, isReady]);

  const virtualIncomingRelationColumns = useMemo(() => {
    if (!currentModel || !isReady) return [];
    const columns: IncomingRelationColumn[] = [];
    allModels.forEach(otherModel => {
      if (otherModel.id === currentModel.id) return;
      otherModel.properties.forEach(prop => {
        if (prop.type === 'relationship' && prop.relatedModelId === currentModel.id) {
          columns.push({
            id: `${otherModel.id}-${prop.name}`,
            headerLabel: `Ref. by ${otherModel.name} (via ${prop.name})`,
            referencingModel: otherModel,
            referencingProperty: prop,
          });
        }
      });
    });
    return columns;
  }, [currentModel, allModels, isReady]);

  useEffect(() => {
    if (isReady && modelId) {
      const foundModel = getModelById(modelId);
      if (foundModel) {
        setCurrentModel(foundModel);
        if (foundModel.workflowId) {
          setCurrentWorkflow(getWorkflowById(foundModel.workflowId) || null);
        } else {
          setCurrentWorkflow(null);
        }
        const modelObjects = getObjectsByModelId(modelId);
        setObjects(modelObjects);

        const savedViewMode = sessionStorage.getItem(`codexStructure-viewMode-${modelId}`) as ViewMode | null;
        if (savedViewMode && (savedViewMode === 'table' || savedViewMode === 'gallery')) {
          setViewMode(savedViewMode);
        } else {
          setViewMode('table');
        }

      } else {
        toast({ variant: "destructive", title: "Error", description: "Model not found." });
        router.push('/models');
      }
    }
  }, [modelId, getModelById, getObjectsByModelId, getWorkflowById, isReady, toast, router]);

  const handleViewModeChange = (newMode: ViewMode) => {
    setViewMode(newMode);
    if (modelId) {
      sessionStorage.setItem(`codexStructure-viewMode-${modelId}`, newMode);
    }
  };

  const handleColumnFilterChange = useCallback((columnKey: string, filter: ColumnFilterValue | null) => {
    setColumnFilters(prev => {
      const newFilters = { ...prev };
      if (filter === null) {
        delete newFilters[columnKey];
      } else {
        newFilters[columnKey] = filter;
      }
      return newFilters;
    });
    setCurrentPage(1);
  }, []);

  const handleClearAllColumnFilters = () => {
    setColumnFilters({});
    setCurrentPage(1);
  };


  const handleCreateNew = () => {
    if (!currentModel) return;
    router.push(`/data/${currentModel.id}/new`);
  };

  const handleEdit = (obj: DataObject) => {
    if (!currentModel) return;
    router.push(`/data/${currentModel.id}/edit/${obj.id}`);
  };

  const handleView = (obj: DataObject) => {
    if (!currentModel) return;
    router.push(`/data/${currentModel.id}/view/${obj.id}`);
  };

  const handleDelete = async (objectId: string) => {
    if (!currentModel) return;
    try {
        await deleteObject(currentModel.id, objectId);
        setObjects(prev => prev.filter(obj => obj.id !== objectId));
        toast({ title: `${currentModel.name} Deleted`, description: `The ${currentModel.name.toLowerCase()} has been deleted.` });
    } catch (error: any) {
        toast({ variant: "destructive", title: "Error Deleting Object", description: error.message || "An unexpected error occurred." });
    }
  };

  const requestSort = (key: string) => {
    let direction: SortDirection = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };

  const getSortIcon = (columnKey: string) => {
    if (!sortConfig || sortConfig.key !== columnKey) {
      return <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />;
    }
    return sortConfig.direction === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
  };

  const getWorkflowStateName = useCallback((stateId: string | null | undefined): string => {
    if (!stateId || !currentWorkflow) return 'N/A';
    const state = currentWorkflow.states.find(s => s.id === stateId);
    return state ? state.name : 'Unknown State';
  }, [currentWorkflow]);

  const filteredObjects = useMemo(() => {
    if (!currentModel) return [];
    let searchableObjects = [...objects];

    if (searchTerm) {
      searchableObjects = searchableObjects.filter(obj => {
        const hasMatchingProperty = currentModel.properties.some(prop => {
          const value = obj[prop.name];
          if ((prop.type === 'string' || prop.type === 'number' || prop.type === 'markdown' || prop.type === 'image') && value !== null && value !== undefined) {
            return String(value).toLowerCase().includes(searchTerm.toLowerCase());
          }
          if (prop.type === 'relationship' && prop.relatedModelId) {
              const relatedModel = getModelById(prop.relatedModelId);
              if (Array.isArray(value)) {
                  return value.some(itemId => {
                      const relatedObj = (allDbObjects[prop.relatedModelId!] || []).find(o => o.id === itemId);
                      const displayVal = getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects);
                      return displayVal.toLowerCase().includes(searchTerm.toLowerCase());
                  });
              } else if (value) {
                  const relatedObj = (allDbObjects[prop.relatedModelId!] || []).find(o => o.id === value);
                  const displayVal = getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects);
                  return displayVal.toLowerCase().includes(searchTerm.toLowerCase());
              }
          }
          return false;
        });
        if (hasMatchingProperty) return true;

        if (currentWorkflow && obj.currentStateId) {
            const stateName = getWorkflowStateName(obj.currentStateId);
            if (stateName.toLowerCase().includes(searchTerm.toLowerCase())) {
                return true;
            }
        }
        return false;
      });
    }

    Object.entries(columnFilters).forEach(([columnKey, filter]) => {
      if (!filter || filter.value === '' || filter.value === null || filter.value === undefined) return;

      const property = currentModel.properties.find(p => p.id === columnKey);

      searchableObjects = searchableObjects.filter(obj => {
        if (columnKey === 'workflowState') {
          return obj.currentStateId === filter.value;
        }

        if (!property) return true;

        const value = obj[property.name];

        switch (property.type) {
          case 'string':
          case 'markdown':
          case 'image':
            return value !== null && value !== undefined && String(value).toLowerCase().includes(String(filter.value).toLowerCase());
          case 'number':
            const numValue = parseFloat(String(value));
            const filterNumValue = parseFloat(String(filter.value));
            if (isNaN(numValue) || isNaN(filterNumValue)) return false;
            switch (filter.operator) {
              case 'eq': return numValue === filterNumValue;
              case 'gt': return numValue > filterNumValue;
              case 'lt': return numValue < filterNumValue;
              case 'gte': return numValue >= filterNumValue;
              case 'lte': return numValue <= filterNumValue;
              default: return false;
            }
          case 'boolean':
            return (value === true || value === 1) === filter.value;
          case 'date':
            if (!value || !filter.value) return false;
            try {
              const objDate = startOfDay(new Date(value));
              const filterDate = startOfDay(new Date(filter.value));
              return isDateValid(objDate) && isDateValid(filterDate) && isEqualDate(objDate, filterDate);
            } catch {
              return false;
            }
          case 'rating':
            return Number(value) === Number(filter.value);
          case 'relationship':
            const filterRelId = String(filter.value);
            if (property.relationshipType === 'many') {
              return Array.isArray(value) && value.includes(filterRelId);
            } else {
              return value === filterRelId;
            }
          default:
            return true;
        }
      });
    });
    return searchableObjects;
  }, [objects, searchTerm, currentModel, columnFilters, getModelById, allDbObjects, allModels, currentWorkflow, getWorkflowStateName]);


  const sortedObjects = useMemo(() => {
    if (!sortConfig || !currentModel) {
      return filteredObjects;
    }

    return [...filteredObjects].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      const directPropertyToSort = currentModel.properties.find(p => p.id === sortConfig.key);
      const virtualColumnToSort = virtualIncomingRelationColumns.find(vc => vc.id === sortConfig.key);
      const isWorkflowStateSort = sortConfig.key === 'workflowState';


      if (directPropertyToSort) {
        aValue = a[directPropertyToSort.name];
        bValue = b[directPropertyToSort.name];

        switch (directPropertyToSort.type) {
          case 'string':
          case 'markdown':
          case 'image':
            aValue = String(aValue ?? '').toLowerCase();
            bValue = String(bValue ?? '').toLowerCase();
            break;
          case 'number':
          case 'rating':
            aValue = Number(aValue ?? Number.NEGATIVE_INFINITY);
            bValue = Number(bValue ?? Number.NEGATIVE_INFINITY);
            break;
          case 'boolean':
            aValue = aValue ? 1 : 0;
            bValue = bValue ? 1 : 0;
            break;
          case 'date':
            aValue = aValue ? new Date(aValue).getTime() : 0;
            bValue = bValue ? new Date(bValue).getTime() : 0;
            break;
          case 'relationship':
            const relatedModel = getModelById(directPropertyToSort.relatedModelId!);
            if (directPropertyToSort.relationshipType === 'many') {
              aValue = Array.isArray(aValue) ? aValue.length : 0;
              bValue = Array.isArray(bValue) ? bValue.length : 0;
            } else {
              const aRelatedObj = (allDbObjects[directPropertyToSort.relatedModelId!] || []).find(o => o.id === aValue);
              const bRelatedObj = (allDbObjects[directPropertyToSort.relatedModelId!] || []).find(o => o.id === bValue);
              aValue = getObjectDisplayValue(aRelatedObj, relatedModel, allModels, allDbObjects).toLowerCase();
              bValue = getObjectDisplayValue(bRelatedObj, relatedModel, allModels, allDbObjects).toLowerCase();
            }
            break;
          default:
            aValue = String(aValue ?? '').toLowerCase();
            bValue = String(bValue ?? '').toLowerCase();
        }
      } else if (virtualColumnToSort) {
        const aReferencingData = allDbObjects[virtualColumnToSort.referencingModel.id] || [];
        aValue = aReferencingData.filter(refObj => {
          const linkedValue = refObj[virtualColumnToSort.referencingProperty.name];
          return virtualColumnToSort.referencingProperty.relationshipType === 'many' ? (Array.isArray(linkedValue) && linkedValue.includes(a.id)) : linkedValue === a.id;
        }).length;

        const bReferencingData = allDbObjects[virtualColumnToSort.referencingModel.id] || [];
        bValue = bReferencingData.filter(refObj => {
          const linkedValue = refObj[virtualColumnToSort.referencingProperty.name];
          return virtualColumnToSort.referencingProperty.relationshipType === 'many' ? (Array.isArray(linkedValue) && linkedValue.includes(b.id)) : linkedValue === b.id;
        }).length;
      } else if (isWorkflowStateSort && currentWorkflow) {
        aValue = getWorkflowStateName(a.currentStateId).toLowerCase();
        bValue = getWorkflowStateName(b.currentStateId).toLowerCase();
      } else {
        return 0;
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [filteredObjects, sortConfig, currentModel, getModelById, allDbObjects, allModels, virtualIncomingRelationColumns, currentWorkflow, getWorkflowStateName]);


  const paginatedObjects = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedObjects.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [sortedObjects, currentPage]);

  const totalPages = Math.ceil(sortedObjects.length / ITEMS_PER_PAGE);

  const displayCellContent = (obj: DataObject, property: Property) => {
    const value = obj[property.name];
    if (value === null || typeof value === 'undefined' || (Array.isArray(value) && value.length === 0) || String(value).trim() === '') {
      if (property.type === 'number' && property.unit) {
        return <span className="text-muted-foreground">N/A ({property.unit})</span>;
      }
      if (property.type === 'markdown') return <Badge variant="outline">Markdown</Badge>;
      if (property.type === 'image') return <Badge variant="outline">Image</Badge>;
      if (property.type === 'rating') return <StarDisplay rating={0} />;
      return <span className="text-muted-foreground">N/A</span>;
    }

    switch (property.type) {
      case 'boolean':
        return value ? <Badge variant="default" className="bg-green-500 hover:bg-green-600">Yes</Badge> : <Badge variant="secondary">No</Badge>;
      case 'date':
        try {
          const date = new Date(value);
          return isDateValid(date) ? formatDateFns(date, 'PP') : String(value);
        } catch {
          return String(value);
        }
      case 'number':
        const precision = property.precision === undefined ? 2 : property.precision;
        const unitText = property.unit || '';
        const parsedValue = parseFloat(value);

        if (isNaN(parsedValue)) {
          const displayUnit = unitText ? ` (${unitText})` : '';
          return <span className="text-muted-foreground">N/A{displayUnit}</span>;
        }
        return `${parsedValue.toFixed(precision)}${unitText ? ` ${unitText}` : ''}`;
      case 'markdown':
        return <Badge variant="outline">Markdown</Badge>;
      case 'image':
        const imgUrl = String(value);
        return (
          <a href={imgUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center text-xs">
            <ImageIcon className="h-3 w-3 mr-1" />
            {imgUrl.length > 30 ? imgUrl.substring(0, 27) + '...' : imgUrl}
            <ExternalLink className="h-3 w-3 ml-1 opacity-70" />
          </a>
        );
      case 'rating':
        return <StarDisplay rating={value as number} />;
      case 'relationship':
        if (!property.relatedModelId) return <span className="text-destructive">Config Err</span>;
        const relatedModel = getModelById(property.relatedModelId);
        if (!relatedModel) return <span className="text-destructive">Model N/A</span>;

        if (property.relationshipType === 'many') {
          if (!Array.isArray(value) || value.length === 0) return <span className="text-muted-foreground">N/A</span>;
          const relatedItems = value.map(itemId => {
            const relatedObj = (allDbObjects[property.relatedModelId!] || []).find(o => o.id === itemId);
            return {
                id: itemId,
                name: getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects),
                obj: relatedObj
            };
          });
          if (relatedItems.length > 2) {
            return <Badge variant="outline" title={relatedItems.map(i=>i.name).join(', ')}>{relatedItems.length} {relatedModel.name}(s)</Badge>;
          }
          return relatedItems.map(item => item.obj ? (
            <Link key={item.id} href={`/data/${relatedModel.id}/edit/${item.obj.id}`} passHref legacyBehavior>
              <a className="inline-block"><Badge variant="outline" className="mr-1 mb-1 hover:bg-secondary">{item.name}</Badge></a>
            </Link>
          ) : (
            <Badge key={item.id} variant="outline" className="mr-1 mb-1">{item.name}</Badge>
          ));
        } else {
          const relatedObj = (allDbObjects[property.relatedModelId] || []).find(o => o.id === value);
          const displayVal = getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects);
          return relatedObj ? (
             <Link href={`/data/${relatedModel.id}/edit/${relatedObj.id}`} passHref legacyBehavior>
                <a className="inline-block"><Badge variant="outline" className="hover:bg-secondary">{displayVal}</Badge></a>
            </Link>
          ) : <span className="text-xs font-mono" title={String(value)}>{displayVal}</span>;
        }
      default:
        const strValue = String(value);
        return strValue.length > 50 ? <span title={strValue}>{strValue.substring(0, 47) + '...'}</span> : strValue;
    }
  };

  const escapeCsvCell = (cell: any): string => {
    if (cell === null || typeof cell === 'undefined') {
      return '';
    }
    const cellString = String(cell);
    if (cellString.search(/("|,|\n)/g) >= 0) {
      return `"${cellString.replace(/"/g, '""')}"`;
    }
    return cellString;
  };

  const handleExportCSV = () => {
    if (!currentModel || sortedObjects.length === 0) {
      toast({
        title: "No Data to Export",
        description: "There is no data available for the current selection to export.",
        variant: "destructive",
      });
      return;
    }

    const headers: string[] = [];
    currentModel.properties.forEach(prop => headers.push(prop.name));
    if (currentWorkflow) {
      headers.push("Workflow State");
    }
    virtualIncomingRelationColumns.forEach(col => headers.push(col.headerLabel));

    const csvRows: string[] = [headers.map(escapeCsvCell).join(',')];

    sortedObjects.forEach(obj => {
      const row: string[] = [];
      currentModel.properties.forEach(prop => {
        const value = obj[prop.name];
        let cellValue = '';
        if (value === null || typeof value === 'undefined') {
          cellValue = '';
        } else {
          switch (prop.type) {
            case 'boolean':
              cellValue = value ? 'Yes' : 'No';
              break;
            case 'date':
              try {
                const date = new Date(value);
                cellValue = isDateValid(date) ? formatDateFns(date, 'yyyy-MM-dd') : String(value);
              } catch { cellValue = String(value); }
              break;
            case 'number':
              const precision = prop.precision === undefined ? 2 : prop.precision;
              const parsedNum = parseFloat(value);
              cellValue = isNaN(parsedNum) ? String(value) : parsedNum.toFixed(precision);
              break;
            case 'markdown':
            case 'image':
              cellValue = String(value);
              break;
            case 'rating':
              cellValue = (value && Number(value) > 0) ? `${Number(value)}/5` : '';
              break;
            case 'relationship':
              const relatedModel = getModelById(prop.relatedModelId!);
              if (prop.relationshipType === 'many') {
                if (Array.isArray(value) && value.length > 0) {
                  cellValue = value.map(itemId => {
                    const relatedObj = (allDbObjects[prop.relatedModelId!] || []).find(o => o.id === itemId);
                    return getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects);
                  }).join('; ');
                } else {
                  cellValue = '';
                }
              } else {
                const relatedObj = (allDbObjects[prop.relatedModelId!] || []).find(o => o.id === value);
                cellValue = getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects);
              }
              break;
            default:
              cellValue = String(value);
          }
        }
        row.push(escapeCsvCell(cellValue));
      });

      if (currentWorkflow) {
        row.push(escapeCsvCell(getWorkflowStateName(obj.currentStateId)));
      }

      virtualIncomingRelationColumns.forEach(colDef => {
        const referencingData = allDbObjects[colDef.referencingModel.id] || [];
        const linkedItems = referencingData.filter(refObj => {
          const linkedValue = refObj[colDef.referencingProperty.name];
          if (colDef.referencingProperty.relationshipType === 'many') {
            return Array.isArray(linkedValue) && linkedValue.includes(obj.id);
          }
          return linkedValue === obj.id;
        });
        if (linkedItems.length > 0) {
          row.push(escapeCsvCell(linkedItems.map(item => getObjectDisplayValue(item, colDef.referencingModel, allModels, allDbObjects)).join('; ')));
        } else {
          row.push('');
        }
      });
      csvRows.push(row.join(','));
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${currentModel.name}-data.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({ title: "Export Successful", description: `${currentModel.name} data has been exported to CSV.` });
    } else {
      toast({ variant: "destructive", title: "Export Failed", description: "Your browser doesn't support this feature." });
    }
  };


  if (!isReady || !currentModel) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-lg text-muted-foreground">Loading data objects...</p>
      </div>
    );
  }

  const directPropertiesToShowInTable = currentModel.properties.sort((a,b) => a.orderIndex - b.orderIndex);
  const hasActiveColumnFilters = Object.keys(columnFilters).length > 0;

  return (
    <div className="container mx-auto py-8">
      <Button variant="outline" onClick={() => router.push('/models')} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Model Admin
      </Button>

      <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="text-center md:text-left">
          <h1 className="text-3xl font-bold text-primary">Data for: {currentModel.name}</h1>
          <p className="text-muted-foreground">{currentModel.description || 'Manage data entries for this model.'}</p>
          {currentWorkflow && <Badge variant="secondary" className="mt-1">Workflow: {currentWorkflow.name}</Badge>}
        </div>
         <div className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-grow md:flex-grow-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder={`Search ${currentModel.name.toLowerCase()}s...`}
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1);}}
                    className="pl-10 w-full md:w-64"
                />
            </div>
            <div className="flex items-center border rounded-md">
              <Button
                variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => handleViewModeChange('table')}
                className="rounded-r-none"
                aria-label="Table View"
              >
                <ListIcon className="h-5 w-5" />
              </Button>
              <Button
                variant={viewMode === 'gallery' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => handleViewModeChange('gallery')}
                className="rounded-l-none border-l"
                aria-label="Gallery View"
              >
                <LayoutGrid className="h-5 w-5" />
              </Button>
            </div>
            <Button onClick={handleExportCSV} variant="outline">
                <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
            <Button onClick={handleCreateNew} className="bg-accent text-accent-foreground hover:bg-accent/90">
                <PlusCircle className="mr-2 h-4 w-4" /> Create New
            </Button>
        </div>
      </header>
        {hasActiveColumnFilters && (
            <div className="mb-4 flex justify-end">
            <Button
                variant="outline"
                size="sm"
                onClick={handleClearAllColumnFilters}
                className="text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
            >
                <FilterX className="mr-2 h-4 w-4" /> Clear All Column Filters
            </Button>
            </div>
        )}
      {filteredObjects.length === 0 && !searchTerm && !hasActiveColumnFilters ? (
        <Card className="text-center py-12">
          <CardContent>
            <ListChecks size={48} className="mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold">No Data Objects Found</h3>
            <p className="text-muted-foreground mb-4">
              There are no data objects for the model "{currentModel.name}" yet.
            </p>
             <Button onClick={handleCreateNew} variant="default">
                <PlusCircle className="mr-2 h-4 w-4" /> Create First Object
            </Button>
          </CardContent>
        </Card>
      ) : sortedObjects.length === 0 && (searchTerm || hasActiveColumnFilters) ? (
         <Card className="text-center py-12">
          <CardContent>
            <Search size={48} className="mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold">No Results Found</h3>
            <p className="text-muted-foreground mb-4">
              Your {searchTerm && hasActiveColumnFilters ? "search and column filters" : searchTerm ? "search" : "column filters"} did not match any {currentModel.name.toLowerCase()}s.
            </p>
            {hasActiveColumnFilters && (
              <Button
                variant="link"
                onClick={handleClearAllColumnFilters}
                className="text-primary"
              >
                 Clear column filters to see all results.
              </Button>
            )}
          </CardContent>
        </Card>
      ) : viewMode === 'table' ? (
        <Card className="shadow-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px] text-center">View</TableHead>
                {directPropertiesToShowInTable.map((prop) => (
                  <TableHead key={prop.id}>
                    <div className="flex items-center">
                      <Button variant="ghost" onClick={() => requestSort(prop.id)} className="px-1 text-left justify-start flex-grow">
                        {prop.name}
                        {getSortIcon(prop.id)}
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
                ))}
                {currentWorkflow && (
                    <TableHead>
                      <div className="flex items-center">
                        <Button variant="ghost" onClick={() => requestSort('workflowState')} className="px-1 text-left justify-start flex-grow">
                        State
                        {getSortIcon('workflowState')}
                        </Button>
                        <ColumnFilterPopover
                            columnKey="workflowState"
                            columnName="State"
                            currentWorkflow={currentWorkflow}
                            currentFilter={columnFilters['workflowState'] || null}
                            onFilterChange={handleColumnFilterChange}
                        />
                      </div>
                    </TableHead>
                )}
                {virtualIncomingRelationColumns.map((col) => (
                  <TableHead key={col.id} className="text-xs">
                     <Button variant="ghost" onClick={() => requestSort(col.id)} className="px-1 text-xs text-left justify-start flex-grow">
                      {col.headerLabel}
                      {getSortIcon(col.id)}
                    </Button>
                  </TableHead>
                ))}
                <TableHead className="text-right w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedObjects.map((obj) => (
                <TableRow key={obj.id}>
                  <TableCell className="text-center">
                    <Button variant="ghost" size="icon" onClick={() => handleView(obj)} className="hover:text-primary">
                        <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                  {directPropertiesToShowInTable.map((prop) => (
                    <TableCell key={`${obj.id}-${prop.id}`}>
                      {displayCellContent(obj, prop)}
                    </TableCell>
                  ))}
                  {currentWorkflow && (
                    <TableCell>
                        <Badge variant={obj.currentStateId ? "outline" : "secondary"}>
                            {getWorkflowStateName(obj.currentStateId)}
                        </Badge>
                    </TableCell>
                  )}
                  {virtualIncomingRelationColumns.map((colDef) => {
                    const referencingData = allDbObjects[colDef.referencingModel.id] || [];
                    const linkedItems = referencingData.filter(refObj => {
                      const linkedValue = refObj[colDef.referencingProperty.name];
                      if (colDef.referencingProperty.relationshipType === 'many') {
                        return Array.isArray(linkedValue) && linkedValue.includes(obj.id);
                      }
                      return linkedValue === obj.id;
                    });

                    if (linkedItems.length === 0) {
                      return <TableCell key={colDef.id}><span className="text-muted-foreground">N/A</span></TableCell>;
                    }

                    return (
                      <TableCell key={colDef.id} className="space-x-1 space-y-1">
                        {linkedItems.map(item => (
                          <Link key={item.id} href={`/data/${colDef.referencingModel.id}/edit/${item.id}`} passHref legacyBehavior>
                            <a className="inline-block">
                              <Badge variant="secondary" className="hover:bg-muted cursor-pointer">
                                {getObjectDisplayValue(item, colDef.referencingModel, allModels, allDbObjects)}
                              </Badge>
                            </a>
                          </Link>
                        ))}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(obj)} className="mr-2 hover:text-primary">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete this {currentModel.name.toLowerCase()} object.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(obj.id)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {paginatedObjects.map((obj) => (
            <GalleryCard
              key={obj.id}
              obj={obj}
              model={currentModel}
              allModels={allModels}
              allObjects={allDbObjects}
              currentWorkflow={currentWorkflow}
              getWorkflowStateName={getWorkflowStateName}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center items-center space-x-2 mt-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
