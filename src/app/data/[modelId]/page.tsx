
'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from "@/hooks/use-toast";
import { Loader2, PlusCircle, Archive, Trash2, Inbox, Edit3, Replace, UploadCloud } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import GalleryCard from '@/components/objects/gallery-card';
import KanbanBoard from '@/components/objects/kanban-board';
import DataObjectsPageHeader from '@/components/objects/data-objects-page-header';
import DataObjectsTable from '@/components/objects/data-objects-table';
import DeleteObjectDialog from '@/components/objects/delete-object-dialog';
import BatchUpdateConfirmationDialog from '@/components/objects/batch-update-confirmation-dialog';
import { useDataViewLogic } from '@/hooks/useDataViewLogic';
import BatchUpdateDialog from '@/components/objects/batch-update-dialog';
import InboxView from '@/components/objects/inbox-view';
import CalendarView from '@/components/objects/CalendarView';
import BatchDeleteConfirmationDialog from '@/components/objects/batch-delete-confirmation-dialog';
import ObjectConverterDialog from '@/components/objects/ObjectConverterDialog';
import { CsvImporterDialog } from '@/components/objects/CsvImporterDialog';


export type ViewMode = 'table' | 'gallery' | 'kanban' | 'inbox' | 'calendar';

export default function DataObjectsPage() {
  const params = useParams();
  const modelIdFromUrl = params.modelId as string;
  const router = useRouter();

  const {
    // Component State
    currentModel,
    currentWorkflow,
    isLoading,
    viewingRecycleBin,
    setViewingRecycleBin,
    viewMode,
    handleViewModeChange,
    singleObjectToDelete,
    setSingleObjectToDelete,
    batchObjectsToDelete,
    setBatchObjectsToDelete,
    isBatchUpdateConfirmOpen,
    setIsBatchUpdateConfirmOpen,
    batchUpdatePreviewData,
    deletedObjectCount,
    isConverterOpen,
    setIsConverterOpen,
    isImporterOpen, // New state for CSV importer
    setIsImporterOpen, // New state for CSV importer
    
    // Search and Filter State & Handlers
    searchTerm,
    setSearchTerm,
    columnFilters,
    handleColumnFilterChange,
    handleClearAllColumnFilters,
    getFilterDisplayDetails,
    hasActiveColumnFilters,

    // Data State & Derived Data
    localObjects,
    sortedObjects,
    paginatedDataToRender,
    groupedDataForRender,
    totalPages,
    totalItemsForPagination,
    canShowCalendarView,
    
    // Pagination State & Handlers
    currentPage,
    setCurrentPage,

    // Selection State & Handlers
    selectedObjectIds,
    setSelectedObjectIds,
    isAllPaginatedSelected,
    handleSelectAllOnPage,
    handleRowSelect,

    // Sorting State & Handlers
    sortConfig,
    requestSort,

    // Grouping State & Handlers
    groupingPropertyKey,
    setGroupingPropertyKey,
    groupableProperties,
    
    // Column Visibility State & Handlers
    hiddenColumns,
    toggleColumnVisibility,
    allAvailableColumnsForToggle,
    
    // Batch Actions State & Handlers
    isBatchUpdating,
    isBatchUpdateDialogOpen,
    setIsBatchUpdateDialogOpen,
    batchUpdateProperty,
    setBatchUpdateProperty,
    batchUpdateValue,
    setBatchUpdateValue,
    batchUpdateDate,
    setBatchUpdateDate,
    prepareBatchUpdateForConfirmation,
    executeBatchUpdate,
    handleBatchDeleteRequest,
    handleBatchUpdateDialogInteractOutside,

    // CRUD and other actions
    isRefreshing,
    handleRefreshData,
    handleEditModelStructure,
    onCreateNew,
    handleDeletionSuccess,
    handleRestoreObject,
    handleStateChangeViaDrag,
    handleView,
    handleEdit,
    handleSingleDeleteRequest,
    
    // Context-derived data & helpers
    allModels,
    allDbObjects,
    getWorkflowStateName,
    getOwnerUsername,
    lastChangedInfo,
    virtualIncomingRelationColumns,
    createShareStatus,
    hasPermission,
    getModelById,
    getObjectsByModelId,
    getAllObjects,
    batchUpdatableProperties,
    fetchData,
  } = useDataViewLogic(modelIdFromUrl);

  const { toast } = useToast();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
        <p className="text-lg text-muted-foreground">Loading data objects...</p>
      </div>
    );
  }

  if (!currentModel) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-lg text-muted-foreground">Model not found or you do not have permission to view it.</p>
      </div>
    );
  }

  const renderEmptyState = () => (
    <Card className="text-center py-12">
      <CardContent>
        <Inbox className="mx-auto text-muted-foreground mb-4 h-12 w-12" />
        <h3 className="text-xl font-semibold">No Objects Found</h3>
        {searchTerm || hasActiveColumnFilters ? (
          <p className="text-muted-foreground mb-4">
            Your search or filters did not match any {viewingRecycleBin ? 'deleted' : 'active'} objects.
          </p>
        ) : (
          <p className="text-muted-foreground mb-4">
            There are no {viewingRecycleBin ? 'deleted' : 'active'} data objects for the model "{currentModel.name}" yet.
          </p>
        )}
        {!viewingRecycleBin && hasPermission('objects:create') && !searchTerm && !hasActiveColumnFilters && (
          <Button onClick={onCreateNew} variant="default">
            <PlusCircle className="mr-2 h-4 w-4" /> Create First Object
          </Button>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto py-8">
      <DeleteObjectDialog
        objectToDelete={singleObjectToDelete}
        model={currentModel}
        onClose={() => setSingleObjectToDelete(null)}
        onSuccess={handleDeletionSuccess}
      />
      <BatchDeleteConfirmationDialog
        objectsToDelete={batchObjectsToDelete}
        onClose={() => setBatchObjectsToDelete([])}
        onSuccess={() => {
          setBatchObjectsToDelete([]);
          handleDeletionSuccess();
        }}
      />
      <BatchUpdateConfirmationDialog
        isOpen={isBatchUpdateConfirmOpen}
        onClose={() => setIsBatchUpdateConfirmOpen(false)}
        onConfirm={executeBatchUpdate}
        isConfirming={isBatchUpdating}
        model={currentModel}
        selectedObjects={batchUpdatePreviewData?.selectedObjects || []}
        propertyBeingUpdated={batchUpdatePreviewData?.propertyBeingUpdated}
        newValue={batchUpdatePreviewData?.newValue}
        currentWorkflow={currentWorkflow}
        allModels={allModels}
        allDbObjects={allDbObjects}
      />
      <BatchUpdateDialog
        isOpen={isBatchUpdateDialogOpen}
        setIsOpen={setIsBatchUpdateDialogOpen}
        selectedObjectIds={selectedObjectIds}
        property={batchUpdateProperty}
        setProperty={setBatchUpdateProperty}
        value={batchUpdateValue}
        setValue={setBatchUpdateValue}
        date={batchUpdateDate}
        setDate={setBatchUpdateDate}
        onConfirm={prepareBatchUpdateForConfirmation}
        onInteractOutside={handleBatchUpdateDialogInteractOutside}
        batchUpdatableProperties={batchUpdatableProperties}
        currentWorkflow={currentWorkflow}
        getModelById={getModelById}
        getObjectsByModelId={getObjectsByModelId}
        allModels={allModels}
        getAllObjects={getAllObjects}
      />
       {isConverterOpen && (
        <ObjectConverterDialog
            isOpen={isConverterOpen}
            onClose={() => setIsConverterOpen(false)}
            sourceModel={currentModel}
            objectIdsToConvert={Array.from(selectedObjectIds)}
            onSuccess={() => {
                toast({ title: "Conversion Successful", description: "Objects have been converted to the new model." });
                setSelectedObjectIds(new Set()); // Clear selection
                fetchData("After object conversion");
            }}
        />
      )}
      {isImporterOpen && (
        <CsvImporterDialog
            isOpen={isImporterOpen}
            onClose={() => setIsImporterOpen(false)}
            model={currentModel}
            onSuccess={() => {
                toast({ title: "Import Successful", description: "Data has been imported." });
                fetchData("After CSV import");
            }}
        />
      )}
      
      <DataObjectsPageHeader
        currentModel={currentModel}
        currentWorkflow={currentWorkflow}
        searchTerm={searchTerm}
        onSearchTermChange={(term) => { setSearchTerm(term); setCurrentPage(1); }}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        canShowCalendarView={canShowCalendarView}
        allAvailableColumnsForToggle={allAvailableColumnsForToggle}
        hiddenColumns={hiddenColumns}
        onToggleColumnVisibility={toggleColumnVisibility}
        groupableProperties={groupableProperties}
        groupingPropertyKey={groupingPropertyKey}
        onGroupingPropertyKeyChange={(key) => { setGroupingPropertyKey(key); setCurrentPage(1); }}
        isRefreshing={isRefreshing}
        onRefreshData={handleRefreshData}
        onEditModelStructure={handleEditModelStructure}
        onCreateNew={onCreateNew}
        onNavigateBack={() => router.push('/models')}
        viewingRecycleBin={viewingRecycleBin}
        createShareStatus={createShareStatus}
        hasPermission={hasPermission}
        onOpenImporter={() => setIsImporterOpen(true)} // New prop
      />
      
      <div className="flex items-center justify-between space-x-2 mb-4">
        <div className="flex-grow">
          {selectedObjectIds.size > 0 && viewMode !== 'kanban' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{selectedObjectIds.size} selected</span>
               <Button
                variant="default"
                size="sm"
                className="bg-primary hover:bg-primary/90"
                onClick={() => setIsBatchUpdateDialogOpen(true)}
                disabled={viewingRecycleBin}
              >
                <Edit3 className="mr-2 h-4 w-4" /> Batch Update
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBatchDeleteRequest}
                disabled={viewingRecycleBin}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Selected
              </Button>
              {hasPermission('objects:convert') && (
                <Button
                  onClick={() => setIsConverterOpen(true)}
                  variant="outline"
                  size="sm"
                  disabled={viewingRecycleBin}
                >
                  <Replace className="mr-2 h-4 w-4" /> Convert...
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={viewingRecycleBin ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setViewingRecycleBin(!viewingRecycleBin);
              setCurrentPage(1);
            }}
          >
            <Archive className="mr-2 h-4 w-4" />
            {viewingRecycleBin ? 'View Active' : 'Recycle Bin'}
            {!viewingRecycleBin && deletedObjectCount > 0 && (
              <Badge variant="destructive" className="ml-2">{deletedObjectCount}</Badge>
            )}
          </Button>
        </div>
      </div>
      
      {localObjects.length === 0 ? renderEmptyState() : (
        <>
          {viewMode === 'table' && (
             <Card className="shadow-lg">
              <DataObjectsTable
                model={currentModel}
                objectsToDisplay={paginatedDataToRender}
                allModels={allModels}
                allDbObjects={allDbObjects}
                currentWorkflow={currentWorkflow}
                hiddenColumns={hiddenColumns}
                sortConfig={sortConfig}
                columnFilters={columnFilters}
                selectedObjectIds={selectedObjectIds}
                isAllSelectedOnPage={isAllPaginatedSelected}
                viewingRecycleBin={viewingRecycleBin}
                lastChangedInfo={lastChangedInfo}
                virtualIncomingRelationColumns={virtualIncomingRelationColumns}
                groupingPropertyKey={groupingPropertyKey}
                requestSort={requestSort}
                handleColumnFilterChange={handleColumnFilterChange}
                handleSelectAllOnPage={handleSelectAllOnPage}
                handleRowSelect={handleRowSelect}
                handleView={handleView}
                handleEdit={handleEdit}
                handleDeleteRequest={handleSingleDeleteRequest}
                handleRestoreObject={handleRestoreObject}
                getWorkflowStateName={getWorkflowStateName}
                getOwnerUsername={getOwnerUsername}
              />
            </Card>
          )}

          {viewMode === 'gallery' && (
             <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {(paginatedDataToRender as DataObject[]).map((obj) => ( <GalleryCard key={obj.id} obj={obj} model={currentModel!} allModels={allModels} allObjects={allDbObjects} currentWorkflow={currentWorkflow} getWorkflowStateName={getWorkflowStateName} onView={handleView} onEdit={handleEdit} onDeleteRequest={handleSingleDeleteRequest} viewingRecycleBin={viewingRecycleBin} onRestore={handleRestoreObject} lastChangedInfo={lastChangedInfo} /> ))}
            </div>
          )}

          {viewMode === 'inbox' && <InboxView model={currentModel} objects={sortedObjects} />}

          {viewMode === 'kanban' && currentWorkflow && !viewingRecycleBin && (
             <KanbanBoard
                model={currentModel!}
                workflow={currentWorkflow}
                objects={localObjects}
                allModels={allModels}
                allObjects={allDbObjects}
                onObjectUpdate={handleStateChangeViaDrag}
                onViewObject={handleView}
                onEditObject={handleEdit}
                onDeleteObjectRequest={(obj) => handleSingleDeleteRequest(obj)}
              />
          )}

          {viewMode === 'calendar' && !viewingRecycleBin && (
            <CalendarView model={currentModel} objects={localObjects} />
          )}

          {(viewMode === 'table' || viewMode === 'gallery') && totalPages > 1 && (
            <div className="flex justify-center items-center space-x-2 mt-8">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))} disabled={currentPage === 1}>Previous</Button>
              <span className="text-sm text-muted-foreground"> Page {currentPage} of {totalPages} ({groupingPropertyKey ? 'groups' : 'items'}) </span>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages}>Next</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
