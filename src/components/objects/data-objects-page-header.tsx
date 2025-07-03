
'use client';

import type { Model, WorkflowWithDetails, ShareLinkType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel as UiSelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  PlusCircle,
  Search,
  List as ListIcon,
  LayoutGrid,
  Kanban as KanbanIcon,
  Columns as ColumnsIcon,
  Rows,
  Settings as SettingsIcon,
  RefreshCw,
  Loader2,
  ArrowLeft,
  Share2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import CreateShareLinkDialog from '@/components/sharing/CreateShareLinkDialog';
import type { ColumnToggleOption } from '@/hooks/useDataViewLogic';

// Define ViewMode locally for this component. Ideally, this would be in a shared types file.
export type ViewMode = 'table' | 'gallery' | 'kanban';

// Local constants (ideally, these would be shared or passed if they vary)
const NO_GROUPING_VALUE = "__NO_GROUPING__";
const DELETED_AT_COLUMN_KEY = "__DELETED_AT_COLUMN_KEY__"; // Assuming this is the actual key string

export interface GroupablePropertyOption {
  id: string;
  name: string;
  isWorkflowState?: boolean;
  isIncomingRelation?: boolean;
  isOwnerColumn?: boolean;
  isDateColumn?: boolean;
}

interface DataObjectsPageHeaderProps {
  currentModel: Model;
  currentWorkflow: WorkflowWithDetails | null;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  allAvailableColumnsForToggle: ColumnToggleOption[];
  hiddenColumns: Set<string>;
  onToggleColumnVisibility: (columnId: string, hide: boolean) => void;
  groupableProperties: GroupablePropertyOption[];
  groupingPropertyKey: string | null;
  onGroupingPropertyKeyChange: (key: string | null) => void;
  isRefreshing: boolean;
  onRefreshData: () => void;
  onEditModelStructure: () => void;
  onCreateNew: () => void;
  onNavigateBack: () => void;
  viewingRecycleBin: boolean;
  createShareStatus: 'create' | 'none';
}

export default function DataObjectsPageHeader({
  currentModel,
  currentWorkflow,
  searchTerm,
  onSearchTermChange,
  viewMode,
  onViewModeChange,
  allAvailableColumnsForToggle,
  hiddenColumns,
  onToggleColumnVisibility,
  groupableProperties,
  groupingPropertyKey,
  onGroupingPropertyKeyChange,
  isRefreshing,
  onRefreshData,
  onEditModelStructure,
  onCreateNew,
  onNavigateBack,
  viewingRecycleBin,
  createShareStatus,
}: DataObjectsPageHeaderProps) {
  return (
    <>
      <Button variant="outline" onClick={onNavigateBack} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Model Admin
      </Button>
      <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="text-center md:text-left">
          <h1 className="text-3xl font-bold text-primary">{currentModel.name}</h1>
          <p className="text-muted-foreground">{currentModel.description}</p>
          {currentWorkflow && <Badge variant="secondary" className="mt-1">Workflow: {currentWorkflow.name}</Badge>}
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto justify-center md:justify-end">
          <div className="relative flex-grow md:flex-grow-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="search"
              placeholder={`Search ${currentModel.name.toLowerCase()}s...`}
              value={searchTerm}
              onChange={(e) => onSearchTermChange(e.target.value)}
              className="pl-10 w-full md:w-64"
            />
          </div>
          <div className="flex items-center border rounded-md">
            <Button variant={viewMode === 'table' ? 'secondary' : 'ghost'} size="sm" onClick={() => onViewModeChange('table')} className="rounded-r-none" aria-label="Table View"><ListIcon className="h-5 w-5" /></Button>
            <Button variant={viewMode === 'gallery' ? 'secondary' : 'ghost'} size="sm" onClick={() => onViewModeChange('gallery')} className={cn("rounded-l-none border-l", currentWorkflow ? "" : "rounded-r-md")} aria-label="Gallery View"><LayoutGrid className="h-5 w-5" /></Button>
            {currentWorkflow && (
              <Button variant={viewMode === 'kanban' ? 'secondary' : 'ghost'} size="sm" onClick={() => onViewModeChange('kanban')} className="rounded-l-none border-l rounded-r-md" aria-label="Kanban View" disabled={viewingRecycleBin}><KanbanIcon className="h-5 w-5" /></Button>
            )}
          </div>
          {viewMode === 'table' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <ColumnsIcon className="mr-2 h-4 w-4" /> Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 max-h-[70vh] overflow-y-auto">
                <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {allAvailableColumnsForToggle.map(col => (
                  <DropdownMenuCheckboxItem
                    key={col.id}
                    checked={!hiddenColumns.has(col.id)}
                    onCheckedChange={(checked) => onToggleColumnVisibility(col.id, !checked)}
                    onSelect={(e) => e.preventDefault()} // Keep menu open on click
                    disabled={col.id === DELETED_AT_COLUMN_KEY && !viewingRecycleBin}
                  >
                    {col.label} {col.id === DELETED_AT_COLUMN_KEY && !viewingRecycleBin ? "(Recycle Bin only)" : ""}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {viewMode === 'table' && groupableProperties.length > 0 && (
            <div className="min-w-[180px]">
              <Select
                value={groupingPropertyKey ?? NO_GROUPING_VALUE}
                onValueChange={(value) => onGroupingPropertyKeyChange(value === NO_GROUPING_VALUE ? null : value)}
              >
                <SelectTrigger className="h-9">
                  <Rows className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Group by..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_GROUPING_VALUE}>No Grouping</SelectItem>
                  <SelectGroup>
                    <UiSelectLabel>Group by Property</UiSelectLabel>
                    {groupableProperties.map(prop => (
                      <SelectItem key={prop.id} value={prop.id} disabled={prop.id === DELETED_AT_COLUMN_KEY && !viewingRecycleBin}>
                        {prop.name} {prop.id === DELETED_AT_COLUMN_KEY && !viewingRecycleBin ? "(Recycle Bin only)" : ""}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          )}
          <Button onClick={onRefreshData} variant="outline" size="sm" disabled={isRefreshing}>
            {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
          <Button onClick={onEditModelStructure} variant="outline" size="sm"><SettingsIcon className="mr-2 h-4 w-4" /> Edit Model</Button>
          <CreateShareLinkDialog
            modelId={currentModel.id}
            modelName={currentModel.name}
            activeLinkStatus={createShareStatus}
           />
          <Button onClick={onCreateNew} size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" disabled={viewingRecycleBin}><PlusCircle className="mr-2 h-4 w-4" /> Create New</Button>
        </div>
      </header>
    </>
  );
}
