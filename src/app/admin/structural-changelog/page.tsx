
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { withAuth } from '@/contexts/auth-context';
import { useData } from '@/contexts/data-context';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, History, ShieldAlert, Info, Search, FilterX, Calendar as CalendarIcon, User as UserIcon, Layers, Edit2 } from 'lucide-react';
import type { StructuralChangelogEntry, PaginatedStructuralChangelogResponse } from '@/lib/types';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from '@/components/ui/scroll-area';
import ReactJson from 'react18-json-view'; // Using a library for better JSON display
import { Input } from '@/components/ui/input';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


const ENTITY_TYPES = ['ModelGroup', 'Model', 'Workflow', 'ValidationRuleset'];
const ACTION_TYPES = ['CREATE', 'UPDATE', 'DELETE'];

const ALL_ENTITY_TYPES_VALUE = "__ALL_ENTITY_TYPES__";
const ALL_ACTIONS_VALUE = "__ALL_ACTIONS__";
const ALL_USERS_VALUE = "__ALL_USERS__";


function StructuralChangelogPageInternal() {
  const { formatApiError, allUsers, isReady: dataContextReady } = useData();
  const [selectedEntryDetails, setSelectedEntryDetails] = useState<StructuralChangelogEntry | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  // Filters
  const [page, setPage] = useState(1);
  const [limit] = useState(20); // Items per page
  const [filters, setFilters] = useState({
    entityType: '',
    entityId: '',
    userId: '',
    action: '',
    dateStart: '',
    dateEnd: '',
  });

  const buildQueryString = () => {
    const params = new URLSearchParams();
    params.append('page', String(page));
    params.append('limit', String(limit));
    if (filters.entityType) params.append('entityType', filters.entityType);
    if (filters.entityId) params.append('entityId', filters.entityId);
    if (filters.userId) params.append('userId', filters.userId);
    if (filters.action) params.append('action', filters.action);
    if (filters.dateStart) params.append('dateStart', filters.dateStart);
    if (filters.dateEnd) params.append('dateEnd', filters.dateEnd);
    return params.toString();
  };

  const fetchChangelog = async (): Promise<PaginatedStructuralChangelogResponse> => {
    const queryString = buildQueryString();
    const response = await fetch(`/api/structural-changelog?${queryString}`);
    if (!response.ok) {
      const errorMsg = await formatApiError(response, 'Failed to fetch structural changelog');
      throw new Error(errorMsg);
    }
    return response.json();
  };

  const { data, isLoading, error, refetch } = useQuery<PaginatedStructuralChangelogResponse, Error>({
    queryKey: ['structuralChangelog', page, filters],
    queryFn: fetchChangelog,
    enabled: dataContextReady, // Only fetch when DataContext is ready (e.g., allUsers loaded)
  });

  const handleFilterChange = (filterName: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [filterName]: value }));
    setPage(1); // Reset to first page on filter change
  };
  
  const handleDateChange = (filterName: 'dateStart' | 'dateEnd', date: Date | undefined) => {
    handleFilterChange(filterName, date ? format(date, 'yyyy-MM-dd') : '');
  };

  const clearFilters = () => {
    setFilters({ entityType: '', entityId: '', userId: '', action: '', dateStart: '', dateEnd: '' });
    setPage(1);
  };

  const entries = data?.entries || [];
  const totalPages = data?.totalPages || 1;

  const renderChangeDetails = (details: StructuralChangelogEntry['changes']) => {
    if (!details) return <span className="text-muted-foreground italic">No specific changes logged.</span>;
    if (Array.isArray(details)) { // Usually for UPDATE
      return (
        <ul className="list-disc pl-5 space-y-1 text-xs">
          {details.map((change, index) => {
            if (change.field === 'properties') {
              return <li key={index}><strong>Properties:</strong> Modified. Click View for details.</li>;
            }
            return (
              <li key={index}>
                <strong>{change.field}:</strong>
                {change.oldValue !== undefined && (
                  <span className="text-destructive line-through mx-1" title={JSON.stringify(change.oldValue, null, 2)}>{String(change.oldValue).substring(0,30)}{String(change.oldValue).length > 30 ? '...' : ''}</span>
                )}
                {' -> '}
                <span className="text-green-600" title={JSON.stringify(change.newValue, null, 2)}>{String(change.newValue).substring(0,30)}{String(change.newValue).length > 30 ? '...' : ''}</span>
              </li>
            );
          })}
        </ul>
      );
    } else if (typeof details === 'object') { // Usually for CREATE or DELETE (snapshot)
      return <span className="text-xs italic">Snapshot taken. Click view for details.</span>;
    }
    return <span className="text-xs italic">{String(details)}</span>;
  };


  if (!dataContextReady) {
     return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading prerequisites...</p>
      </div>
    );
  }


  return (
    <div className="container mx-auto py-8">
      <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="text-center md:text-left">
          <h1 className="text-3xl font-bold text-primary flex items-center">
            <History className="mr-3 h-8 w-8" /> Structural Change Log
          </h1>
          <p className="text-muted-foreground">Audit trail for changes to models, groups, workflows, and rules.</p>
        </div>
      </header>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Input placeholder="Entity ID" value={filters.entityId} onChange={e => handleFilterChange('entityId', e.target.value)} />
          
          <Select 
            value={filters.entityType === '' ? ALL_ENTITY_TYPES_VALUE : filters.entityType} 
            onValueChange={val => handleFilterChange('entityType', val === ALL_ENTITY_TYPES_VALUE ? "" : val)}
          >
            <SelectTrigger><SelectValue placeholder="Entity Type..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ENTITY_TYPES_VALUE}>Any Entity Type</SelectItem>
              {ENTITY_TYPES.map(et => <SelectItem key={et} value={et}>{et}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select 
            value={filters.action === '' ? ALL_ACTIONS_VALUE : filters.action} 
            onValueChange={val => handleFilterChange('action', val === ALL_ACTIONS_VALUE ? "" : val)}
          >
            <SelectTrigger><SelectValue placeholder="Action Type..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ACTIONS_VALUE}>Any Action</SelectItem>
              {ACTION_TYPES.map(at => <SelectItem key={at} value={at}>{at}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select 
            value={filters.userId === '' ? ALL_USERS_VALUE : filters.userId} 
            onValueChange={val => handleFilterChange('userId', val === ALL_USERS_VALUE ? "" : val)}
          >
            <SelectTrigger><SelectValue placeholder="User..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_USERS_VALUE}>Any User</SelectItem>
              {allUsers.map(user => <SelectItem key={user.id} value={user.id}>{user.username}</SelectItem>)}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.dateStart ? format(new Date(filters.dateStart), 'PPP') : <span>Start Date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={filters.dateStart ? new Date(filters.dateStart) : undefined} onSelect={(date) => handleDateChange('dateStart', date)} initialFocus /></PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.dateEnd ? format(new Date(filters.dateEnd), 'PPP') : <span>End Date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={filters.dateEnd ? new Date(filters.dateEnd) : undefined} onSelect={(date) => handleDateChange('dateEnd', date)} initialFocus /></PopoverContent>
          </Popover>
          <div className="lg:col-span-3 flex justify-end items-center gap-2">
            <Button variant="outline" onClick={clearFilters} size="sm"><FilterX className="mr-2 h-4 w-4" /> Clear Filters</Button>
            <Button onClick={() => refetch()} disabled={isLoading} size="sm"><Search className="mr-2 h-4 w-4" /> Apply Filters</Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && !data && (
        <div className="flex flex-col justify-center items-center h-64">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">Loading changelog entries...</p>
        </div>
      )}
      {error && (
        <Card className="text-center py-12 bg-destructive/10 border-destructive">
          <CardContent>
            <ShieldAlert size={48} className="mx-auto text-destructive mb-4" />
            <h3 className="text-xl font-semibold text-destructive">Error Loading Changelog</h3>
            <p className="text-destructive/80 mb-4">{error.message}</p>
            <Button onClick={() => refetch()} variant="destructive">Try Again</Button>
          </CardContent>
        </Card>
      )}
      {!isLoading && !error && entries.length === 0 && (
        <Card className="text-center py-12">
          <CardContent>
            <Info size={48} className="mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold">No Changelog Entries Found</h3>
            <p className="text-muted-foreground">No structural changes match your current filters, or no changes have been made yet.</p>
          </CardContent>
        </Card>
      )}
      {!isLoading && !error && entries.length > 0 && (
        <Card className="shadow-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Timestamp</TableHead>
                <TableHead className="w-[130px]">User</TableHead>
                <TableHead className="w-[140px]">Entity Type</TableHead>
                <TableHead>Entity Name/ID</TableHead>
                <TableHead className="w-[100px]">Action</TableHead>
                <TableHead>Changes Summary</TableHead>
                <TableHead className="w-[80px] text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-xs">{format(new Date(entry.timestamp), 'PPpp')}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs flex items-center gap-1">
                      <UserIcon className="h-3 w-3" /> {entry.username}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs flex items-center gap-1">
                       <Layers className="h-3 w-3" /> {entry.entityType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate" title={entry.entityName || entry.entityId}>
                    {entry.entityName || <span className="italic text-muted-foreground">ID: {entry.entityId.substring(0,8)}...</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={entry.action === 'DELETE' ? 'destructive' : entry.action === 'CREATE' ? 'default' : 'outline'} className="capitalize">
                      <Edit2 className="mr-1 h-3 w-3" /> {entry.action.toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs max-w-xs truncate">{renderChangeDetails(entry.changes)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedEntryDetails(entry);
                        setIsDetailsModalOpen(true);
                      }}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
           {totalPages > 1 && (
            <CardContent className="py-4">
                <div className="flex justify-center items-center space-x-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || isLoading}>Previous</Button>
                <span className="text-sm text-muted-foreground">Page {page} of {totalPages} (Total: {data?.totalEntries || 0})</span>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || isLoading}>Next</Button>
                </div>
            </CardContent>
            )}
        </Card>
      )}

      <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Change Details</DialogTitle>
            {selectedEntryDetails && (
                 <DialogDescription>
                    Details for {selectedEntryDetails.action} action on {selectedEntryDetails.entityType} <span className="font-mono text-xs">{selectedEntryDetails.entityName || selectedEntryDetails.entityId}</span> by {selectedEntryDetails.username} at {format(new Date(selectedEntryDetails.timestamp), 'PPpp')}.
                </DialogDescription>
            )}
          </DialogHeader>
          {selectedEntryDetails && (
            <ScrollArea className="max-h-[60vh] mt-4 bg-muted/50 p-4 rounded-md border">
              <ReactJson
                src={selectedEntryDetails.changes}
                name={false}
                collapsed={1}
                displayObjectSize={false}
                displayDataTypes={false}
                enableClipboard={false}
                theme="rjv-default" 
                style={{ fontSize: '0.8rem', backgroundColor: 'transparent' }}
              />
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default withAuth(StructuralChangelogPageInternal, ['administrator']);
