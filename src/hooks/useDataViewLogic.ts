
'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useData } from '@/contexts/data-context';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from "@/hooks/use-toast";
import type { Model, DataObject, Property, WorkflowWithDetails, DataContextType, SharedObjectLink } from '@/lib/types';
import { getObjectDisplayValue, cn, getObjectGroupValue } from '@/lib/utils';
import { format as formatDateFns, isValid as isDateValidFn, startOfDay, isEqual as isEqualDate } from 'date-fns';
import type { SortConfig, IncomingRelationColumn } from '@/components/objects/data-objects-table';
import type { ColumnFilterValue } from '@/components/objects/column-filter-popover';
import type { ViewMode } from '@/app/data/[modelId]/page';


// Constants
const SELECT_ALL_CHECKBOX_COLUMN_KEY = "select-all-checkbox";
const VIEW_ACTION_COLUMN_KEY = "view-action";
const ACTIONS_COLUMN_KEY = "actions";
const INTERNAL_NO_REFERENCES_VALUE = "__NO_REFERENCES__";
const WORKFLOW_STATE_GROUPING_KEY = "__WORKFLOW_STATE_GROUPING__";
const OWNER_COLUMN_KEY = "__OWNER_COLUMN_KEY__";
const CREATED_AT_COLUMN_KEY = "__CREATED_AT_COLUMN_KEY__";
const UPDATED_AT_COLUMN_KEY = "__UPDATED_AT_COLUMN_KEY__";
const DELETED_AT_COLUMN_KEY = "__DELETED_AT_COLUMN_KEY__";
const WORKFLOW_STATE_DISPLAY_COLUMN_KEY = "__WORKFLOW_STATE_DISPLAY_COLUMN__";
const INTERNAL_WORKFLOW_STATE_UPDATE_KEY = "__WORKFLOW_STATE_UPDATE__";


// Type Definitions
export interface ColumnToggleOption {
  id: string;
  label: string;
  type: 'action' | 'property' | 'workflow' | 'virtual' | 'owner' | 'metadata';
}

const DEFAULT_HIDDEN_COLUMNS = new Set([
  OWNER_COLUMN_KEY,
  CREATED_AT_COLUMN_KEY,
  UPDATED_AT_COLUMN_KEY,
]);


