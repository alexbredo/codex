
'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
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
    const [viewMode, setViewMode] = useState<ViewMode>('table');
    const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilterValue | null>>({});
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [groupingPropertyKey, setGroupingPropertyKey] = useState<string | null>(null);
    const [viewingRecycleBin, setViewingRecycleBin] = useState(false);
    
    // Use lazy initialization for useState to read from localStorage only once on mount
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

    const previousModelIdRef = useRef<string | null>(null);
    const ITEMS_PER_PAGE = viewMode === 'gallery' ? 12 : 10;

    // Save hidden columns to localStorage whenever they change
    useEffect(() => {
        if (!modelIdFromUrl || !dataContextIsReady) return; // Wait for context to be ready
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
                    // Load columns for the new model
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

    // Derived Data (useMemo hooks)
    const deletedObjectCount = useMemo(() => {
        if (!currentModel || !deletedObjectsFromContext) return 0;
        return (deletedObjectsFromContext[currentModel.id] || []).length;
    }, [currentModel, deletedObjectsFromContext]);

    const allDbObjects = useMemo(() => getAllObjects(true), [getAllObjects, dataContextIsReady]);
    const filteredObjects = useMemo(() => {
        if (!currentModel) return [];
        // Filtering logic... (simplified for brevity)
        return localObjects.filter(obj => JSON.stringify(obj).toLowerCase().includes(searchTerm.toLowerCase()));
    }, [localObjects, searchTerm, currentModel, columnFilters, allDbObjects, allModels]);

    const sortedObjects = useMemo(() => {
        let objectsToSort = [...filteredObjects];
        if (sortConfig) {
            // Sorting logic...
        }
        return objectsToSort;
    }, [filteredObjects, sortConfig, currentModel]);

    const groupedDataForRender = useMemo(() => {
        if (!groupingPropertyKey || !currentModel) return null;
        // Grouping logic...
        return null;
    }, [groupingPropertyKey, sortedObjects, currentModel]);

    const totalPages = useMemo(() => Math.ceil((groupedDataForRender ? groupedDataForRender.length : sortedObjects.length) / ITEMS_PER_PAGE), [groupedDataForRender, sortedObjects, ITEMS_PER_PAGE]);
    
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


    const handleCreateNew = useCallback(() => {
        if (!modelIdFromUrl) return;
        router.push(`/data/${modelIdFromUrl}/new`);
    }, [router, modelIdFromUrl]);

    const virtualIncomingRelationColumns: IncomingRelationColumn[] = useMemo(() => [], [currentModel, allModels]);
    
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

    // Handlers (useCallback hooks)
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
    
    // Other handlers (simplified)
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
      queryFn: async () => { /* ... */ return []; },
      enabled: !!modelIdFromUrl,
    });
    const createShareStatus = useMemo(() => { /* ... */ return 'none' as 'create' | 'none' }, [shareLinks]);
    const groupableProperties = useMemo(() => { /* ... */ return [] }, [currentModel, currentWorkflow]);
    const getFilterDisplayDetails = useCallback(() => { /* ... */ return null }, []);
    const handleEdit = useCallback((obj: DataObject) => router.push(`/data/${modelIdFromUrl}/edit/${obj.id}`), [router, modelIdFromUrl]);
    const handleEditModelStructure = useCallback(() => router.push(`/models/edit/${modelIdFromUrl}`), [router, modelIdFromUrl]);
    const handleView = useCallback((obj: DataObject) => router.push(`/data/${modelIdFromUrl}/view/${obj.id}`), [router, modelIdFromUrl]);
    const handleSingleDeleteRequest = useCallback((obj: DataObject) => setSingleObjectToDelete(obj), []);
    const handleBatchDeleteRequest = useCallback(() => {
        const objects = localObjects.filter(obj => selectedObjectIds.has(obj.id));
        setBatchObjectsToDelete(objects);
    }, [localObjects, selectedObjectIds]);
    const prepareBatchUpdateForConfirmation = useCallback(() => { /* ... */ }, []);
    const executeBatchUpdate = useCallback(async () => { /* ... */ }, []);
    const handleBatchUpdateDialogInteractOutside = useCallback(() => { /* ... */ }, []);
    
    const getWorkflowStateName = useCallback(() => "State", []);
    const getOwnerUsername = useCallback(() => "User", []);
    const totalItemsForPagination = sortedObjects.length;
    const hasActiveColumnFilters = Object.values(columnFilters).some(v => v !== null);

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

        // Derived Data
        localObjects,
        sortedObjects,
        paginatedDataToRender,
        groupedDataForRender,
        totalPages,
        totalItemsForPagination,
        isAllPaginatedSelected,
        hasActiveColumnFilters,
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
    };
}
