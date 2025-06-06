
'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/button'; // Imported buttonVariants
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter as BatchUpdateDialogFooter, 
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, 
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel as UiSelectLabel, 
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useData } from '@/contexts/data-context';
import type { Model, DataObject, Property, WorkflowWithDetails, WorkflowStateWithSuccessors, DataContextType } from '@/lib/types';
import { PlusCircle, Edit, Trash2, Search, ArrowLeft, ListChecks, ArrowUp, ArrowDown, ChevronsUpDown, Download, Eye, LayoutGrid, List as ListIcon, ExternalLink, Image as ImageIcon, CheckCircle2, FilterX, X as XIcon, Settings as SettingsIcon, Edit3, Workflow as WorkflowIconLucide, CalendarIcon as CalendarIconLucideLucide, Star, RefreshCw, Loader2, Kanban as KanbanIcon, Rows } from 'lucide-react'; 
import { useToast } from "@/hooks/use-toast";
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format as formatDateFns, isValid as isDateValidFn, startOfDay, isEqual as isEqualDate } from 'date-fns';
import Link from 'next/link';
import { getObjectDisplayValue, cn, getObjectGroupValue } from '@/lib/utils';
import { StarDisplay } from '@/components/ui/star-display';
import { StarRatingInput } from '@/components/ui/star-rating-input';
import GalleryCard from '@/components/objects/gallery-card';
import ColumnFilterPopover, { type ColumnFilterValue } from '@/components/objects/column-filter-popover';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { MultiSelectAutocomplete, type MultiSelectOption } from '@/components/ui/multi-select-autocomplete';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import KanbanBoard from '@/components/objects/kanban-board';


const ITEMS_PER_PAGE = 10;
type ViewMode = 'table' | 'gallery' | 'kanban';

type SortDirection = 'asc' | 'desc';
interface SortConfig {
  key: string;
  direction: SortDirection;
}

interface IncomingRelationColumn {
  id: string; // Unique ID for the virtual column, e.g., `incoming-${referencingModel.id}-${referencingProperty.name}`
  headerLabel: string; // Label for the table header, e.g., "Ref. by Orders (via Customer)"
  referencingModel: Model; // The model that is pointing to the currentModel
  referencingProperty: Property; // The 'relationship' property in referencingModel that points here
}

const INTERNAL_NO_REFERENCES_VALUE = "__NO_REFERENCES__";
const INTERNAL_WORKFLOW_STATE_UPDATE_KEY = "__workflowStateUpdate__";
const INTERNAL_CLEAR_RELATIONSHIP_VALUE = "__CLEAR_RELATIONSHIP__";
const NO_GROUPING_VALUE = "__NO_GROUPING__";
const WORKFLOW_STATE_GROUPING_KEY = "__WORKFLOW_STATE_GROUPING__";