export function useDataViewLogic(modelIdFromUrl: string) {
    const router = useRouter();
    const dataContext = useData();
    const {
        models: allModels,
        objects: activeObjectsFromContext,
        deletedObjects: deletedObjectsFromContext,
        getModelById,
        getObjectsByModelId,
        restoreObject: contextRestoreObject,
        updateObject: contextUpdateObject,
        batchDeleteAcrossModels,
        getAllObjects,
        getWorkflowById,
        allUsers,
        getUserById,
        isReady: dataContextIsReady,
        fetchData,
        lastChangedInfo,
        formatApiError
    }: DataContextType = dataContext;
    const { toast } = useToast();
    const { user, hasPermission, isLoading: isAuthLoading } = useAuth();

    // Core State
    const [currentModel, setCurrentModel] = useState<Model | null>(null);
    const [localObjects, setLocalObjects] = useState<DataObject[]>([]);
    const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowWithDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // UI Interaction State
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
    
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        if (typeof window === 'undefined' || !modelIdFromUrl) {
          return 'table';
        }
        try {
          const storedView = localStorage.getItem(`codex-view-mode-${modelIdFromUrl}`);
          // Ensure the stored value is a valid ViewMode before using it
          if (storedView && ['table', 'gallery', 'kanban', 'inbox', 'calendar'].includes(storedView)) {
            return storedView as ViewMode;
          }
        } catch (error) {
          // localStorage can fail in some environments (e.g., private browsing mode)
          console.error("Failed to read view mode from localStorage", error);
        }
        return 'table'; // Default value
      });

    const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilterValue | null>>({});
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [groupingPropertyKey, setGroupingPropertyKey] = useState<string | null>(null);
    const [viewingRecycleBin, setViewingRecycleBin] = useState(false);
    
    const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
        if (typeof window === 'undefined' || !modelIdFromUrl) {
            return DEFAULT_HIDDEN_COLUMNS;
        }
        try {
            const key = `codex-hidden-columns-${modelIdFromUrl}`;
            const storedHiddenColumns = localStorage.getItem(key);
            if (storedHiddenColumns) {
                const parsed = JSON.parse(storedHiddenColumns);
                if (Array.isArray(parsed)) {
                    return new Set(parsed);
                }
            }
        } catch (error) {
            console.error("Failed to load hidden columns from localStorage on init", error);
        }
        return DEFAULT_HIDDEN_COLUMNS;
    });
    
    // Batch Actions State
    const [selectedObjectIds, setSelectedObjectIds] = useState<Set<string>>(new Set());
    const [isBatchUpdateDialogOpen, setIsBatchUpdateDialogOpen] = useState(false);
    const [batchUpdateProperty, setBatchUpdateProperty] = useState<string>('');
    const [batchUpdateValue, setBatchUpdateValue] = useState<any>('');
    const [batchUpdateDate, setBatchUpdateDate] = useState<Date | undefined>(undefined);
    
    // Dialog State
    const [singleObjectToDelete, setSingleObjectToDelete] = useState<DataObject | null>(null);
    const [batchObjectsToDelete, setBatchObjectsToDelete] = useState<DataObject[]>([]);
    const [isBatchUpdateConfirmOpen, setIsBatchUpdateConfirmOpen] = useState(false);
    const [batchUpdatePreviewData, setBatchUpdatePreviewData] = useState<{
        selectedObjects: DataObject[];
        propertyBeingUpdated: (Property & { type: 'workflow_state' | Property['type'] }) | undefined;
        newValue: any;
    } | null>(null);
    const [isBatchUpdating, setIsBatchUpdating] = useState(false);
    const [isConverterOpen, setIsConverterOpen] = useState(false);

    const previousModelIdRef = useRef<string | null>(null);
    const ITEMS_PER_PAGE = viewMode === 'gallery' ? 12 : 10;
    
    // Persist view mode to localStorage
    useEffect(() => {
        if (typeof window !== 'undefined' && modelIdFromUrl) {
        try {
            localStorage.setItem(`codex-view-mode-${modelIdFromUrl}`, viewMode);
        } catch (error) {
            console.error("Failed to save view mode to localStorage", error);
        }
        }
    }, [viewMode, modelIdFromUrl]);

    useEffect(() => {
        if (!modelIdFromUrl || !dataContextIsReady) return; 
        try {
            const key = `codex-hidden-columns-${modelIdFromUrl}`;
            localStorage.setItem(key, JSON.stringify(Array.from(hiddenColumns)));
        } catch (error) {
            console.error("Failed to save hidden columns to localStorage", error);
        }
    }, [hiddenColumns, modelIdFromUrl, dataContextIsReady]);
    
    // Auth Check
    useEffect(() => {
        if (!isAuthLoading && modelIdFromUrl && !hasPermission(`model:view:${modelIdFromUrl}`)) {
            toast({ variant: 'destructive', title: 'Unauthorized', description: "You don't have permission to view objects of this model." });
            router.replace('/');
        }
    }, [isAuthLoading, modelIdFromUrl, hasPermission, router, toast]);

    // Model and View Setup
    useEffect(() => {
        if (dataContextIsReady && modelIdFromUrl) {
            const foundModel = getModelById(modelIdFromUrl);
            if (foundModel) {
                const isDifferentModel = previousModelIdRef.current !== modelIdFromUrl;
                setCurrentModel(foundModel);

                if (isDifferentModel) {
                    fetchData(`Model ID Change to ${foundModel.name}`);
                    setSearchTerm(''); setCurrentPage(1); setSortConfig(null);
                    setColumnFilters({}); setSelectedObjectIds(new Set()); setViewingRecycleBin(false);
                    const key = `codex-hidden-columns-${modelIdFromUrl}`;
                    const stored = localStorage.getItem(key);
                    setHiddenColumns(stored ? new Set(JSON.parse(stored)) : DEFAULT_HIDDEN_COLUMNS);
                    previousModelIdRef.current = modelIdFromUrl;
                }
            } else {
                toast({ variant: "destructive", title: "Error", description: `Model with ID ${modelIdFromUrl} not found.` });
                router.push('/models');
                previousModelIdRef.current = null;
            }
        }
        setIsLoading(isAuthLoading || !dataContextIsReady);
    }, [modelIdFromUrl, dataContextIsReady, isAuthLoading, getModelById, fetchData, toast, router]);
    
    // Data Sync
    useEffect(() => {
        if (dataContextIsReady && currentModel) {
            setLocalObjects(viewingRecycleBin ? (deletedObjectsFromContext[currentModel.id] || []) : (activeObjectsFromContext[currentModel.id] || []));
            setCurrentWorkflow(currentModel.workflowId ? getWorkflowById(currentModel.workflowId) : null);
        }
    }, [activeObjectsFromContext, deletedObjectsFromContext, currentModel, dataContextIsReady, viewingRecycleBin, getWorkflowById]);

    const getWorkflowStateName = useCallback((stateId: string | null | undefined): string => {
        if (!stateId || !currentWorkflow) return 'N/A';
        const state = currentWorkflow.states.find(s => s.id === stateId);
        return state ? state.name : 'Unknown';
    }, [currentWorkflow]);

    const getOwnerUsername = useCallback((ownerId: string | null | undefined): string => {
        if (!ownerId) return 'Unassigned';
        return allUsers.find(u => u.id === ownerId)?.username || 'Unknown User';
    }, [allUsers]);

    const virtualIncomingRelationColumns: IncomingRelationColumn[] = useMemo(() => {
        if (!currentModel || !allModels.length) return [];
        const columns: IncomingRelationColumn[] = [];
        allModels.forEach(model => {
            model.properties.forEach(property => {
                if (property.type === 'relationship' && property.relatedModelId === currentModel.id) {
                    columns.push({
                        id: `incoming-rel-${model.id}-${property.id}`,
                        headerLabel: `Referenced by ${model.name}`,
                        referencingModel: model,
                        referencingProperty: property,
                        viaPropertyName: property.name,
                    });
                }
            });
        });
        return columns;
    }, [currentModel, allModels]);

    const allDbObjects = useMemo(() => getAllObjects(true), [getAllObjects, dataContextIsReady]);

    const filteredObjects = useMemo(() => {
        if (!currentModel) return [];
        
        const activeFilters = Object.entries(columnFilters).filter(([, filterValue]) => filterValue !== null);

        return localObjects.filter(obj => {
            // 1. Apply general search term filter
            const searchMatch = !searchTerm || JSON.stringify(obj).toLowerCase().includes(searchTerm.toLowerCase());
            if (!searchMatch) return false;

            // 2. Apply specific column filters
            if (activeFilters.length === 0) return true;

            return activeFilters.every(([columnKey, filter]) => {
                if (!filter) return true;
                
                let objectValue: any;
                let property = currentModel.properties.find(p => p.id === columnKey);
                
                if (property) {
                    objectValue = obj[property.name];
                } else if (columnKey === WORKFLOW_STATE_DISPLAY_COLUMN_KEY) {
                    objectValue = obj.currentStateId;
                } else if (columnKey === OWNER_COLUMN_KEY) {
                    objectValue = obj.ownerId;
                } else if ([CREATED_AT_COLUMN_KEY, UPDATED_AT_COLUMN_KEY, DELETED_AT_COLUMN_KEY].includes(columnKey)) {
                    objectValue = obj[columnKey as keyof DataObject];
                } else if (columnKey.startsWith('incoming-rel-')) {
                    const colDef = virtualIncomingRelationColumns.find(c => c.id === columnKey);
                    if (!colDef) return false;
                    const referencingData = allDbObjects[colDef.referencingModel.id] || [];
                    const linkedItems = referencingData.filter(refObj => {
                        const linkedValue = refObj[colDef.referencingProperty.name];
                        return colDef.referencingProperty.relationshipType === 'many' ? Array.isArray(linkedValue) && linkedValue.includes(obj.id) : linkedValue === obj.id;
                    });
                    if (filter.operator === 'specific_incoming_reference') {
                         if (filter.value === INTERNAL_NO_REFERENCES_VALUE) return linkedItems.length === 0;
                         return linkedItems.some(item => item.id === filter.value);
                    } else { // 'incomingRelationshipCount' -> boolean filter
                        return filter.value ? linkedItems.length > 0 : linkedItems.length === 0;
                    }
                } else {
                    return true;
                }
                
                switch (filter.operator) {
                    case 'contains': return String(objectValue ?? '').toLowerCase().includes(String(filter.value).toLowerCase());
                    case 'eq':
                        if (property?.type === 'boolean' || typeof objectValue === 'boolean') { return Boolean(objectValue) === Boolean(filter.value); }
                        return String(objectValue ?? '') === String(filter.value);
                    case 'gt': return (objectValue ?? -Infinity) > filter.value;
                    case 'lt': return (objectValue ?? Infinity) < filter.value;
                    case 'gte': return (objectValue ?? -Infinity) >= filter.value;
                    case 'lte': return (objectValue ?? Infinity) <= filter.value;
                    case 'date_eq': return objectValue && isEqualDate(startOfDay(new Date(objectValue)), startOfDay(new Date(filter.value)));
                    case 'includes': return Array.isArray(objectValue) && objectValue.includes(filter.value);
                    default: return true;
                }
            });
        });
    }, [localObjects, searchTerm, currentModel, columnFilters, allDbObjects, virtualIncomingRelationColumns]);

    const sortedObjects = useMemo(() => {
        let objectsToSort = [...filteredObjects];
        if (sortConfig) {
            objectsToSort.sort((a, b) => {
                const { key, direction } = sortConfig;
                let valueA: any, valueB: any;
                
                const prop = currentModel.properties.find(p => p.id === key);
                const virtualCol = virtualIncomingRelationColumns.find(c => c.id === key);

                if (prop) {
                    valueA = a[prop.name];
                    valueB = b[prop.name];
                } else if (virtualCol) {
                    const getLinkCount = (objId: string) => {
                        const referencingData = allDbObjects[virtualCol.referencingModel.id] || [];
                        return referencingData.filter(refObj => {
                            const linkedValue = refObj[virtualCol.referencingProperty.name];
                            return virtualCol.referencingProperty.relationshipType === 'many' ? Array.isArray(linkedValue) && linkedValue.includes(objId) : linkedValue === objId;
                        }).length;
                    };
                    valueA = getLinkCount(a.id);
                    valueB = getLinkCount(b.id);
                }
                else {
                    switch (key) {
                        case WORKFLOW_STATE_DISPLAY_COLUMN_KEY:
                            valueA = getWorkflowStateName(a.currentStateId);
                            valueB = getWorkflowStateName(b.currentStateId);
                            break;
                        case OWNER_COLUMN_KEY:
                            valueA = getOwnerUsername(a.ownerId);
                            valueB = getOwnerUsername(b.ownerId);
                            break;
                        default:
                            valueA = a[key as keyof DataObject];
                            valueB = b[key as keyof DataObject];
                            break;
                    }
                }
                
                if (valueA === null || valueA === undefined) return direction === 'asc' ? -1 : 1;
                if (valueB === null || valueB === undefined) return direction === 'asc' ? 1 : -1;
                
                let comparison = 0;
                if (typeof valueA === 'number' && typeof valueB === 'number') {
                    comparison = valueA - valueB;
                } else if (isDateValidFn(new Date(valueA)) && isDateValidFn(new Date(valueB))) {
                    comparison = new Date(valueA).getTime() - new Date(valueB).getTime();
                }
                else {
                    comparison = String(valueA).localeCompare(String(valueB));
                }
                return direction === 'asc' ? comparison : -comparison;
            });
        }
        return objectsToSort;
    }, [filteredObjects, sortConfig, currentModel, getWorkflowStateName, getOwnerUsername, virtualIncomingRelationColumns, allDbObjects]);

    const groupedDataForRender = useMemo(() => {
        if (!groupingPropertyKey || !currentModel) return null;
        
        let propertyToGroup = currentModel.properties.find(p => p.id === groupingPropertyKey);
        if (!propertyToGroup && groupingPropertyKey === WORKFLOW_STATE_GROUPING_KEY) {
            propertyToGroup = { name: 'currentStateId' } as Property; // Mock property for workflow state
        } else if (!propertyToGroup && groupingPropertyKey === OWNER_COLUMN_KEY) {
            propertyToGroup = { name: 'ownerId' } as Property; // Mock property for owner
        } else if (!propertyToGroup) return null;
        
        const groups = sortedObjects.reduce((acc, obj) => {
          let groupValue = getObjectGroupValue(obj, propertyToGroup, allModels, allDbObjects);
          if (groupingPropertyKey === WORKFLOW_STATE_GROUPING_KEY) groupValue = getWorkflowStateName(obj.currentStateId);
          if (groupingPropertyKey === OWNER_COLUMN_KEY) groupValue = getOwnerUsername(obj.ownerId);

          if (!acc[groupValue]) acc[groupValue] = [];
          acc[groupValue].push(obj);
          return acc;
        }, {} as Record<string, DataObject[]>);
        
        return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    }, [groupingPropertyKey, sortedObjects, currentModel, allModels, allDbObjects, getWorkflowStateName, getOwnerUsername]);

    const totalItemsForPagination = useMemo(() => {
        return groupedDataForRender ? groupedDataForRender.length : sortedObjects.length;
    }, [groupedDataForRender, sortedObjects]);

    const totalPages = useMemo(() => Math.ceil(totalItemsForPagination / ITEMS_PER_PAGE), [totalItemsForPagination, ITEMS_PER_PAGE]);
    
    const paginatedDataToRender = useMemo(() => {
        const itemsToPaginate = groupedDataForRender || sortedObjects;
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return itemsToPaginate.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [groupedDataForRender, sortedObjects, currentPage, ITEMS_PER_PAGE]);
    
    const isAllPaginatedSelected = useMemo(() => {
        const idsOnPage = (paginatedDataToRender as DataObject[]).map(obj => obj.id);
        return idsOnPage.length > 0 && idsOnPage.every(id => selectedObjectIds.has(id));
    }, [paginatedDataToRender, selectedObjectIds]);
    
    const canShowCalendarView = useMemo(() => {
      if (!currentModel) return false;
      return currentModel.properties.some(p => p.type === 'date' || p.type === 'datetime');
    }, [currentModel]);

    const deletedObjectCount = useMemo(() => {
        if (!deletedObjectsFromContext) return 0;
        return Object.values(deletedObjectsFromContext).reduce((sum, arr) => sum + arr.length, 0);
    }, [deletedObjectsFromContext]);

    const handleCreateNew = useCallback(() => {
        if (!modelIdFromUrl) return;
        router.push(`/data/${modelIdFromUrl}/new`);
    }, [router, modelIdFromUrl]);
    
    const batchUpdatableProperties = useMemo(() => {
        if (!currentModel) return [];
        const props: Array<{ id: string; name: string; label: string; type: Property['type']; relationshipType?: 'one' | 'many'; relatedModelId?: string; }> = [];

        if (currentWorkflow) {
            props.push({ id: WORKFLOW_STATE_DISPLAY_COLUMN_KEY, name: INTERNAL_WORKFLOW_STATE_UPDATE_KEY, label: 'Workflow State', type: 'workflow_state' });
        }

        currentModel.properties.forEach(p => {
            if (p.type !== 'image' && p.type !== 'fileAttachment' && p.type !== 'markdown' && p.type !== 'url') {
                props.push({ ...p, label: p.name });
            }
        });

        return props;
    }, [currentModel, currentWorkflow]);
    
    const allAvailableColumnsForToggle = useMemo(() => {
        if (!currentModel) return [];
        const columns: ColumnToggleOption[] = [];
        columns.push({ id: SELECT_ALL_CHECKBOX_COLUMN_KEY, label: 'Selection Checkbox', type: 'action' });
        columns.push({ id: VIEW_ACTION_COLUMN_KEY, label: 'View Icon', type: 'action' });
        currentModel.properties.forEach(prop => columns.push({ id: prop.id, label: prop.name, type: 'property' }));
        virtualIncomingRelationColumns.forEach(col => columns.push({ id: col.id, label: col.headerLabel, type: 'virtual' }));
        if (currentWorkflow) columns.push({ id: WORKFLOW_STATE_DISPLAY_COLUMN_KEY, label: 'Workflow State', type: 'workflow' });
        columns.push({ id: OWNER_COLUMN_KEY, label: 'Owned By', type: 'owner' });
        columns.push({ id: CREATED_AT_COLUMN_KEY, label: 'Created At', type: 'metadata' });
        columns.push({ id: UPDATED_AT_COLUMN_KEY, label: 'Updated At', type: 'metadata' });
        columns.push({ id: DELETED_AT_COLUMN_KEY, label: 'Deleted At', type: 'metadata' });
        columns.push({ id: ACTIONS_COLUMN_KEY, label: 'Actions Menu', type: 'action' });
        return columns;
    }, [currentModel, currentWorkflow, virtualIncomingRelationColumns]);

    const toggleColumnVisibility = useCallback((columnId: string, hide: boolean) => {
        setHiddenColumns(prev => {
            const newSet = new Set(prev);
            if (hide) {
                newSet.add(columnId);
            } else {
                newSet.delete(columnId);
            }
            return newSet;
        });
    }, []);

    const handleViewModeChange = useCallback((newMode: ViewMode) => setViewMode(newMode), []);
    const requestSort = useCallback((key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
        setCurrentPage(1);
    }, [sortConfig]);
    
    const handleDeletionSuccess = useCallback(() => {
        toast({ title: "Deletion Successful", description: "The selected object(s) have been moved to the recycle bin." });
        fetchData("After successful deletion");
        setSelectedObjectIds(new Set());
    }, [toast, fetchData]);

    const handleRestoreObject = useCallback(async (objectId: string, objectName: string) => {
        if (!currentModel) return;
        try {
            await contextRestoreObject(currentModel.id, objectId);
            setSelectedObjectIds(prev => {
                const newSet = new Set(prev); newSet.delete(objectId); return newSet;
            });
            toast({ title: `${currentModel.name} Restored`, description: `"${objectName}" has been restored.` });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error Restoring", description: error.message });
        }
    }, [currentModel, contextRestoreObject, toast]);

    const handleStateChangeViaDrag = useCallback(async (objectId: string, newStateId: string) => {
        if (!currentModel) return;
        setIsRefreshing(true);
        try {
            await contextUpdateObject(currentModel.id, objectId, { currentStateId: newStateId });
            const state = currentWorkflow?.states.find(s => s.id === newStateId);
            toast({ title: "State Updated", description: `Object moved to "${state?.name}".` });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error Updating State", description: error.message });
        } finally {
            setIsRefreshing(false);
        }
    }, [currentModel, contextUpdateObject, currentWorkflow, toast]);
    
    const handleColumnFilterChange = useCallback((key: string, filter: ColumnFilterValue | null) => setColumnFilters(prev => ({ ...prev, [key]: filter })), []);
    const handleClearAllColumnFilters = useCallback(() => setColumnFilters({}), []);
    const handleSelectAllOnPage = useCallback((checked: boolean) => {
        const idsOnPage = (paginatedDataToRender as DataObject[]).map(o => o.id);
        setSelectedObjectIds(prev => {
            const newSet = new Set(prev);
            if (checked) idsOnPage.forEach(id => newSet.add(id));
            else idsOnPage.forEach(id => newSet.delete(id));
            return newSet;
        });
    }, [paginatedDataToRender]);
    const handleRowSelect = useCallback((id: string, checked: boolean) => {
        setSelectedObjectIds(prev => {
            const newSet = new Set(prev);
            if (checked) newSet.add(id);
            else newSet.delete(id);
            return newSet;
        });
    }, []);
    const handleRefreshData = useCallback(() => { setIsRefreshing(true); fetchData('Manual Refresh').finally(() => setIsRefreshing(false)); }, [fetchData]);

    const { data: shareLinks } = useQuery<SharedObjectLink[]>({
      queryKey: ['shareLinksForModel', modelIdFromUrl],
      queryFn: async () => { return []; },
      enabled: !!modelIdFromUrl,
    });
    const createShareStatus = useMemo(() => { return 'none' as 'create' | 'none' }, [shareLinks]);
    const groupableProperties = useMemo(() => {
        if (!currentModel) return [];
        const properties = currentModel.properties
            .filter(p => ['string', 'boolean', 'rating', 'relationship'].includes(p.type) && p.relationshipType !== 'many')
            .map(p => ({ id: p.id, name: p.name, isWorkflowState: false, isOwnerColumn: false, isDateColumn: false })); // Added default booleans
        if (currentWorkflow) {
            properties.push({ id: WORKFLOW_STATE_GROUPING_KEY, name: 'Workflow State', isWorkflowState: true, isOwnerColumn: false, isDateColumn: false });
        }
        properties.push({ id: OWNER_COLUMN_KEY, name: 'Owner', isOwnerColumn: true, isWorkflowState: false, isDateColumn: false });
        return properties;
    }, [currentModel, currentWorkflow]);

    const handleEdit = useCallback((obj: DataObject) => router.push(`/data/${modelIdFromUrl}/edit/${obj.id}`), [router, modelIdFromUrl]);
    const handleEditModelStructure = useCallback(() => router.push(`/models/edit/${modelIdFromUrl}`), [router, modelIdFromUrl]);
    const handleView = useCallback((obj: DataObject) => router.push(`/data/${modelIdFromUrl}/view/${obj.id}`), [router, modelIdFromUrl]);
    const handleSingleDeleteRequest = useCallback((obj: DataObject) => setSingleObjectToDelete(obj), []);
    const handleBatchDeleteRequest = useCallback(() => {
        const objects = localObjects.filter(obj => selectedObjectIds.has(obj.id));
        setBatchObjectsToDelete(objects);
    }, [localObjects, selectedObjectIds]);
    
    const handleBatchUpdateDialogInteractOutside = useCallback((event: Event) => {
        const target = event.target as HTMLElement;
        if (target.closest('[data-radix-popper-content-wrapper]')) {
          event.preventDefault();
        }
    }, []);

    const prepareBatchUpdateForConfirmation = useCallback(() => {
        if (!currentModel || !batchUpdateProperty || selectedObjectIds.size === 0) {
          toast({ variant: 'destructive', title: 'Error', description: 'Cannot prepare batch update. Missing required information.' });
          return;
        }

        const propertyDetails = batchUpdatableProperties.find(p => p.name === batchUpdateProperty);
        if (!propertyDetails) {
          toast({ variant: 'destructive', title: 'Error', description: `Property "${batchUpdateProperty}" not found.` });
          return;
        }

        let finalValue = batchUpdateValue;
        if (propertyDetails.type === 'date' && batchUpdateDate) {
          finalValue = batchUpdateDate.toISOString();
        } else if (propertyDetails.type === 'boolean') {
          finalValue = Boolean(batchUpdateValue);
        }

        const objectsToUpdate = localObjects.filter(obj => selectedObjectIds.has(obj.id));

        setBatchUpdatePreviewData({
          selectedObjects: objectsToUpdate,
          propertyBeingUpdated: propertyDetails,
          newValue: finalValue,
        });
        
        setIsBatchUpdateDialogOpen(false);
        setIsBatchUpdateConfirmOpen(true);
    }, [
        currentModel, batchUpdateProperty, selectedObjectIds, toast, batchUpdatableProperties, 
        batchUpdateValue, batchUpdateDate, localObjects
    ]);

    const executeBatchUpdate = useCallback(async () => {
        if (!currentModel || !batchUpdatePreviewData) return;

        setIsBatchUpdating(true);
        try {
          const { propertyBeingUpdated, newValue } = batchUpdatePreviewData;
          if (!propertyBeingUpdated) throw new Error("Property to update not defined.");

          const payload = {
            objectIds: Array.from(selectedObjectIds),
            propertyName: propertyBeingUpdated.name,
            propertyType: propertyBeingUpdated.type,
            newValue: newValue,
          };
          
          const response = await fetch(`/api/codex-structure/models/${currentModel.id}/objects/batch-update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || result.message || 'Batch update failed.');
          }
          
          toast({ title: 'Batch Update Successful', description: result.message || `${selectedObjectIds.size} items updated.` });
          
          // Cleanup
          setIsBatchUpdateConfirmOpen(false);
          setSelectedObjectIds(new Set());
          setBatchUpdateProperty('');
          setBatchUpdateValue('');
          setBatchUpdateDate(undefined);
          
          await fetchData('After Batch Update');

        } catch (error: any) {
          toast({ variant: 'destructive', title: 'Batch Update Failed', description: error.message });
        } finally {
          setIsBatchUpdating(false);
        }
    }, [
        currentModel, batchUpdatePreviewData, selectedObjectIds, toast, fetchData
    ]);

    const getFilterDisplayDetails = useCallback((columnKey: string, filter: ColumnFilterValue): { label: string; value: string } | null => {
        if (!currentModel) return null;

        let property: (Property | IncomingRelationColumn | { name: string, type: 'workflowState' | 'owner' | 'date' }) | undefined;
        let label = '';
        let displayValue = String(filter.value);

        if (columnKey === WORKFLOW_STATE_DISPLAY_COLUMN_KEY) {
            property = { name: 'Workflow State', type: 'workflowState' };
            label = 'State';
            const state = currentWorkflow?.states.find(s => s.id === filter.value);
            displayValue = state?.name || 'Unknown State';
        } else if (columnKey === OWNER_COLUMN_KEY) {
            property = { name: 'Owner', type: 'owner' };
            label = 'Owner';
            const user = allUsers.find(u => u.id === filter.value);
            displayValue = user?.username || 'Unknown User';
        } else if (columnKey === CREATED_AT_COLUMN_KEY || columnKey === UPDATED_AT_COLUMN_KEY || columnKey === DELETED_AT_COLUMN_KEY) {
            property = { name: columnKey === CREATED_AT_COLUMN_KEY ? 'Created At' : (columnKey === UPDATED_AT_COLUMN_KEY ? 'Updated At' : 'Deleted At'), type: 'date'};
            label = property.name;
            if (isDateValidFn(new Date(filter.value))) {
                displayValue = formatDateFns(new Date(filter.value), 'PP');
            }
        } else {
            property = [...currentModel.properties, ...virtualIncomingRelationColumns].find(p => p.id === columnKey);
            if (!property) return null;
            label = 'headerLabel' in property ? property.headerLabel : property.name;

            if ('type' in property && property.type === 'relationship') {
                const relatedModel = getModelById(property.relatedModelId || '');
                if (relatedModel) {
                    const relatedObject = (allDbObjects[property.relatedModelId!] || []).find(o => o.id === filter.value);
                    displayValue = getObjectDisplayValue(relatedObject, relatedModel, allModels, allDbObjects);
                }
            }
        }
        
        return { label, value: displayValue };

    }, [currentModel, virtualIncomingRelationColumns, currentWorkflow, allUsers, allModels, allDbObjects, getModelById]);


    return {
        // State
        currentModel,
        currentWorkflow,
        isLoading,
        viewingRecycleBin,
        setViewingRecycleBin,
        viewMode,
        searchTerm,
        setSearchTerm,
        currentPage,
        setCurrentPage,
        sortConfig,
        columnFilters,
        selectedObjectIds,
        setSelectedObjectIds,
        isBatchUpdateDialogOpen,
        setIsBatchUpdateDialogOpen,
        batchUpdateProperty,
        setBatchUpdateProperty,
        batchUpdateValue,
        setBatchUpdateValue,
        batchUpdateDate,
        setDate: setBatchUpdateDate,
        groupingPropertyKey,
        setGroupingPropertyKey,
        hiddenColumns,
        singleObjectToDelete,
        setSingleObjectToDelete,
        batchObjectsToDelete,
        setBatchObjectsToDelete,
        isBatchUpdateConfirmOpen,
        setIsBatchUpdateConfirmOpen,
        batchUpdatePreviewData,
        isRefreshing,
        isBatchUpdating,
        deletedObjectCount,
        isConverterOpen,
        setIsConverterOpen,

        // Derived Data
        localObjects,
        sortedObjects,
        paginatedDataToRender,
        groupedDataForRender,
        totalPages,
        totalItemsForPagination,
        isAllPaginatedSelected,
        hasActiveColumnFilters: Object.values(columnFilters).some(v => v !== null),
        canShowCalendarView,
        groupableProperties,
        allAvailableColumnsForToggle,
        virtualIncomingRelationColumns,
        createShareStatus,
        batchUpdatableProperties,

        // Context Data
        allModels,
        allDbObjects,
        lastChangedInfo,
        hasPermission,
        getModelById,
        getObjectsByModelId,
        getAllObjects,

        // Handlers
        handleViewModeChange,
        requestSort,
        handleColumnFilterChange,
        handleClearAllColumnFilters,
        handleSelectAllOnPage,
        handleRowSelect,
        handleRefreshData,
        handleEditModelStructure,
        onCreateNew: handleCreateNew,
        handleView,
        handleEdit,
        handleSingleDeleteRequest,
        handleBatchDeleteRequest,
        handleDeletionSuccess,
        handleRestoreObject,
        prepareBatchUpdateForConfirmation,
        executeBatchUpdate,
        handleBatchUpdateDialogInteractOutside,
        handleStateChangeViaDrag,
        toggleColumnVisibility,

        // Helpers
        getFilterDisplayDetails,
        getWorkflowStateName,
        getOwnerUsername,
        fetchData,
    };
}
