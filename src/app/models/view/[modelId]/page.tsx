
'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useData } from '@/contexts/data-context';
import { useAuth } from '@/contexts/auth-context';
import type { Model, Property, WorkflowWithDetails, ValidationRuleset, StructuralChangelogEntry, PaginatedStructuralChangelogResponse } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import {
  Dialog as DetailsDialog,
  DialogContent as DetailsDialogContent,
  DialogHeader as DetailsDialogHeader,
  DialogTitle as DetailsDialogTitle,
  DialogDescription as DetailsDialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Edit, Trash2, DownloadCloud, PlusCircle, Loader2, DatabaseZap, FileText, ListFilter, CheckCircle, ShieldCheck, AlertTriangle, Settings2, Workflow as WorkflowIconLucide, History as HistoryIcon, User as UserIcon, Layers, Edit2 as Edit2Icon } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { withAuth } from '@/contexts/auth-context';
import { format } from 'date-fns';
import ReactJson from 'react18-json-view';
import { ScrollArea } from '@/components/ui/scroll-area';

function ViewModelPageInternal() {
  const router = useRouter();
  const params = useParams();
  const modelId = params.modelId as string;
  const {
    getModelById,
    deleteModel,
    getWorkflowById,
    validationRulesets,
    modelGroups,
    isReady: dataContextIsReady,
    formatApiError,
  } = useData();
  const { user, hasPermission, isLoading: authIsLoading } = useAuth();
  const { toast } = useToast();

  const [currentModel, setCurrentModel] = useState<Model | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowWithDetails | null>(null);
  const [isLoadingPageData, setIsLoadingPageData] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // State for model-specific changelog
  const [selectedEntryDetails, setSelectedEntryDetails] = useState<StructuralChangelogEntry | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  useEffect(() => {
    if (dataContextIsReady && modelId) {
      const foundModel = getModelById(modelId);
      if (foundModel) {
        setCurrentModel(foundModel);
        if (foundModel.workflowId) {
          setWorkflow(getWorkflowById(foundModel.workflowId) || null);
        } else {
          setWorkflow(null);
        }
      } else {
        setPageError(`Model with ID ${modelId} not found.`);
        toast({ variant: "destructive", title: "Error", description: `Model with ID ${modelId} not found.` });
      }
      setIsLoadingPageData(false);
    }
  }, [modelId, getModelById, getWorkflowById, dataContextIsReady, toast]);

  const fetchChangelogForModel = async (): Promise<PaginatedStructuralChangelogResponse> => {
    const response = await fetch(`/api/structural-changelog?entityId=${modelId}&entityType=Model&limit=20`); // Fetch last 20 for this model
    if (!response.ok) {
      const errorMsg = await formatApiError(response, 'Failed to fetch structural changelog for this model');
      throw new Error(errorMsg);
    }
    return response.json();
  };

  const { data: changelogData, isLoading: isLoadingChangelog, error: changelogError, refetch: refetchChangelog } = useQuery<PaginatedStructuralChangelogResponse, Error>({
    queryKey: ['structuralChangelog', modelId, 'Model'],
    queryFn: fetchChangelogForModel,
    enabled: !!currentModel && dataContextIsReady, // Only fetch if model is loaded
  });

  const modelChangelogEntries = changelogData?.entries || [];

  const renderChangeDetailsSummary = (details: StructuralChangelogEntry['changes']) => {
    if (!details) return <span className="text-muted-foreground italic">No specific changes logged.</span>;
    if (Array.isArray(details)) { // Usually for UPDATE
      return (
        <ul className="list-disc pl-4 space-y-0.5 text-xs">
          {details.slice(0, 3).map((change, index) => {
            if (change.field === 'properties') {
              return <li key={index}><strong>Properties:</strong> Modified. Click View for details.</li>;
            }
            return (
              <li key={index} className="truncate" title={`${change.field}: ${String(change.oldValue)} -> ${String(change.newValue)}`}>
                <strong>{change.field}:</strong>
                {change.oldValue !== undefined && (
                  <span className="text-destructive line-through mx-1">{String(change.oldValue).substring(0,15)}{String(change.oldValue).length > 15 ? '...' : ''}</span>
                )}
                {' -> '}
                <span className="text-green-600">{String(change.newValue).substring(0,15)}{String(change.newValue).length > 15 ? '...' : ''}</span>
              </li>
            );
          })}
          {details.length > 3 && <li>...and {details.length - 3} more.</li>}
        </ul>
      );
    } else if (typeof details === 'object') { // Usually for CREATE or DELETE (snapshot)
      return <span className="text-xs italic">Snapshot taken. Click view for details.</span>;
    }
    return <span className="text-xs italic">{String(details).substring(0,50)}{String(details).length > 50 ? '...' : ''}</span>;
  };


  const handleDelete = async () => {
    if (!currentModel) return;
    try {
      await deleteModel(currentModel.id);
      toast({ title: "Model Deleted", description: `Model "${currentModel.name}" and its associated data have been successfully deleted.` });
      router.push('/models');
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error Deleting Model", description: error.message || "Failed to delete model." });
    }
  };

  if (isLoadingPageData || authIsLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading model details...</p>
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="container mx-auto py-8 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-2xl font-semibold text-destructive mb-2">Error Loading Model</h2>
        <p className="text-muted-foreground mb-4">{pageError}</p>
        <Button onClick={() => router.push('/models')} className="mt-4">Back to Model Admin</Button>
      </div>
    );
  }

  if (!currentModel) {
    return <div className="container mx-auto py-8">Model not found.</div>;
  }

  const getValidationRuleName = (ruleId: string | null | undefined): string | undefined => {
    if (!ruleId) return undefined;
    return validationRulesets.find(rs => rs.id === ruleId)?.name;
  };

  const groupName = modelGroups.find(g => g.id === currentModel.modelGroupId)?.name || 'Default';

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={() => router.push('/models')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Model Admin
        </Button>
        {hasPermission(`objects:create`) && (
            <Link href={`/data/${currentModel.id}/new`} passHref legacyBehavior>
                <Button variant="default" className="bg-accent text-accent-foreground hover:bg-accent/90">
                    <PlusCircle className="mr-2 h-4 w-4" /> New {currentModel.name} Object
                </Button>
            </Link>
        )}
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex-grow">
              <CardTitle className="text-3xl text-primary flex items-center">
                <DatabaseZap className="mr-3 h-8 w-8" />
                {currentModel.name}
              </CardTitle>
              <CardDescription>{currentModel.description || "No description provided."}</CardDescription>
            </div>
            <div className="flex items-center space-x-2 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={() => router.push(`/models/edit/${currentModel.id}`)}>
                <Edit className="mr-2 h-4 w-4" /> Edit Structure
              </Button>
              {hasPermission('models:import_export') && (
                <Link href={`/api/codex-structure/export/model/${currentModel.id}`} download passHref legacyBehavior>
                    <Button variant="secondary" size="sm">
                    <DownloadCloud className="mr-2 h-4 w-4" /> Export
                    </Button>
                </Link>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the model "{currentModel.name}" and ALL its associated data objects.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center">
              <Badge variant="outline" className="mr-2 font-semibold px-2 py-1">Model Group:</Badge>
              <span className="text-muted-foreground">{groupName}</span>
            </div>
            {currentModel.displayPropertyNames && currentModel.displayPropertyNames.length > 0 && (
              <div className="flex items-center">
                <Badge variant="outline" className="mr-2 font-semibold px-2 py-1">Displays As:</Badge>
                <span className="text-muted-foreground truncate">{currentModel.displayPropertyNames.join(', ')}</span>
              </div>
            )}
            <div className="flex items-center">
              <Badge variant="outline" className="mr-2 font-semibold px-2 py-1">
                <WorkflowIconLucide className="mr-1.5 h-3.5 w-3.5"/> Workflow:
              </Badge>
              {workflow ? (
                <Link href={`/admin/workflows/edit/${workflow.id}`} className="text-primary hover:underline">
                  {workflow.name}
                </Link>
              ) : (
                <span className="text-muted-foreground">None</span>
              )}
            </div>
            <div className="flex items-center">
              <Badge variant="outline" className="mr-2 font-semibold px-2 py-1">ID:</Badge>
              <span className="text-muted-foreground font-mono text-xs">{currentModel.id}</span>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl flex items-center">
            <ListFilter className="mr-2 h-5 w-5 text-primary" />
            Properties ({currentModel.properties.length})
          </CardTitle>
          <CardDescription>Detailed list of properties defined for this model.</CardDescription>
        </CardHeader>
        <CardContent>
          {currentModel.properties.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30px]">#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Constraints</TableHead>
                  <TableHead>Default</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentModel.properties.sort((a,b) => a.orderIndex - b.orderIndex).map((prop, index) => (
                  <TableRow key={prop.id}>
                    <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="font-medium text-foreground">{prop.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">{prop.type}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {prop.type === 'relationship' && (
                        <>
                          <div>Rel. Model: {getModelById(prop.relatedModelId || '')?.name || <span className="text-destructive">N/A</span>}</div>
                          <div>Type: {prop.relationshipType || 'one'}</div>
                        </>
                      )}
                      {prop.type === 'number' && (
                        <>
                          {prop.unit && <div>Unit: {prop.unit}</div>}
                          {prop.precision !== undefined && <div>Precision: {prop.precision}</div>}
                           {prop.minValue !== null && prop.minValue !== undefined && <div>Min: {prop.minValue}</div>}
                           {prop.maxValue !== null && prop.maxValue !== undefined && <div>Max: {prop.maxValue}</div>}
                        </>
                      )}
                      {prop.type === 'date' && (
                        <>
                          {prop.autoSetOnCreate && <div>Auto on Create</div>}
                          {prop.autoSetOnUpdate && <div>Auto on Update</div>}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {prop.required && <Badge variant="outline" className="mr-1 border-amber-500 text-amber-600">Required</Badge>}
                      {prop.isUnique && <Badge variant="outline" className="mr-1 border-purple-500 text-purple-600">Unique</Badge>}
                      {prop.validationRulesetId && (
                         <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                               <Badge variant="outline" className="border-blue-500 text-blue-600 cursor-help">
                                <ShieldCheck className="mr-1 h-3 w-3" />
                                {getValidationRuleName(prop.validationRulesetId) || 'Applied Rule'}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Validation: {getValidationRuleName(prop.validationRulesetId)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                       {!prop.required && !prop.isUnique && !prop.validationRulesetId && <span className="text-muted-foreground/70 italic">None</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground italic">
                      {prop.defaultValue !== null && typeof prop.defaultValue !== 'undefined' && String(prop.defaultValue).trim() !== ''
                        ? String(prop.defaultValue).length > 30 ? String(prop.defaultValue).substring(0,27)+'...' : String(prop.defaultValue)
                        : 'None'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-center py-4">No properties have been defined for this model yet.</p>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl flex items-center">
            <HistoryIcon className="mr-2 h-5 w-5 text-primary" />
            Model Change History (Last 20)
          </CardTitle>
          <CardDescription>Tracks structural changes made to this model.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingChangelog && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
              <p className="text-muted-foreground">Loading changelog...</p>
            </div>
          )}
          {changelogError && !isLoadingChangelog && (
            <div className="text-destructive text-center py-6">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
              <p>Error loading model changelog: {changelogError.message}</p>
            </div>
          )}
          {!isLoadingChangelog && !changelogError && modelChangelogEntries.length === 0 && (
            <p className="text-muted-foreground text-center py-6">No structural changes recorded for this model yet.</p>
          )}
          {!isLoadingChangelog && !changelogError && modelChangelogEntries.length > 0 && (
            <ScrollArea className="max-h-[400px] pr-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">Timestamp</TableHead>
                    <TableHead className="w-[120px]">User</TableHead>
                    <TableHead className="w-[100px]">Action</TableHead>
                    <TableHead>Changes Summary</TableHead>
                    <TableHead className="w-[80px] text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modelChangelogEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-xs">{format(new Date(entry.timestamp), 'PPpp')}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs flex items-center gap-1">
                          <UserIcon className="h-3 w-3" /> {entry.username || 'System'}
                        </Badge>
                      </TableCell>
                       <TableCell>
                        <Badge variant={entry.action === 'DELETE' ? 'destructive' : entry.action === 'CREATE' ? 'default' : 'outline'} className="capitalize">
                           <Edit2Icon className="mr-1 h-3 w-3" /> {entry.action.toLowerCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-md truncate">{renderChangeDetailsSummary(entry.changes)}</TableCell>
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
            </ScrollArea>
          )}
           {changelogData && changelogData.totalEntries > 20 && (
             <p className="text-xs text-muted-foreground mt-2 text-center">
                Showing last 20 changes. For the full history, visit the <Link href="/admin/structural-changelog" className="text-primary hover:underline">main Structural Changelog page</Link>.
            </p>
          )}
        </CardContent>
      </Card>

      <DetailsDialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
        <DetailsDialogContent className="max-w-3xl">
          <DetailsDialogHeader>
            <DetailsDialogTitle>Change Details</DetailsDialogTitle>
            {selectedEntryDetails && (
                 <DetailsDialogDescription>
                    Details for {selectedEntryDetails.action} action on {selectedEntryDetails.entityType} <span className="font-mono text-xs">{selectedEntryDetails.entityName || selectedEntryDetails.entityId}</span> by {selectedEntryDetails.username} at {format(new Date(selectedEntryDetails.timestamp), 'PPpp')}.
                </DetailsDialogDescription>
            )}
          </DetailsDialogHeader>
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
        </DetailsDialogContent>
      </DetailsDialog>

    </div>
  );
}
export default withAuth(ViewModelPageInternal, 'models:manage');