export default function DataObjectsPage() {
  const router = useRouter();
  const params = useParams();
  const modelIdFromUrl = params.modelId as string;

  const dataContext = useData();
  const {
    models: allModels,
    objects, 
    getModelById,
    getObjectsByModelId,
    deleteObject,
    updateObject, 
    getAllObjects,
    getWorkflowById,
    isReady: dataContextIsReady,
    fetchData,
    lastChangedInfo,
  }: DataContextType = dataContext;
  const { toast } = useToast();

  const [currentModel, setCurrentModel] = useState<Model | null>(null);
  const [localObjects, setLocalObjects] = useState<DataObject[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowWithDetails | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilterValue | null>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isBatchUpdating, setIsBatchUpdating] = useState(false);

  const [selectedObjectIds, setSelectedObjectIds] = useState<Set<string>>(new Set());
  const [isBatchUpdateDialogOpen, setIsBatchUpdateDialogOpen] = useState(false);
  const [batchUpdateProperty, setBatchUpdateProperty] = useState<string>('');
  const [batchUpdateValue, setBatchUpdateValue] = useState<any>('');
  const [batchUpdateDate, setBatchUpdateDate] = useState<Date | undefined>(undefined);

  const [groupingPropertyKey, setGroupingPropertyKey] = useState<string | null>(null);


  const previousModelIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (dataContextIsReady && modelIdFromUrl) {
      const foundModel = getModelById(modelIdFromUrl);

      if (foundModel) {
        const isTrulyDifferentModel = previousModelIdRef.current !== modelIdFromUrl;
        setCurrentModel(foundModel);
        setLocalObjects(getObjectsByModelId(foundModel.id));

        const savedViewMode = sessionStorage.getItem(`codexStructure-viewMode-${foundModel.id}`) as ViewMode | null;
        const savedGroupingKey = sessionStorage.getItem(`codexStructure-grouping-${foundModel.id}`);
        if (savedGroupingKey && savedGroupingKey !== NO_GROUPING_VALUE) {
            setGroupingPropertyKey(savedGroupingKey);
        } else {
            setGroupingPropertyKey(null);
        }


        if (foundModel.workflowId) {
          const wf = getWorkflowById(foundModel.workflowId);
          setCurrentWorkflow(wf || null);
          if (savedViewMode && (['table', 'gallery', 'kanban'] as ViewMode[]).includes(savedViewMode)) {
            setViewMode(savedViewMode);
          } else if (wf && !savedViewMode) { 
             setViewMode('kanban');
          } else { 
             setViewMode(savedViewMode || 'table');
          }
        } else {
          setCurrentWorkflow(null);
           if (savedViewMode && (['table', 'gallery'] as ViewMode[]).includes(savedViewMode)) {
            setViewMode(savedViewMode);
          } else {
            setViewMode('table');
          }
        }

        if (isTrulyDifferentModel) {
          fetchData(`Model ID Change to ${foundModel.name}`);
          setSearchTerm('');
          setCurrentPage(1);
          setSortConfig(null);
          setColumnFilters({});
          setSelectedObjectIds(new Set());
          previousModelIdRef.current = modelIdFromUrl;
        }
      } else {
        toast({ variant: "destructive", title: "Error", description: `Model with ID ${modelIdFromUrl} not found.` });
        router.push('/models');
        previousModelIdRef.current = null;
      }
    }
  }, [modelIdFromUrl, dataContextIsReady, getModelById, getWorkflowById, getObjectsByModelId, fetchData, toast, router]);

  useEffect(() => {
    if (dataContextIsReady && currentModel) {
      setLocalObjects(getObjectsByModelId(currentModel.id));
    }
  }, [objects, currentModel, dataContextIsReady, getObjectsByModelId]);


  useEffect(() => {
    if (currentModel && groupingPropertyKey !== null) {
      sessionStorage.setItem(`codexStructure-grouping-${currentModel.id}`, groupingPropertyKey);
    } else if (currentModel && groupingPropertyKey === null) {
      sessionStorage.setItem(`codexStructure-grouping-${currentModel.id}`, NO_GROUPING_VALUE);
    }
  }, [groupingPropertyKey, currentModel]);


  const virtualIncomingRelationColumns: IncomingRelationColumn[] = useMemo(() => {
    if (!currentModel || !dataContextIsReady) return [];
    const columns: IncomingRelationColumn[] = [];
    allModels.forEach(otherModel => {
      if (otherModel.id === currentModel.id) return;
      otherModel.properties.forEach(prop => {
        if (prop.type === 'relationship' && prop.relatedModelId === currentModel.id) {
          columns.push({
            id: `incoming-${otherModel.id}-${prop.name}`,
            headerLabel: `Ref. by ${otherModel.name} (via ${prop.name})`,
            referencingModel: otherModel,
            referencingProperty: prop,
          });
        }
      });
    });
    return columns.sort((a,b) => a.headerLabel.localeCompare(b.headerLabel));
  }, [currentModel, allModels, dataContextIsReady]);


  const groupableProperties = useMemo(() => {
    if (!currentModel) return [];
    const props = currentModel.properties.filter(
      p => ['string', 'number', 'boolean', 'date', 'rating'].includes(p.type) ||
           (p.type === 'relationship' && p.relationshipType === 'one')
    ).map(p => ({ id: p.id, name: p.name, isWorkflowState: false, isIncomingRelation: false }))
     .sort((a,b) => a.name.localeCompare(b.name));

    if (currentWorkflow && currentWorkflow.states.length > 0) {
        props.unshift({ id: WORKFLOW_STATE_GROUPING_KEY, name: "Workflow State", isWorkflowState: true, isIncomingRelation: false });
    }

    virtualIncomingRelationColumns.forEach(vCol => {
        props.push({ id: vCol.id, name: vCol.headerLabel, isWorkflowState: false, isIncomingRelation: true });
    });

    return props;
  }, [currentModel, currentWorkflow, virtualIncomingRelationColumns]);



  const batchUpdatableProperties = useMemo(() => {
    if (!currentModel) return [];
    const props = currentModel.properties.filter(
      (p) => (p.type === 'boolean' || p.type === 'string' || p.type === 'number' || p.type === 'date' || p.type === 'relationship' || p.type === 'rating') &&
             !p.name.toLowerCase().includes('markdown') &&
             !p.name.toLowerCase().includes('image')
    );
    const updatable = props.map(p => ({
        name: p.name,
        type: p.type,
        id: p.id,
        label: `${p.name} (${
            p.type === 'relationship' ? `Relationship to ${getModelById(p.relatedModelId!)?.name || 'Unknown'}`
            : p.type === 'rating' ? 'Rating (0-5)'
            : p.type
        })`,
        relationshipType: p.relationshipType,
        relatedModelId: p.relatedModelId
    }));

    if (currentWorkflow && currentWorkflow.states.length > 0) {
        updatable.unshift({ name: INTERNAL_WORKFLOW_STATE_UPDATE_KEY, type: 'workflow_state', id: INTERNAL_WORKFLOW_STATE_UPDATE_KEY, label: 'Workflow State', relationshipType: undefined, relatedModelId: undefined });
    }
    return updatable;
  }, [currentModel, currentWorkflow, getModelById]);

  const selectedBatchPropertyDetails = useMemo(() => {
    if (batchUpdateProperty === INTERNAL_WORKFLOW_STATE_UPDATE_KEY) {
        return { name: INTERNAL_WORKFLOW_STATE_UPDATE_KEY, type: 'workflow_state' as Property['type'], id: INTERNAL_WORKFLOW_STATE_UPDATE_KEY, label: 'Workflow State', relationshipType: undefined, relatedModelId: undefined };
    }
    return batchUpdatableProperties.find(p => p.name === batchUpdateProperty);
  }, [batchUpdateProperty, batchUpdatableProperties]);

  useEffect(() => {
    if (selectedBatchPropertyDetails?.type === 'rating') {
        setBatchUpdateValue(0);
    } else if (selectedBatchPropertyDetails?.type === 'date') {
        setBatchUpdateDate(undefined);
        setBatchUpdateValue('');
    } else if (selectedBatchPropertyDetails?.type === 'relationship') {
        setBatchUpdateValue(selectedBatchPropertyDetails.relationshipType === 'many' ? [] : '');
    } else {
        setBatchUpdateValue('');
    }
  }, [selectedBatchPropertyDetails]);


  const relatedModelForBatchUpdate = useMemo(() => {
    if (selectedBatchPropertyDetails?.type === 'relationship' && selectedBatchPropertyDetails.relatedModelId) {
        return getModelById(selectedBatchPropertyDetails.relatedModelId);
    }
    return undefined;
  }, [selectedBatchPropertyDetails, getModelById]);

  const allDbObjects = useMemo(() => getAllObjects(), [getAllObjects, dataContextIsReady]);

  const relatedObjectsForBatchUpdateOptions = useMemo(() => {
    if (relatedModelForBatchUpdate && relatedModelForBatchUpdate.id) {
        const relatedObjects = getObjectsByModelId(relatedModelForBatchUpdate.id);
        return relatedObjects.map(obj => ({
            value: obj.id,
            label: getObjectDisplayValue(obj, relatedModelForBatchUpdate, allModels, allDbObjects),
        })).sort((a, b) => a.label.localeCompare(b.label));
    }
    return [];
  }, [relatedModelForBatchUpdate, getObjectsByModelId, allModels, allDbObjects]);

  const relatedObjectsForBatchUpdateGrouped = useMemo(() => {
    if (relatedModelForBatchUpdate && relatedModelForBatchUpdate.id) {
        const relatedObjects = getObjectsByModelId(relatedModelForBatchUpdate.id);
        return relatedObjects.reduce((acc, obj) => {
            const namespace = allModels.find(m => m.id === relatedModelForBatchUpdate.id)?.namespace || 'Default';
            if (!acc[namespace]) {
                acc[namespace] = [];
            }
            acc[namespace].push({
                value: obj.id,
                label: getObjectDisplayValue(obj, relatedModelForBatchUpdate, allModels, allDbObjects),
            });
            return acc;
        }, {} as Record<string, MultiSelectOption[]>);
    }
    return {};
  }, [relatedModelForBatchUpdate, getObjectsByModelId, allModels, allDbObjects]);



  const handleViewModeChange = (newMode: ViewMode) => {
    setViewMode(newMode);
    if (currentModel) {
      sessionStorage.setItem(`codexStructure-viewMode-${currentModel.id}`, newMode);
    }
  };

  const handleColumnFilterChange = useCallback((columnKey: string, filter: ColumnFilterValue | null) => {
    setColumnFilters(prev => {
      const newFilters = { ...prev };
      if (filter === null || filter.value === '' || filter.value === null || filter.value === undefined) {
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

  const getWorkflowStateName = useCallback((stateId: string | null | undefined): string => {
    if (!stateId || !currentWorkflow) return 'N/A (No State)';
    const state = currentWorkflow.states.find(s => s.id === stateId);
    return state ? state.name : 'Unknown State';
  }, [currentWorkflow]);

  const getFilterDisplayDetails = useCallback((columnKey: string, filter: ColumnFilterValue): { columnName: string; displayValue: string; operator: string } | null => {
    if (!currentModel && !virtualIncomingRelationColumns.some(vc => vc.id === columnKey)) return null;

    let columnName = '';
    let displayValue = String(filter.value);
    let operator = filter.operator || '=';

    const property = currentModel?.properties.find(p => p.id === columnKey);
    const virtualCol = virtualIncomingRelationColumns.find(vc => vc.id === columnKey);

    if (columnKey === WORKFLOW_STATE_GROUPING_KEY) { 
      columnName = 'State';
      const state = currentWorkflow?.states.find(s => s.id === filter.value);
      displayValue = state ? state.name : 'Unknown State';
    } else if (property) {
      columnName = property.name;
      switch (property.type) {
        case 'boolean':
          displayValue = filter.value ? 'Yes' : 'No';
          break;
        case 'date':
          try {
            displayValue = formatDateFns(new Date(filter.value), 'PP');
          } catch { displayValue = 'Invalid Date'; }
          break;
        case 'rating':
          displayValue = `${filter.value} Star(s)`;
          break;
        case 'relationship':
          if (property.relatedModelId) {
            const relatedModel = getModelById(property.relatedModelId);
            const relatedObj = (allDbObjects[property.relatedModelId] || []).find(o => o.id === filter.value);
            displayValue = getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects);
          } else {
            displayValue = 'N/A (Config Error)';
          }
          operator = property.relationshipType === 'many' ? 'includes' : '=';
          break;
      }
    } else if (virtualCol) {
        columnName = virtualCol.headerLabel;
        if (filter.operator === 'specific_incoming_reference') {
            if (filter.value === INTERNAL_NO_REFERENCES_VALUE) {
                displayValue = "No References";
                operator = "has";
            } else {
                const referencingObject = (allDbObjects[virtualCol.referencingModel.id] || []).find(o => o.id === filter.value);
                displayValue = getObjectDisplayValue(referencingObject, virtualCol.referencingModel, allModels, allDbObjects);
                operator = "by";
            }
        } else { 
            if (filter.value === true) displayValue = "Yes";
            else if (filter.value === false) displayValue = "No";
            else displayValue = "Any";
            operator = "has";
        }
    } else {
      return null;
    }

    const operatorDisplayMap: Record<string, string> = {
        'eq': '=', 'gt': '>', 'lt': '<', 'gte': '>=', 'lte': '<=',
        'contains': 'contains', 'date_eq': '=', 'includes': 'includes',
        'has': '', 'by': 'by', 'specific_incoming_reference': '',
    };
    operator = operatorDisplayMap[operator] || operator;

    return { columnName, displayValue, operator };
  }, [currentModel, currentWorkflow, getModelById, allDbObjects, allModels, virtualIncomingRelationColumns, getWorkflowStateName]);


  const handleCreateNew = useCallback(() => {
    if (!currentModel) return;
    router.push(`/data/${currentModel.id}/new`);
  }, [currentModel, router]);

  const handleEdit = useCallback((obj: DataObject) => {
    if (!currentModel) return;
    router.push(`/data/${currentModel.id}/edit/${obj.id}`);
  }, [currentModel, router]);

  const handleEditModelStructure = useCallback(() => {
    if (!currentModel) return;
    router.push(`/models/edit/${currentModel.id}`);
  }, [currentModel, router]);

  const handleView = useCallback((obj: DataObject) => {
    if (!currentModel) return;
    router.push(`/data/${currentModel.id}/view/${obj.id}`);
  }, [currentModel, router]);

  const handleDelete = useCallback(async (objectId: string) => {
    if (!currentModel) return;
    try {
        await deleteObject(currentModel.id, objectId);
        setSelectedObjectIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(objectId);
          return newSet;
        });
        toast({ title: `${currentModel.name} Deleted`, description: `The ${currentModel.name.toLowerCase()} has been deleted.` });
    } catch (error: any) {
        toast({ variant: "destructive", title: "Error Deleting Object", description: error.message || "An unexpected error occurred." });
    }
  }, [currentModel, deleteObject, toast]);

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


  const filteredObjects = useMemo(() => {
    if (!currentModel) return [];
    let searchableObjects = [...localObjects]; 

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
      const virtualColumnDef = virtualIncomingRelationColumns.find(vc => vc.id === columnKey);
      searchableObjects = searchableObjects.filter(obj => {
        if (columnKey === WORKFLOW_STATE_GROUPING_KEY) return obj.currentStateId === filter.value; 
        if (property) {
            const value = obj[property.name];
            switch (property.type) {
            case 'string': case 'markdown': case 'image':
                return value !== null && value !== undefined && String(value).toLowerCase().includes(String(filter.value).toLowerCase());
            case 'number':
                const numValue = parseFloat(String(value)); const filterNumValue = parseFloat(String(filter.value));
                if (isNaN(numValue) || isNaN(filterNumValue)) return false;
                switch (filter.operator) {
                case 'eq': return numValue === filterNumValue; case 'gt': return numValue > filterNumValue;
                case 'lt': return numValue < filterNumValue; case 'gte': return numValue >= filterNumValue;
                case 'lte': return numValue <= filterNumValue; default: return false;
                }
            case 'boolean': return (value === true || value === 1) === filter.value;
            case 'date':
                if (!value || !filter.value) return false; try {
                const objDate = startOfDay(new Date(value)); const filterDate = startOfDay(new Date(filter.value));
                return isDateValidFn(objDate) && isDateValidFn(filterDate) && isEqualDate(objDate, filterDate);
                } catch { return false; }
            case 'rating': return Number(value) === Number(filter.value);
            case 'relationship':
                const filterRelId = String(filter.value);
                if (property.relationshipType === 'many') return Array.isArray(value) && value.includes(filterRelId);
                else return value === filterRelId;
            default: return true;
            }
        } else if (virtualColumnDef && filter.operator === 'specific_incoming_reference') {
            const referencingData = allDbObjects[virtualColumnDef.referencingModel.id] || [];
            if (filter.value === INTERNAL_NO_REFERENCES_VALUE) {
                return !referencingData.some(refObj => {
                    const linkedValue = refObj[virtualColumnDef.referencingProperty.name];
                    return virtualColumnDef.referencingProperty.relationshipType === 'many'
                        ? (Array.isArray(linkedValue) && linkedValue.includes(obj.id)) : linkedValue === obj.id;
                });
            } else {
                const specificReferencingObject = referencingData.find(refObj => refObj.id === filter.value);
                if (!specificReferencingObject) return false;
                const linkedValueOnSpecific = specificReferencingObject[virtualColumnDef.referencingProperty.name];
                return virtualColumnDef.referencingProperty.relationshipType === 'many'
                    ? (Array.isArray(linkedValueOnSpecific) && linkedValueOnSpecific.includes(obj.id)) : linkedValueOnSpecific === obj.id;
            }
        } else if (virtualColumnDef && filter.operator === 'eq') { 
            const referencingData = allDbObjects[virtualColumnDef.referencingModel.id] || [];
            const count = referencingData.filter(refObj => {
                const linkedValue = refObj[virtualColumnDef.referencingProperty.name];
                return virtualColumnDef.referencingProperty.relationshipType === 'many'
                    ? (Array.isArray(linkedValue) && linkedValue.includes(obj.id)) : linkedValue === obj.id;
            }).length;
            if (filter.value === true) return count > 0; if (filter.value === false) return count === 0; return true;
        }
        return true;
      });
    });
    return searchableObjects;
  }, [localObjects, searchTerm, currentModel, columnFilters, getModelById, allDbObjects, allModels, currentWorkflow, getWorkflowStateName, virtualIncomingRelationColumns]); 

  const sortedObjects = useMemo(() => {
    if (!currentModel) return filteredObjects; 
    let objectsToSort = [...filteredObjects];
    if (!sortConfig) return objectsToSort; 

    return objectsToSort.sort((a, b) => {
      let aValue: any; let bValue: any;
      const directPropertyToSort = currentModel.properties.find(p => p.id === sortConfig.key);
      const virtualColumnToSort = virtualIncomingRelationColumns.find(vc => vc.id === sortConfig.key);
      const isWorkflowStateSort = sortConfig.key === WORKFLOW_STATE_GROUPING_KEY; 
      if (directPropertyToSort) {
        aValue = a[directPropertyToSort.name]; bValue = b[directPropertyToSort.name];
        switch (directPropertyToSort.type) {
          case 'string': case 'markdown': case 'image': aValue = String(aValue ?? '').toLowerCase(); bValue = String(bValue ?? '').toLowerCase(); break;
          case 'number': case 'rating': aValue = Number(aValue ?? Number.NEGATIVE_INFINITY); bValue = Number(bValue ?? Number.NEGATIVE_INFINITY); break;
          case 'boolean': aValue = aValue ? 1 : 0; bValue = bValue ? 1 : 0; break;
          case 'date': aValue = aValue ? new Date(aValue).getTime() : 0; bValue = bValue ? new Date(bValue).getTime() : 0; break;
          case 'relationship':
            const relatedModel = getModelById(directPropertyToSort.relatedModelId!);
            if (directPropertyToSort.relationshipType === 'many') { aValue = Array.isArray(aValue) ? aValue.length : 0; bValue = Array.isArray(bValue) ? bValue.length : 0; }
            else {
              const aRelatedObj = (allDbObjects[directPropertyToSort.relatedModelId!] || []).find(o => o.id === aValue);
              const bRelatedObj = (allDbObjects[directPropertyToSort.relatedModelId!] || []).find(o => o.id === bValue);
              aValue = getObjectDisplayValue(aRelatedObj, relatedModel, allModels, allDbObjects).toLowerCase();
              bValue = getObjectDisplayValue(bRelatedObj, relatedModel, allModels, allDbObjects).toLowerCase();
            } break;
          default: aValue = String(aValue ?? '').toLowerCase(); bValue = String(bValue ?? '').toLowerCase();
        }
      } else if (virtualColumnToSort) {
        const getRefCount = (objId: string) => {
            const referencingData = allDbObjects[virtualColumnToSort.referencingModel.id] || [];
            return referencingData.filter(refObj => {
              const linkedValue = refObj[virtualColumnToSort.referencingProperty.name];
              return virtualColumnToSort.referencingProperty.relationshipType === 'many' ? (Array.isArray(linkedValue) && linkedValue.includes(objId)) : linkedValue === objId;
            }).length; };
        aValue = getRefCount(a.id); bValue = getRefCount(b.id);
      } else if (isWorkflowStateSort && currentWorkflow) {
        aValue = getWorkflowStateName(a.currentStateId).toLowerCase(); bValue = getWorkflowStateName(b.currentStateId).toLowerCase();
      } else return 0;
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return String(a.id).localeCompare(String(b.id));
    });
  }, [filteredObjects, sortConfig, currentModel, getModelById, allDbObjects, allModels, virtualIncomingRelationColumns, currentWorkflow, getWorkflowStateName]);

  const groupedDataForRender = useMemo(() => {
    if (!groupingPropertyKey || !currentModel) return null;
    
    if (groupingPropertyKey === WORKFLOW_STATE_GROUPING_KEY && currentWorkflow) {
      const groupedByState = sortedObjects.reduce((acc, obj) => {
        const stateId = obj.currentStateId || 'null'; 
        const state = currentWorkflow.states.find(s => s.id === stateId);
        const groupTitle = state ? state.name : 'N/A (No State)';
        const orderIndex = state ? (state.orderIndex !== undefined ? state.orderIndex : Infinity) : Infinity; 
        
        if (!acc[groupTitle]) {
          acc[groupTitle] = { objects: [], orderIndex };
        }
        acc[groupTitle].objects.push(obj);
        return acc;
      }, {} as Record<string, { objects: DataObject[]; orderIndex: number }>);

      return Object.entries(groupedByState)
        .map(([groupTitle, data]) => ({ groupTitle, objects: data.objects, orderIndex: data.orderIndex }))
        .sort((a, b) => a.orderIndex - b.orderIndex); 
    }
    
    const groupingProperty = currentModel.properties.find(p => p.id === groupingPropertyKey);
    const groupingVirtualColumn = virtualIncomingRelationColumns.find(vc => vc.id === groupingPropertyKey);

    if (groupingProperty) {
      const grouped = sortedObjects.reduce((acc, obj) => {
        const groupVal = getObjectGroupValue(obj, groupingProperty, allModels, allDbObjects);
        if (!acc[groupVal]) acc[groupVal] = [];
        acc[groupVal].push(obj);
        return acc;
      }, {} as Record<string, DataObject[]>);

      return Object.entries(grouped)
        .map(([groupTitle, objectsInGroup]) => ({ groupTitle, objects: objectsInGroup }))
        .sort((a, b) => a.groupTitle.localeCompare(b.groupTitle)); 
    } else if (groupingVirtualColumn) {
      const grouped = sortedObjects.reduce((acc, obj) => {
        const referencingData = allDbObjects[groupingVirtualColumn.referencingModel.id] || [];
        const linkedItems = referencingData.filter(refObj => {
          const linkedValue = refObj[groupingVirtualColumn.referencingProperty.name];
          return groupingVirtualColumn.referencingProperty.relationshipType === 'many' 
                 ? (Array.isArray(linkedValue) && linkedValue.includes(obj.id)) 
                 : linkedValue === obj.id;
        });
        
        let groupTitle = `Not Referenced by ${groupingVirtualColumn.referencingModel.name}`;
        if (linkedItems.length > 0) {
          groupTitle = `Referenced by: ${linkedItems.map(item => getObjectDisplayValue(item, groupingVirtualColumn.referencingModel, allModels, allDbObjects)).join(', ')}`;
        }
        
        if (!acc[groupTitle]) acc[groupTitle] = [];
        acc[groupTitle].push(obj);
        return acc;
      }, {} as Record<string, DataObject[]>);

      return Object.entries(grouped)
        .map(([groupTitle, objectsInGroup]) => ({ groupTitle, objects: objectsInGroup }))
        .sort((a, b) => a.groupTitle.localeCompare(b.groupTitle));
    }
    return null; // Should not happen if groupingPropertyKey is valid
  }, [groupingPropertyKey, sortedObjects, currentModel, currentWorkflow, allModels, allDbObjects, getWorkflowStateName, virtualIncomingRelationColumns]);


  const totalItemsForPagination = groupedDataForRender ? groupedDataForRender.length : sortedObjects.length;
  const totalPages = Math.ceil(totalItemsForPagination / ITEMS_PER_PAGE);

  const paginatedDataToRender = useMemo(() => {
    const itemsToPaginate = groupedDataForRender ? groupedDataForRender : sortedObjects;
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return itemsToPaginate.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [groupedDataForRender, sortedObjects, currentPage]);


  const handleSelectAll = (checked: boolean) => {
    if (groupingPropertyKey && groupedDataForRender) {
      const idsToSelect = new Set<string>();
      (paginatedDataToRender as { groupTitle: string; objects: DataObject[] }[]).forEach(group => {
        group.objects.forEach(obj => idsToSelect.add(obj.id));
      });
      if (checked) {
        setSelectedObjectIds(prev => new Set([...Array.from(prev), ...Array.from(idsToSelect)]));
      } else {
        setSelectedObjectIds(prev => {
          const newSet = new Set(prev);
          idsToSelect.forEach(id => newSet.delete(id));
          return newSet;
        });
      }
    } else {
      if (checked) {
        setSelectedObjectIds(new Set((paginatedDataToRender as DataObject[]).map(obj => obj.id)));
      } else {
        setSelectedObjectIds(new Set());
      }
    }
  };

  const handleRowSelect = (objectId: string, checked: boolean) => {
    setSelectedObjectIds(prev => {
      const newSet = new Set(prev);
      if (checked) newSet.add(objectId);
      else newSet.delete(objectId);
      return newSet;
    });
  };
  
  const isAllPaginatedSelected = useMemo(() => {
    if (groupedDataForRender) {
      if (!paginatedDataToRender || (paginatedDataToRender as { groupTitle: string; objects: DataObject[] }[]).length === 0) return false;
      const allVisibleObjectIds = (paginatedDataToRender as { groupTitle: string; objects: DataObject[] }[]).flatMap(group => group.objects.map(obj => obj.id));
      return allVisibleObjectIds.length > 0 && allVisibleObjectIds.every(id => selectedObjectIds.has(id));
    } else {
      if (!paginatedDataToRender || (paginatedDataToRender as DataObject[]).length === 0) return false;
      return (paginatedDataToRender as DataObject[]).length > 0 && (paginatedDataToRender as DataObject[]).every(obj => selectedObjectIds.has(obj.id));
    }
  }, [paginatedDataToRender, selectedObjectIds, groupedDataForRender]);


  const handleBatchUpdate = async () => {
    if (!currentModel || !selectedBatchPropertyDetails || selectedObjectIds.size === 0) {
        toast({ variant: "destructive", title: "Batch Update Error", description: "Please select a property and at least one record." });
        return;
    }

    setIsBatchUpdating(true);
    try {
        let processedNewValue = batchUpdateValue;
        let payloadPropertyName = selectedBatchPropertyDetails.name;
        let payloadPropertyType = selectedBatchPropertyDetails.type;

        if (selectedBatchPropertyDetails.name === INTERNAL_WORKFLOW_STATE_UPDATE_KEY) {
            payloadPropertyType = 'workflow_state';
            processedNewValue = batchUpdateValue;
        } else if (selectedBatchPropertyDetails.type === 'boolean') {
            processedNewValue = Boolean(batchUpdateValue);
        } else if (selectedBatchPropertyDetails.type === 'number') {
            processedNewValue = parseFloat(String(batchUpdateValue));
            if (isNaN(processedNewValue)) {
                throw new Error(`Invalid number provided for batch update of ${selectedBatchPropertyDetails.type}.`);
            }
        } else if (selectedBatchPropertyDetails.type === 'rating') {
            processedNewValue = Number(batchUpdateValue);
            if (isNaN(processedNewValue) || processedNewValue < 0 || processedNewValue > 5 || !Number.isInteger(processedNewValue)) {
                throw new Error("Rating must be an integer between 0 and 5.");
            }
        } else if (selectedBatchPropertyDetails.type === 'date') {
            if (batchUpdateDate && isDateValidFn(batchUpdateDate)) {
                processedNewValue = batchUpdateDate.toISOString();
            } else if (!batchUpdateDate && batchUpdateValue === ''){
                processedNewValue = null;
            }
             else {
                throw new Error("Invalid date provided for batch update.");
            }
        } else if (selectedBatchPropertyDetails.type === 'relationship') {
            if (selectedBatchPropertyDetails.relationshipType === 'one') {
                processedNewValue = batchUpdateValue === INTERNAL_CLEAR_RELATIONSHIP_VALUE ? null : batchUpdateValue;
            } else {
                processedNewValue = Array.isArray(batchUpdateValue) ? batchUpdateValue : [];
            }
        }

        const payload = {
            objectIds: Array.from(selectedObjectIds),
            propertyName: payloadPropertyName,
            propertyType: payloadPropertyType,
            newValue: processedNewValue,
        };

        const response = await fetch(`/api/codex-structure/models/${currentModel.id}/objects/batch-update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const responseData = await response.json();

        if (!response.ok) {
            throw new Error(responseData.error || responseData.message || "Batch update failed at API level");
        }

        if (responseData.errors && responseData.errors.length > 0) {
            toast({
                variant: "warning",
                title: "Batch Update Partially Successful",
                description: `${responseData.message}. Errors: ${responseData.errors.map((e: any) => e.message || String(e)).join(', ')}`
            });
        } else {
            toast({ title: "Batch Update Successful", description: responseData.message || `${selectedObjectIds.size} records updated.` });
        }

        await fetchData('Batch Update');
        setIsBatchUpdateDialogOpen(false);
        setSelectedObjectIds(new Set());
        setBatchUpdateProperty('');
    } catch (error: any) {
        toast({ variant: "destructive", title: "Batch Update Failed", description: error.message });
    } finally {
        setIsBatchUpdating(false);
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
            <ImageIcon className="h-3 w-3 mr-1" /> {imgUrl.length > 30 ? imgUrl.substring(0, 27) + '...' : imgUrl} <ExternalLink className="h-3 w-3 ml-1 opacity-70" />
          </a>);
      case 'rating': return <StarDisplay rating={value as number} />;
      case 'relationship':
        if (!property.relatedModelId) return <span className="text-destructive">Config Err</span>;
        const relatedModel = getModelById(property.relatedModelId); if (!relatedModel) return <span className="text-destructive">Model N/A</span>;
        if (property.relationshipType === 'many') {
          if (!Array.isArray(value) || value.length === 0) return <span className="text-muted-foreground">N/A</span>;
          const relatedItems = value.map(itemId => { const relatedObj = (allDbObjects[property.relatedModelId!] || []).find(o => o.id === itemId); return { id: itemId, name: getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects), obj: relatedObj }; });
          if (relatedItems.length > 2) return <Badge variant="outline" title={relatedItems.map(i=>i.name).join(', ')}>{relatedItems.length} {relatedModel.name}(s)</Badge>;
          return relatedItems.map(item => item.obj ? ( <Link key={item.id} href={`/data/${relatedModel.id}/edit/${item.obj.id}`} className="inline-block"> <Badge variant="outline" className="mr-1 mb-1 hover:bg-secondary">{item.name}</Badge> </Link> ) : ( <Badge key={item.id} variant="outline" className="mr-1 mb-1">{item.name}</Badge> ));
        } else {
          const relatedObj = (allDbObjects[property.relatedModelId] || []).find(o => o.id === value); const displayVal = getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects);
          return relatedObj ? ( <Link href={`/data/${relatedModel.id}/edit/${relatedObj.id}`} className="inline-block"> <Badge variant="outline" className="hover:bg-secondary">{displayVal}</Badge> </Link> ) : <span className="text-xs font-mono" title={String(value)}>{displayVal}</span>;
        }
      default: const strValue = String(value); return strValue.length > 50 ? <span title={strValue}>{strValue.substring(0, 47) + '...'}</span> : strValue;
    }
  };

  const escapeCsvCell = (cell: any): string => {
    if (cell === null || typeof cell === 'undefined') return '';
    const cellString = String(cell);
    if (cellString.search(/("|,|\n)/g) >= 0) return `"${cellString.replace(/"/g, '""')}"`;
    return cellString;
  };

  const handleExportCSV = () => {
    if (!currentModel || filteredObjects.length === 0) { 
      toast({ title: "No Data to Export", description: "There is no data available for the current selection to export.", variant: "destructive" });
      return;
    }
    const headers: string[] = []; currentModel.properties.forEach(prop => headers.push(prop.name));
    if (currentWorkflow) headers.push("Workflow State");
    virtualIncomingRelationColumns.forEach(col => headers.push(col.headerLabel));
    const csvRows: string[] = [headers.map(escapeCsvCell).join(',')];
    
    const objectsToExport = groupingPropertyKey && groupedDataForRender
      ? groupedDataForRender.flatMap(g => g.objects) 
      : sortedObjects; 

    objectsToExport.forEach(obj => {
      const row: string[] = [];
      currentModel.properties.forEach(prop => {
        const value = obj[prop.name]; let cellValue = '';
        if (value === null || typeof value === 'undefined') cellValue = '';
        else {
          switch (prop.type) {
            case 'boolean': cellValue = value ? 'Yes' : 'No'; break;
            case 'date': try { const date = new Date(value); cellValue = isDateValidFn(date) ? formatDateFns(date, 'yyyy-MM-dd') : String(value); } catch { cellValue = String(value); } break;
            case 'number': const precision = prop.precision === undefined ? 2 : prop.precision; const parsedNum = parseFloat(String(value)); cellValue = isNaN(parsedNum) ? String(value) : parsedNum.toFixed(precision); break;
            case 'markdown': case 'image': cellValue = String(value); break;
            case 'rating': cellValue = (value && Number(value) > 0) ? `${Number(value)}/5` : ''; break;
            case 'relationship':
              const relatedModel = getModelById(prop.relatedModelId!);
              if (prop.relationshipType === 'many') {
                if (Array.isArray(value) && value.length > 0) cellValue = value.map(itemId => { const relatedObj = (allDbObjects[prop.relatedModelId!] || []).find(o => o.id === itemId); return getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects); }).join('; ');
                else cellValue = '';
              } else { const relatedObj = (allDbObjects[prop.relatedModelId!] || []).find(o => o.id === value); cellValue = getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects); } break;
            default: cellValue = String(value);
          }
        } row.push(escapeCsvCell(cellValue));
      });
      if (currentWorkflow) row.push(escapeCsvCell(getWorkflowStateName(obj.currentStateId)));
      virtualIncomingRelationColumns.forEach(colDef => {
        const referencingData = allDbObjects[colDef.referencingModel.id] || [];
        const linkedItems = referencingData.filter(refObj => { const linkedValue = refObj[colDef.referencingProperty.name]; if (colDef.referencingProperty.relationshipType === 'many') return Array.isArray(linkedValue) && linkedValue.includes(obj.id); return linkedValue === obj.id; });
        if (linkedItems.length > 0) row.push(escapeCsvCell(linkedItems.map(item => getObjectDisplayValue(item, colDef.referencingModel, allModels, allDbObjects)).join('; ')));
        else row.push('');
      });
      csvRows.push(row.join(','));
    });
    const csvString = csvRows.join('\n'); const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob); link.setAttribute('href', url); link.setAttribute('download', `${currentModel.name}-data.csv`);
      link.style.visibility = 'hidden'; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
      toast({ title: "Export Successful", description: `${currentModel.name} data has been exported to CSV.` });
    } else toast({ variant: "destructive", title: "Export Failed", description: "Your browser doesn't support this feature." });
  };

  const handleRefreshData = async () => {
    setIsRefreshing(true);
    try {
      await fetchData('Manual Refresh');
      toast({ title: "Data Refreshed", description: "The latest data has been loaded." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Refresh Failed", description: error.message || "Could not refresh data." });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleStateChangeViaDrag = useCallback(async (objectId: string, newPotentialStateId: string) => {
    if (!currentModel || !currentWorkflow) {
      toast({ variant: "destructive", title: "Error", description: "Model or workflow not available for state change." });
      return;
    }
    const objectToUpdate = localObjects.find(obj => obj.id === objectId);
    if (!objectToUpdate) {
      toast({ variant: "destructive", title: "Error", description: `Object with ID ${objectId} not found.` });
      return;
    }
    const currentObjectStateDef = objectToUpdate.currentStateId
      ? currentWorkflow.states.find(s => s.id === objectToUpdate.currentStateId)
      : null;
    const targetStateDef = currentWorkflow.states.find(s => s.id === newPotentialStateId);
    if (!targetStateDef) {
      toast({ variant: "destructive", title: "Error", description: `Target state ID "${newPotentialStateId}" not found in workflow "${currentWorkflow.name}".` });
      setIsRefreshing(false);
      return;
    }
    let isValidTransition = false;
    if (!currentObjectStateDef) {
      if (targetStateDef.isInitial) {
        isValidTransition = true;
      } else {
        toast({ variant: "destructive", title: "Invalid Transition", description: `Cannot move object to non-initial state "${targetStateDef.name}" as it has no current state.` });
      }
    } else {
      const validSuccessorIds = currentObjectStateDef.successorStateIds || [];
      if (validSuccessorIds.includes(newPotentialStateId)) {
        isValidTransition = true;
      } else {
        toast({ variant: "destructive", title: "Invalid Transition", description: `Cannot move from "${currentObjectStateDef.name}" to "${targetStateDef.name}". Not a valid successor.` });
      }
    }
    if (isValidTransition) {
      try {
        setIsRefreshing(true); 
        await updateObject(currentModel.id, objectId, { currentStateId: newPotentialStateId });
        toast({ title: "State Updated", description: `Object moved to "${targetStateDef.name}".` });
      } catch (error: any) {
        toast({ variant: "destructive", title: "Error Updating State", description: error.message });
        await fetchData('Error Reverting Kanban State Update');
      } finally {
        setIsRefreshing(false); 
      }
    } else {
       await fetchData('Invalid Transition Revert'); 
    }
  }, [currentModel, currentWorkflow, localObjects, updateObject, toast, fetchData]);

  const hasActiveColumnFilters = Object.keys(columnFilters).length > 0;
  
  const currentGroupingPropertyDisplayName = useMemo(() => {
    if (!groupingPropertyKey) return "None";
    if (groupingPropertyKey === WORKFLOW_STATE_GROUPING_KEY) return "Workflow State";
    
    const directProp = currentModel?.properties.find(p => p.id === groupingPropertyKey);
    if (directProp) return directProp.name;

    const virtualProp = virtualIncomingRelationColumns.find(vc => vc.id === groupingPropertyKey);
    if (virtualProp) return virtualProp.headerLabel;
    
    return "None";
  }, [groupingPropertyKey, currentModel, virtualIncomingRelationColumns]);

  const directPropertiesToShowInTable = currentModel?.properties.sort((a,b) => a.orderIndex - b.orderIndex) || [];


  if (!dataContextIsReady || !currentModel) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
        <p className="text-lg text-muted-foreground">Loading data objects...</p>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-8">
      <Button variant="outline" onClick={() => router.push('/models')} className="mb-6"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Model Admin</Button>
      <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="text-center md:text-left">
          <h1 className="text-3xl font-bold text-primary">Data for: {currentModel.name}</h1>
          <p className="text-muted-foreground">{currentModel.description || 'Manage data entries for this model.'}</p>
          {currentWorkflow && <Badge variant="secondary" className="mt-1">Workflow: {currentWorkflow.name}</Badge>}
        </div>
         <div className="flex flex-wrap gap-2 w-full md:w-auto justify-center md:justify-end">
            <div className="relative flex-grow md:flex-grow-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input type="search" placeholder={`Search ${currentModel.name.toLowerCase()}s...`} value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1);}} className="pl-10 w-full md:w-64" />
            </div>
            <div className="flex items-center border rounded-md">
              <Button variant={viewMode === 'table' ? 'secondary' : 'ghost'} size="sm" onClick={() => handleViewModeChange('table')} className="rounded-r-none" aria-label="Table View"><ListIcon className="h-5 w-5" /></Button>
              <Button variant={viewMode === 'gallery' ? 'secondary' : 'ghost'} size="sm" onClick={() => handleViewModeChange('gallery')} className={cn("rounded-l-none border-l", currentWorkflow ? "" : "rounded-r-md")} aria-label="Gallery View"><LayoutGrid className="h-5 w-5" /></Button>
              {currentWorkflow && (
                 <Button variant={viewMode === 'kanban' ? 'secondary' : 'ghost'} size="sm" onClick={() => handleViewModeChange('kanban')} className="rounded-l-none border-l rounded-r-md" aria-label="Kanban View"><KanbanIcon className="h-5 w-5" /></Button>
              )}
            </div>
            {viewMode === 'table' && groupableProperties.length > 0 && (
              <div className="min-w-[180px]">
                 <Select
                  value={groupingPropertyKey ?? NO_GROUPING_VALUE}
                  onValueChange={(value) => {
                    setGroupingPropertyKey(value === NO_GROUPING_VALUE ? null : value);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger>
                    <Rows className="mr-2 h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="Group by..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_GROUPING_VALUE}>No Grouping</SelectItem>
                    <SelectGroup>
                      <UiSelectLabel>Group by Property</UiSelectLabel>
                      {groupableProperties.map(prop => (
                        <SelectItem key={prop.id} value={prop.id}>{prop.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={handleRefreshData} variant="outline" disabled={isRefreshing}>
              {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
            <Button onClick={handleEditModelStructure} variant="outline"><SettingsIcon className="mr-2 h-4 w-4" /> Edit Model</Button>
            <Button onClick={handleExportCSV} variant="outline"><Download className="mr-2 h-4 w-4" /> Export CSV</Button>
            <Button onClick={handleCreateNew} className="bg-accent text-accent-foreground hover:bg-accent/90"><PlusCircle className="mr-2 h-4 w-4" /> Create New</Button>
        </div>
      </header>

      {selectedObjectIds.size > 0 && viewMode === 'table' && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-secondary rounded-md shadow">
            <span className="text-sm font-medium text-secondary-foreground">{selectedObjectIds.size} item(s) selected</span>
            <Dialog open={isBatchUpdateDialogOpen} onOpenChange={(open) => {
                setIsBatchUpdateDialogOpen(open);
                if (!open) {
                    setBatchUpdateProperty('');
                }
            }}>
                <DialogTrigger asChild>
                    <Button variant="default" size="sm" className="bg-primary hover:bg-primary/90">
                        <Edit3 className="mr-2 h-4 w-4" /> Batch Update
                    </Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Batch Update {selectedObjectIds.size} Items</DialogTitle>
                        <DialogDescription>Select a property and a new value to apply to all selected items.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="batch-property" className="text-right">Property</Label>
                            <Select value={batchUpdateProperty} onValueChange={(value) => {
                                setBatchUpdateProperty(value);
                              }}
                            >
                                <SelectTrigger id="batch-property" className="col-span-3">
                                    <SelectValue placeholder="Select property..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {batchUpdatableProperties.map(prop => (
                                        <SelectItem key={prop.id} value={prop.name}>
                                            {prop.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {selectedBatchPropertyDetails && (
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="batch-value" className="text-right">New Value</Label>
                                {selectedBatchPropertyDetails.type === 'boolean' && (
                                    <Switch
                                        id="batch-value"
                                        checked={Boolean(batchUpdateValue)}
                                        onCheckedChange={(checked) => setBatchUpdateValue(checked)}
                                        className="col-span-3"
                                    />
                                )}
                                {selectedBatchPropertyDetails.type === 'string' && (
                                    <Input
                                        id="batch-value"
                                        value={String(batchUpdateValue)}
                                        onChange={(e) => setBatchUpdateValue(e.target.value)}
                                        className="col-span-3"
                                    />
                                )}
                                {selectedBatchPropertyDetails.type === 'number' && (
                                    <Input
                                        id="batch-value"
                                        type="number"
                                        value={String(batchUpdateValue)}
                                        onChange={(e) => setBatchUpdateValue(e.target.value)}
                                        className="col-span-3"
                                    />
                                )}
                                {selectedBatchPropertyDetails.type === 'rating' && (
                                    <div className="col-span-3">
                                        <StarRatingInput
                                            value={Number(batchUpdateValue) || 0}
                                            onChange={(newRating) => {
                                                setBatchUpdateValue(newRating);
                                            }}
                                        />
                                    </div>
                                )}
                                {selectedBatchPropertyDetails.type === 'date' && (
                                   <Popover>
                                        <PopoverTrigger asChild>
                                        <Button
                                            variant={"outline"}
                                            className={cn(
                                            "col-span-3 justify-start text-left font-normal",
                                            !batchUpdateDate && "text-muted-foreground"
                                            )}
                                        >
                                            <CalendarIconLucideLucide className="mr-2 h-4 w-4" />
                                            {batchUpdateDate ? formatDateFns(batchUpdateDate, "PPP") : <span>Pick a date</span>}
                                        </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                        <Calendar
                                            mode="single"
                                            selected={batchUpdateDate}
                                            onSelect={(date) => {
                                                setBatchUpdateDate(date);
                                                setBatchUpdateValue(date ? date.toISOString() : '');
                                            }}
                                            initialFocus
                                        />
                                        </PopoverContent>
                                    </Popover>
                                )}
                                {selectedBatchPropertyDetails.type === 'workflow_state' && currentWorkflow && (
                                     <Select value={batchUpdateValue} onValueChange={setBatchUpdateValue}>
                                        <SelectTrigger id="batch-workflow-state-value" className="col-span-3">
                                            <SelectValue placeholder="Select target state..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {currentWorkflow.states.map(state => (
                                                <SelectItem key={state.id} value={state.id}>
                                                    {state.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                                {selectedBatchPropertyDetails.type === 'relationship' && relatedModelForBatchUpdate && (
                                  <div className="col-span-3">
                                    {selectedBatchPropertyDetails.relationshipType === 'many' ? (
                                      <MultiSelectAutocomplete
                                        options={relatedObjectsForBatchUpdateOptions}
                                        selected={Array.isArray(batchUpdateValue) ? batchUpdateValue : []}
                                        onChange={setBatchUpdateValue}
                                        placeholder={`Select ${relatedModelForBatchUpdate.name}(s)...`}
                                        emptyIndicator={`No ${relatedModelForBatchUpdate.name.toLowerCase()}s found.`}
                                      />
                                    ) : (
                                      <Select
                                        value={String(batchUpdateValue) || INTERNAL_CLEAR_RELATIONSHIP_VALUE}
                                        onValueChange={(val) => setBatchUpdateValue(val === INTERNAL_CLEAR_RELATIONSHIP_VALUE ? '' : val)}
                                      >
                                        <SelectTrigger>
                                          <SelectValue placeholder={`Select ${relatedModelForBatchUpdate.name}...`} />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value={INTERNAL_CLEAR_RELATIONSHIP_VALUE}>-- Clear Relationship --</SelectItem>
                                          {Object.entries(relatedObjectsForBatchUpdateGrouped).map(([namespace, optionsInNamespace]) => (
                                            <SelectGroup key={namespace}>
                                              <UiSelectLabel>{namespace}</UiSelectLabel>
                                              {optionsInNamespace.map((option) => (
                                                <SelectItem key={option.value} value={option.value}>
                                                  {option.label}
                                                </SelectItem>
                                              ))}
                                            </SelectGroup>
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
                        <Button variant="outline" onClick={() => setIsBatchUpdateDialogOpen(false)} disabled={isBatchUpdating}>Cancel</Button>
                        <Button onClick={handleBatchUpdate} disabled={!selectedBatchPropertyDetails || isBatchUpdating} className="bg-primary hover:bg-primary/90">
                            {isBatchUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Update Items"}
                        </Button>
                    </BatchUpdateDialogFooter>
                </DialogContent>
            </Dialog>
            <Button variant="outline" size="sm" onClick={() => setSelectedObjectIds(new Set())} className="ml-auto">Clear Selection</Button>
        </div>
      )}

      {hasActiveColumnFilters && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleClearAllColumnFilters} className="text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive">
            <FilterX className="mr-2 h-4 w-4" /> Clear All Column Filters
          </Button>
          {Object.entries(columnFilters).map(([key, filter]) => {
            if (!filter) return null; const displayDetails = getFilterDisplayDetails(key, filter); if (!displayDetails) return null;
            return (
              <Badge variant="outline" key={key} className="py-1 px-2 group">
                <span className="font-semibold">{displayDetails.columnName}</span>
                {displayDetails.operator && <span className="mx-1 text-muted-foreground">{displayDetails.operator}</span>}
                <span className="text-primary truncate max-w-[100px]" title={displayDetails.displayValue}>{displayDetails.displayValue}</span>
                <Button variant="ghost" size="xs" className="ml-1 p-0.5 h-auto opacity-50 group-hover:opacity-100 hover:bg-destructive/20" onClick={() => handleColumnFilterChange(key, null)} aria-label={`Remove filter for ${displayDetails.columnName}`}>
                  <XIcon className="h-3 w-3" />
                </Button>
              </Badge> );
          })}
        </div>
      )}
      {filteredObjects.length === 0 && !searchTerm && !hasActiveColumnFilters ? (
        <Card className="text-center py-12"> <CardContent> <ListChecks size={48} className="mx-auto text-muted-foreground mb-4" /> <h3 className="text-xl font-semibold">No Data Objects Found</h3> <p className="text-muted-foreground mb-4"> There are no data objects for the model "{currentModel.name}" yet. </p> <Button onClick={handleCreateNew} variant="default"> <PlusCircle className="mr-2 h-4 w-4" /> Create First Object </Button> </CardContent> </Card>
      ) : sortedObjects.length === 0 && (searchTerm || hasActiveColumnFilters) ? (
         <Card className="text-center py-12"> <CardContent> <Search size={48} className="mx-auto text-muted-foreground mb-4" /> <h3 className="text-xl font-semibold">No Results Found</h3> <p className="text-muted-foreground mb-4"> Your {searchTerm && hasActiveColumnFilters ? "search and column filters" : searchTerm ? "search" : "column filters"} did not match any {currentModel.name.toLowerCase()}s. </p> </CardContent> </Card>
      ) : viewMode === 'table' ? (
        <>
        {groupingPropertyKey && groupedDataForRender ? (
          (paginatedDataToRender as { groupTitle: string; objects: DataObject[], orderIndex?: number }[]).map((group, groupIndex) => (
            <div key={`${group.groupTitle}-${group.orderIndex}-${groupIndex}`} className="mb-8">
              <h2 className="text-xl font-semibold my-4 p-2 bg-muted rounded-md">
                {currentGroupingPropertyDisplayName}: <span className="text-primary">{group.groupTitle}</span> ({group.objects.length} items)
              </h2>
              {group.objects.length > 0 ? (
                <Card className="shadow-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[60px] text-center">
                           {/* No group-specific select-all, use main one for all visible on page */}
                        </TableHead>
                        <TableHead className="w-[60px] text-center">View</TableHead>
                        {directPropertiesToShowInTable.map((prop) => (
                          <TableHead key={prop.id}> <div className="flex items-center"> <Button variant="ghost" onClick={() => requestSort(prop.id)} className="px-1 text-left justify-start flex-grow"> {prop.name} {getSortIcon(prop.id)} </Button> <ColumnFilterPopover columnKey={prop.id} columnName={prop.name} property={prop} currentFilter={columnFilters[prop.id] || null} onFilterChange={handleColumnFilterChange} /> </div> </TableHead>
                        ))}
                        {currentWorkflow && ( <TableHead> <div className="flex items-center"> <Button variant="ghost" onClick={() => requestSort(WORKFLOW_STATE_GROUPING_KEY)} className="px-1 text-left justify-start flex-grow"> State {getSortIcon(WORKFLOW_STATE_GROUPING_KEY)} </Button> <ColumnFilterPopover columnKey={WORKFLOW_STATE_GROUPING_KEY} columnName="State" currentWorkflow={currentWorkflow} currentFilter={columnFilters[WORKFLOW_STATE_GROUPING_KEY] || null} onFilterChange={handleColumnFilterChange} /> </div> </TableHead> )}
                        {virtualIncomingRelationColumns.map((col) => ( <TableHead key={col.id} className="text-xs"> <div className="flex items-center"> <Button variant="ghost" onClick={() => requestSort(col.id)} className="px-1 text-xs text-left justify-start flex-grow"> {col.headerLabel} {getSortIcon(col.id)} </Button> <ColumnFilterPopover columnKey={col.id} columnName={col.headerLabel} currentFilter={columnFilters[col.id] || null} onFilterChange={handleColumnFilterChange} filterTypeOverride="specificIncomingReference" referencingModel={col.referencingModel} referencingProperty={col.referencingProperty} /> </div> </TableHead> ))}
                        <TableHead className="text-right w-[120px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.objects.map((obj) => {
                        const isHighlightedAdded = lastChangedInfo?.objectId === obj.id && lastChangedInfo?.modelId === currentModel?.id && lastChangedInfo?.changeType === 'added';
                        const isHighlightedUpdated = lastChangedInfo?.objectId === obj.id && lastChangedInfo?.modelId === currentModel?.id && lastChangedInfo?.changeType === 'updated';
                        return (
                          <TableRow key={obj.id} data-state={selectedObjectIds.has(obj.id) ? "selected" : ""} className={cn( isHighlightedAdded && "animate-highlight-green", isHighlightedUpdated && "animate-highlight-yellow" )}>
                            <TableCell className="text-center"> <Checkbox checked={selectedObjectIds.has(obj.id)} onCheckedChange={(checked) => handleRowSelect(obj.id, !!checked)} aria-label={`Select row ${obj.id}`} /> </TableCell>
                            <TableCell className="text-center"> <Button variant="ghost" size="icon" onClick={() => handleView(obj)} className="hover:text-primary"> <Eye className="h-4 w-4" /> </Button> </TableCell>
                            {directPropertiesToShowInTable.map((prop) => ( <TableCell key={`${obj.id}-${prop.id}`}> {displayCellContent(obj, prop)} </TableCell> ))}
                            {currentWorkflow && ( <TableCell> <Badge variant={obj.currentStateId ? "outline" : "secondary"}> {getWorkflowStateName(obj.currentStateId)} </Badge> </TableCell> )}
                            {virtualIncomingRelationColumns.map((colDef) => { const referencingData = allDbObjects[colDef.referencingModel.id] || []; const linkedItems = referencingData.filter(refObj => { const linkedValue = refObj[colDef.referencingProperty.name]; if (colDef.referencingProperty.relationshipType === 'many') return Array.isArray(linkedValue) && linkedValue.includes(obj.id); return linkedValue === obj.id; }); if (linkedItems.length === 0) return <TableCell key={colDef.id}><span className="text-muted-foreground">N/A</span></TableCell>; return ( <TableCell key={colDef.id} className="space-x-1 space-y-1"> {linkedItems.map(item => ( <Link key={item.id} href={`/data/${colDef.referencingModel.id}/edit/${item.id}`} className="inline-block"> <Badge variant="secondary" className="hover:bg-muted cursor-pointer"> {getObjectDisplayValue(item, colDef.referencingModel, allModels, allDbObjects)} </Badge> </Link> ))} </TableCell> ); })}
                            <TableCell className="text-right"> <Button variant="ghost" size="icon" onClick={() => handleEdit(obj)} className="mr-2 hover:text-primary"> <Edit className="h-4 w-4" /> </Button> <AlertDialog> <AlertDialogTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "hover:text-destructive")}><Trash2 className="h-4 w-4" /></AlertDialogTrigger> <AlertDialogContent> <AlertDialogHeader> <AlertDialogTitle>Are you sure?</AlertDialogTitle> <AlertDialogDescription> This action cannot be undone. This will permanently delete this {currentModel?.name.toLowerCase()} object. </AlertDialogDescription> </AlertDialogHeader> <AlertDialogFooter> <AlertDialogCancel>Cancel</AlertDialogCancel> <AlertDialogAction onClick={() => handleDelete(obj.id)}> Delete </AlertDialogAction> </AlertDialogFooter> </AlertDialogContent> </AlertDialog> </TableCell>
                          </TableRow> );
                      })}
                    </TableBody>
                  </Table>
                </Card>
              ) : (
                <p className="text-muted-foreground p-4">No items in this group match the current filters.</p>
              )}
            </div>
          ))
        ) : ( 
          <Card className="shadow-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px] text-center"> <Checkbox checked={isAllPaginatedSelected} onCheckedChange={handleSelectAll} aria-label="Select all rows on current page" className="mx-auto" /> </TableHead>
                  <TableHead className="w-[60px] text-center">View</TableHead>
                  {directPropertiesToShowInTable.map((prop) => ( <TableHead key={prop.id}> <div className="flex items-center"> <Button variant="ghost" onClick={() => requestSort(prop.id)} className="px-1 text-left justify-start flex-grow"> {prop.name} {getSortIcon(prop.id)} </Button> <ColumnFilterPopover columnKey={prop.id} columnName={prop.name} property={prop} currentFilter={columnFilters[prop.id] || null} onFilterChange={handleColumnFilterChange} /> </div> </TableHead> ))}
                  {currentWorkflow && ( <TableHead> <div className="flex items-center"> <Button variant="ghost" onClick={() => requestSort(WORKFLOW_STATE_GROUPING_KEY)} className="px-1 text-left justify-start flex-grow"> State {getSortIcon(WORKFLOW_STATE_GROUPING_KEY)} </Button> <ColumnFilterPopover columnKey={WORKFLOW_STATE_GROUPING_KEY} columnName="State" currentWorkflow={currentWorkflow} currentFilter={columnFilters[WORKFLOW_STATE_GROUPING_KEY] || null} onFilterChange={handleColumnFilterChange} /> </div> </TableHead> )}
                  {virtualIncomingRelationColumns.map((col) => ( <TableHead key={col.id} className="text-xs"> <div className="flex items-center"> <Button variant="ghost" onClick={() => requestSort(col.id)} className="px-1 text-xs text-left justify-start flex-grow"> {col.headerLabel} {getSortIcon(col.id)} </Button> <ColumnFilterPopover columnKey={col.id} columnName={col.headerLabel} currentFilter={columnFilters[col.id] || null} onFilterChange={handleColumnFilterChange} filterTypeOverride="specificIncomingReference" referencingModel={col.referencingModel} referencingProperty={col.referencingProperty} /> </div> </TableHead> ))}
                  <TableHead className="text-right w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(paginatedDataToRender as DataObject[]).map((obj) => {
                  const isHighlightedAdded = lastChangedInfo?.objectId === obj.id && lastChangedInfo?.modelId === currentModel?.id && lastChangedInfo?.changeType === 'added';
                  const isHighlightedUpdated = lastChangedInfo?.objectId === obj.id && lastChangedInfo?.modelId === currentModel?.id && lastChangedInfo?.changeType === 'updated';
                  return (
                  <TableRow key={obj.id} data-state={selectedObjectIds.has(obj.id) ? "selected" : ""} className={cn( isHighlightedAdded && "animate-highlight-green", isHighlightedUpdated && "animate-highlight-yellow" )}>
                    <TableCell className="text-center"> <Checkbox checked={selectedObjectIds.has(obj.id)} onCheckedChange={(checked) => handleRowSelect(obj.id, !!checked)} aria-label={`Select row ${obj.id}`} /> </TableCell>
                    <TableCell className="text-center"> <Button variant="ghost" size="icon" onClick={() => handleView(obj)} className="hover:text-primary"> <Eye className="h-4 w-4" /> </Button> </TableCell>
                    {directPropertiesToShowInTable.map((prop) => ( <TableCell key={`${obj.id}-${prop.id}`}> {displayCellContent(obj, prop)} </TableCell> ))}
                    {currentWorkflow && ( <TableCell> <Badge variant={obj.currentStateId ? "outline" : "secondary"}> {getWorkflowStateName(obj.currentStateId)} </Badge> </TableCell> )}
                    {virtualIncomingRelationColumns.map((colDef) => { const referencingData = allDbObjects[colDef.referencingModel.id] || []; const linkedItems = referencingData.filter(refObj => { const linkedValue = refObj[colDef.referencingProperty.name]; if (colDef.referencingProperty.relationshipType === 'many') return Array.isArray(linkedValue) && linkedValue.includes(obj.id); return linkedValue === obj.id; }); if (linkedItems.length === 0) return <TableCell key={colDef.id}><span className="text-muted-foreground">N/A</span></TableCell>; return ( <TableCell key={colDef.id} className="space-x-1 space-y-1"> {linkedItems.map(item => ( <Link key={item.id} href={`/data/${colDef.referencingModel.id}/edit/${item.id}`} className="inline-block"> <Badge variant="secondary" className="hover:bg-muted cursor-pointer"> {getObjectDisplayValue(item, colDef.referencingModel, allModels, allDbObjects)} </Badge> </Link> ))} </TableCell> ); })}
                    <TableCell className="text-right"> <Button variant="ghost" size="icon" onClick={() => handleEdit(obj)} className="mr-2 hover:text-primary"> <Edit className="h-4 w-4" /> </Button> <AlertDialog> <AlertDialogTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "hover:text-destructive")}><Trash2 className="h-4 w-4" /></AlertDialogTrigger> <AlertDialogContent> <AlertDialogHeader> <AlertDialogTitle>Are you sure?</AlertDialogTitle> <AlertDialogDescription> This action cannot be undone. This will permanently delete this {currentModel?.name.toLowerCase()} object. </AlertDialogDescription> </AlertDialogHeader> <AlertDialogFooter> <AlertDialogCancel>Cancel</AlertDialogCancel> <AlertDialogAction onClick={() => handleDelete(obj.id)}> Delete </AlertDialogAction> </AlertDialogFooter> </AlertDialogContent> </AlertDialog> </TableCell>
                  </TableRow> );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
        </>
      ) : viewMode === 'gallery' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {(paginatedDataToRender as DataObject[]).map((obj) => ( <GalleryCard key={obj.id} obj={obj} model={currentModel!} allModels={allModels} allObjects={allDbObjects} currentWorkflow={currentWorkflow} getWorkflowStateName={getWorkflowStateName} onView={handleView} onEdit={handleEdit} onDelete={handleDelete} lastChangedInfo={lastChangedInfo}/> ))}
        </div>
      ) : viewMode === 'kanban' && currentWorkflow ? (
        <KanbanBoard
          model={currentModel!}
          workflow={currentWorkflow}
          objects={sortedObjects} 
          allModels={allModels}
          allObjects={allDbObjects}
          onObjectUpdate={handleStateChangeViaDrag}
          onViewObject={handleView}
          onEditObject={handleEdit}
          onDeleteObject={handleDelete} 
        />
      ) : null }
      { (viewMode === 'table' || viewMode === 'gallery') && totalPages > 1 && (
        <div className="flex justify-center items-center space-x-2 mt-8">
          <Button variant="outline" size="sm" onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))} disabled={currentPage === 1}>Previous</Button>
          <span className="text-sm text-muted-foreground"> Page {currentPage} of {totalPages} ({groupingPropertyKey ? 'groups' : 'items'}) </span>
          <Button variant="outline" size="sm" onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages}>Next</Button>
        </div>
      )}
    </div>
  );
}
    
