
'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useData } from '@/contexts/data-context';
import { useAuth } from '@/contexts/auth-context';
import type { DataObject, Model, Property, WorkflowWithDetails, ValidationRuleset, ChangelogEntry, SharedObjectLink, PropertyChangeDetail } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog as LightboxDialog, DialogContent as LightboxDialogContent, DialogHeader as LightboxDialogHeader, DialogTitle as LightboxDialogTitle, DialogDescription as LightboxDialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Edit, Trash2, DownloadCloud, PlusCircle, Loader2, DatabaseZap, FileText, ListFilter, CheckCircle, ShieldCheck, AlertTriangle, Settings2, Workflow as WorkflowIconLucide, History as HistoryIcon, User as UserIcon, Layers, Edit2 as Edit2Icon, ZoomIn, ExternalLink, RotateCcw, UserCircle as UserCircleIcon, CalendarClock, ShieldAlert, Paperclip, Share2, MinusCircle, PlusCircle as PlusCircleIcon } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import ReactJson from 'react18-json-view';
import { ScrollArea } from '@/components/ui/scroll-area';
import Image from 'next/image';
import { getObjectDisplayValue } from '@/lib/utils';
import { format as formatDateFns, isValid as isDateValid } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import { StarDisplay } from '@/components/ui/star-display';
import { Progress } from '@/components/ui/progress';
import CreateShareLinkDialog from '@/components/sharing/CreateShareLinkDialog';
import ShareLinkManager from '@/components/sharing/ShareLinkManager';
import { cn } from '@/lib/utils';
import IncomingRelationshipsViewer from '@/components/objects/IncomingRelationshipsViewer';
import LogDetailViewer from '@/components/admin/changelog/LogDetailViewer';

interface ObjectDetailViewProps {
  model: Model;
  viewingObject: DataObject;
  isPublicView?: boolean;
}

export default function ObjectDetailView({ model, viewingObject, isPublicView = false }: ObjectDetailViewProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { user: currentUser, hasPermission } = useAuth();
  const { getWorkflowById, validationRulesets, getUserById, allModels, getAllObjects, formatApiError, fetchData: refreshDataContext } = useData();
  
  const [changelog, setChangelog] = React.useState<ChangelogEntry[]>([]);
  const [isLoadingChangelog, setIsLoadingChangelog] = React.useState(false);
  const [changelogError, setChangelogError] = React.useState<string | null>(null);

  const [isRevertConfirmOpen, setIsRevertConfirmOpen] = React.useState(false);
  const [revertingEntryId, setRevertingEntryId] = React.useState<string | null>(null);
  const [isReverting, setIsReverting] = React.useState(false);
  const [lightboxImageUrl, setLightboxImageUrl] = React.useState<string | null>(null);
  const [selectedEntryDetails, setSelectedEntryDetails] = React.useState<any>(null); // Changed to any to accept both types
  const [isDetailsModalOpen, setIsDetailsModalOpen] = React.useState(false);

  const currentWorkflow = model.workflowId ? getWorkflowById(model.workflowId) : null;
  const objectId = viewingObject.id;
  const modelId = model.id;
  
  const allDbObjects = React.useMemo(() => getAllObjects(true), [getAllObjects]);

  const { data: shareLinks } = useQuery<SharedObjectLink[]>({
    queryKey: ['shareLinks', objectId],
    queryFn: async () => {
      if (isPublicView || !objectId) return [];
      const response = await fetch(`/api/codex-structure/share-links?data_object_id=${objectId}`);
      if (!response.ok) {
        console.error('Failed to fetch share links for object.');
        return [];
      }
      return response.json();
    },
    enabled: !isPublicView && !!objectId,
  });

  const activeLinkStatus = React.useMemo(() => {
    if (!shareLinks || shareLinks.length === 0) return 'none';
    const activeLinks = shareLinks.filter(link => !link.expires_at || new Date(link.expires_at) > new Date());
    if (activeLinks.some(link => link.link_type === 'update')) return 'update';
    if (activeLinks.some(link => link.link_type === 'view')) return 'view';
    return 'none';
  }, [shareLinks]);

  const ownerUsername = React.useMemo(() => {
    if (viewingObject?.ownerId) {
      const owner = getUserById(viewingObject.ownerId);
      return owner?.username || 'Unknown User';
    }
    return 'Not Assigned';
  }, [viewingObject, getUserById]);

  const getWorkflowStateName = React.useCallback((stateId: string | null | undefined): string => {
    if (!stateId || !currentWorkflow) return 'N/A';
    const state = currentWorkflow.states.find(s => s.id === stateId);
    return state ? state.name : 'Unknown State';
  }, [currentWorkflow]);

  const fetchChangelog = React.useCallback(async () => {
    if (!objectId) return;
    setIsLoadingChangelog(true);
    setChangelogError(null);
    try {
      const response = await fetch(`/api/codex-structure/objects/${objectId}/changelog`);
      if (!response.ok) {
        const errorMsg = await formatApiError(response, `Failed to fetch changelog for object ${objectId}.`);
        throw new Error(errorMsg);
      }
      const data: ChangelogEntry[] = await response.json();
      setChangelog(data);
    } catch (error: any) {
      setChangelogError(error.message);
      toast({ variant: "destructive", title: "Error Loading Changelog", description: error.message });
    } finally {
      setIsLoadingChangelog(false);
    }
  }, [objectId, toast, formatApiError]);

  React.useEffect(() => {
    if (viewingObject && !isPublicView) {
      fetchChangelog();
    }
  }, [viewingObject, fetchChangelog, isPublicView]);

  const handleRevertClick = (entryId: string) => {
    setRevertingEntryId(entryId);
    setIsRevertConfirmOpen(true);
  };

  const confirmRevert = async () => {
    if (!revertingEntryId || !objectId) return;
    setIsReverting(true);
    try {
      const response = await fetch(`/api/codex-structure/objects/${objectId}/changelog/${revertingEntryId}/revert`, { method: 'POST' });
      if (!response.ok) {
        const errorMsg = await formatApiError(response, `Failed to revert to changelog entry ${revertingEntryId}.`);
        throw new Error(errorMsg);
      }
      await fetchChangelog();
      await refreshDataContext(`After Revert Object ${objectId}`);
      toast({ title: "Revert Successful", description: "Object state has been reverted." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Revert Failed", description: error.message });
    } finally {
      setIsReverting(false);
      setIsRevertConfirmOpen(false);
      setRevertingEntryId(null);
    }
  };

    const displayFieldValue = (property: Property, value: any) => {
    if (value === null || typeof value === 'undefined' || (Array.isArray(value) && value.length === 0)) {
      if (property.type === 'rating') {
        return <StarDisplay rating={0} size="md"/>;
      }
      return <span className="text-muted-foreground italic">Not set</span>;
    }

    switch (property.type) {
      case 'boolean':
        return value ? <Badge variant="default" className="bg-green-500 hover:bg-green-600">Yes</Badge> : <Badge variant="secondary">No</Badge>;
      case 'date':
        try {
          const date = new Date(value);
          return isDateValid(date) ? formatDateFns(date, 'PPP') : String(value);
        } catch {
          return String(value);
        }
      case 'time':
        return <span className="font-mono">{value}</span>;
      case 'datetime':
        try {
          const date = new Date(value);
          return isDateValid(date) ? formatDateFns(date, 'PPP p') : String(value);
        } catch {
          return String(value);
        }
      case 'number':
        const numValue = parseFloat(String(value));
        const precision = property.precision === undefined ? 2 : property.precision;
        const unitText = property.unit || '';
        const formattedValue = isNaN(numValue) ? <span className="text-muted-foreground italic">Invalid number</span> : `${numValue.toFixed(precision)}${unitText ? ` ${unitText}` : ''}`;

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
            <div className="flex flex-col space-y-1.5">
              <span>{formattedValue}</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Progress value={percentage} className="h-2.5 w-full" />
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
      case 'markdown':
        return (
          <div className="prose prose-sm dark:prose-invert max-w-none bg-muted p-3 rounded-md">
            <ReactMarkdown>{String(value)}</ReactMarkdown>
          </div>
        );
      case 'image':
        const imageUrl = String(value);
        if (!imageUrl) return <span className="text-muted-foreground italic">No image URL</span>;

        const isExternalUrl = imageUrl.startsWith('http');
        const placeholderImage = `https://placehold.co/600x400.png`;
        const finalImageUrl = (isExternalUrl || imageUrl.startsWith('/uploads')) ? imageUrl : placeholderImage;

        return (
          <button
            onClick={() => setLightboxImageUrl(finalImageUrl)}
            className="relative w-full max-w-md aspect-video rounded-md overflow-hidden border group focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label={`View larger image for ${property.name}`}
          >
            <Image
              src={finalImageUrl}
              alt={`${getObjectDisplayValue(viewingObject, model, allModels, allDbObjects)} ${property.name}`}
              layout="fill"
              objectFit="contain"
              data-ai-hint={model?.name.toLowerCase() || "object image"}
              onError={(e) => { (e.target as HTMLImageElement).src = placeholderImage; (e.target as HTMLImageElement).dataset.aiHint = 'placeholder image'; }}
            />
            {finalImageUrl !== placeholderImage && (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
            )}
          </button>
        );
      case 'fileAttachment':
        if (typeof value === 'object' && value !== null && value.url && value.name) {
          return (
            <a href={value.url} download={value.name} className="inline-flex items-center text-primary hover:underline">
              <Paperclip className="mr-2 h-4 w-4" />
              {value.name}
            </a>
          );
        }
        return <span className="text-muted-foreground italic">Invalid file data</span>;
      case 'url':
        if (typeof value === 'object' && value !== null && value.url) {
            return (
              <a href={value.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-primary hover:underline">
                <ExternalLink className="mr-2 h-4 w-4" />
                {value.title || value.url}
              </a>
            );
        }
        return <span className="text-muted-foreground italic">Invalid URL data</span>;
      case 'rating':
        return <StarDisplay rating={value as number} size="md"/>;
      case 'relationship':
        if (!property.relatedModelId) return <span className="text-destructive">Config Err</span>;
        const relatedModel = getModelById(property.relatedModelId);
        if (!relatedModel) return <span className="text-destructive">Model N/A</span>;

        if (property.relationshipType === 'many') {
          if (!Array.isArray(value) || value.length === 0) return <span className="text-muted-foreground italic">None</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {value.map(itemId => {
                const relatedObj = (allDbObjects[property.relatedModelId!] || []).find(o => o.id === itemId);
                const displayVal = getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects);
                const isDeleted = relatedObj?.isDeleted;
                return relatedObj ? (
                  <Link key={itemId} href={`/data/${relatedModel.id}/view/${relatedObj.id}`} className="inline-block">
                    <Badge variant={isDeleted ? "destructive" : "outline"} className={cn("hover:bg-secondary cursor-pointer", isDeleted && "line-through")}>
                      {displayVal} <ExternalLink className="ml-1 h-3 w-3 opacity-70" />
                    </Badge>
                  </Link>
                ) : (
                  <Badge key={itemId} variant="outline" className={cn("mr-1 mb-1", isDeleted && "line-through text-destructive")}>{displayVal}</Badge>
                );
              })}
            </div>
          );
        } else {
          const relatedObj = (allDbObjects[property.relatedModelId] || []).find(o => o.id === value); 
          const displayVal = getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects);
          const isDeleted = relatedObj?.isDeleted;
          return relatedObj ? (
            <Link href={`/data/${relatedModel.id}/view/${relatedObj.id}`} className="inline-block">
              <Badge variant={isDeleted ? "destructive" : "outline"} className={cn("hover:bg-secondary cursor-pointer", isDeleted && "line-through")}>
                {displayVal} <ExternalLink className="ml-1 h-3 w-3 opacity-70" />
              </Badge>
            </Link>
          ) : <span className={cn("text-muted-foreground italic", isDeleted && "line-through text-destructive")}>{displayVal}</span>;
        }
      default:
        const strValue = String(value);
        return <pre className="whitespace-pre-wrap text-sm">{strValue}</pre>;
    }
  };

  const formatChangelogValue = (value: any): string => {
    if (value === null || value === undefined) return 'Not Set';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.length > 0 ? `[${value.join(', ')}]` : 'Empty List';
    if (typeof value === 'object') return JSON.stringify(value);
    const strValue = String(value);
    return strValue.length > 50 ? strValue.substring(0, 47) + '...' : strValue;
  };

  const renderChangeDetail = (detail: PropertyChangeDetail): React.ReactNode => {
    const { propertyName, oldValue, newValue, oldLabel, newLabel } = detail;
    let propertyDisplayName = propertyName;
    let finalOldValue = oldValue;
    let finalNewValue = newValue;

    if (propertyName === '__workflowState__') {
      propertyDisplayName = "Workflow State";
      finalOldValue = oldLabel || formatChangelogValue(oldValue);
      finalNewValue = newLabel || formatChangelogValue(newValue);
    } else if (propertyName === '__owner__') {
      propertyDisplayName = "Owner";
      finalOldValue = oldLabel || formatChangelogValue(oldValue);
      finalNewValue = newLabel || formatChangelogValue(newValue);
    } else if (propertyName === '__isDeleted__') {
      propertyDisplayName = "Status";
      finalOldValue = oldValue ? "Deleted" : "Active";
      finalNewValue = newValue ? "Deleted" : "Active";
    } else {
      const propDef = model?.properties.find(p => p.name === propertyName);
      propertyDisplayName = propDef?.name || propertyName;
      finalOldValue = formatChangelogValue(oldValue);
      finalNewValue = formatChangelogValue(newValue);
    }

    return (
       <div className="text-xs">
          <span className="font-semibold">{propertyDisplayName}:</span>
          <div className="mt-1 space-y-1">
              <div className="bg-red-500/10 p-1.5 rounded-md border border-red-500/20 text-red-900 dark:text-red-200 font-mono flex items-center gap-2">
                  <MinusCircle className="h-3.5 w-3.5 shrink-0"/>
                  <span className="truncate" title={String(oldValue)}>{finalOldValue}</span>
              </div>
              <div className="bg-green-500/10 p-1.5 rounded-md border border-green-500/20 text-green-900 dark:text-green-200 font-mono flex items-center gap-2">
                  <PlusCircleIcon className="h-3.5 w-3.5 shrink-0"/>
                  <span className="truncate" title={String(newValue)}>{finalNewValue}</span>
              </div>
          </div>
      </div>
    );
  };
    
  const canRevert = (changeType: ChangelogEntry['changeType']) => {
    if (isPublicView) return false;
    return hasPermission('objects:revert') && ['UPDATE', 'DELETE', 'RESTORE'].includes(changeType);
  };

  const canEditObject = !isPublicView && (hasPermission(`model:edit:${modelId}`) || (hasPermission('objects:edit_own') && viewingObject.ownerId === currentUser?.id));
  const sortedProperties = [...model.properties].sort((a,b) => a.orderIndex - b.orderIndex);
  const objectStateName = getWorkflowStateName(viewingObject.currentStateId);

  const formattedDate = (dateString: string | undefined | null) => {
    if (!dateString) return <span className="text-muted-foreground italic">Not set</span>;
    try {
      const date = new Date(dateString);
      return isDateValid(date) ? formatDateFns(date, 'PPP p') : <span className="text-muted-foreground italic">Invalid date</span>;
    } catch {
      return <span className="text-muted-foreground italic">Invalid date format</span>;
    }
  };


  return (
    <div className={cn("py-8", isPublicView ? "container mx-auto" : "")}>
       {!isPublicView && (
            <div className="flex justify-between items-center mb-6">
                <Button variant="outline" onClick={() => router.push(`/data/${modelId}`)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to {model.name} Data
                </Button>
                <div className="flex items-center gap-2">
                    {canEditObject && (
                    <Button onClick={() => router.push(`/data/${modelId}/edit/${objectId}`)}>
                        <Edit className="mr-2 h-4 w-4" /> Edit This {model.name}
                    </Button>
                    )}
                    <CreateShareLinkDialog 
                        modelId={modelId} 
                        objectId={objectId} 
                        objectName={getObjectDisplayValue(viewingObject, model, allModels, allDbObjects)}
                        activeLinkStatus={activeLinkStatus}
                    />
                </div>
            </div>
       )}

      {viewingObject.isDeleted && (
        <Card className="max-w-4xl mx-auto shadow-lg mb-6 border-destructive bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center">
              <ShieldAlert className="mr-2 h-6 w-6" /> This object is in the Recycle Bin
            </CardTitle>
            <CardDescription className="text-destructive/80">
              This object was deleted on {formattedDate(viewingObject.deletedAt)}. You can restore it from the data table view if needed.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card className="max-w-4xl mx-auto shadow-lg mb-8">
        <CardHeader>
          <CardTitle className="text-3xl text-primary">{getObjectDisplayValue(viewingObject, model, allModels, allDbObjects)}</CardTitle>
          <CardDescription>Detailed view of this {model.name.toLowerCase()} object.</CardDescription>
          <div className="mt-2 space-y-1">
            {currentWorkflow && (
              <div>
                  <Badge variant={viewingObject.currentStateId ? "default" : "secondary"} className="text-sm">
                      <CheckCircle className="mr-2 h-4 w-4" />
                      State: {objectStateName}
                  </Badge>
              </div>
            )}
            {!isPublicView && (
              <div>
                <Badge variant="outline" className="text-sm">
                  <UserCircleIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                  Owned By: {ownerUsername}
                </Badge>
              </div>
            )}
            <div className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground">
              <div className="flex items-center">
                <CalendarClock size={14} className="mr-1.5" />
                Created: {formattedDate(viewingObject.createdAt)}
              </div>
              <div className="flex items-center">
                <CalendarClock size={14} className="mr-1.5" />
                Last Modified: {formattedDate(viewingObject.updatedAt)}
              </div>
              {viewingObject.isDeleted && viewingObject.deletedAt && (
                 <div className="flex items-center text-destructive">
                    <CalendarClock size={14} className="mr-1.5" />
                    Deleted: {formattedDate(viewingObject.deletedAt)}
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <TooltipProvider>
        <CardContent className="space-y-6">
          <hr/>
          {sortedProperties.map(prop => {
            let appliedRule: ValidationRuleset | undefined;
            if (prop.type === 'string' && prop.validationRulesetId) {
              appliedRule = validationRulesets.find(rs => rs.id === prop.validationRulesetId);
            }
            return (
              <div key={prop.id} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-start">
                <h3 className="text-md font-semibold text-foreground md:col-span-1 flex items-center">
                  {prop.name}
                  {appliedRule && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="ml-1 h-auto w-auto p-0.5 text-blue-500 hover:bg-blue-500/10">
                            <ShieldCheck className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-semibold">Validation Rule: {appliedRule.name}</p>
                        {appliedRule.description && <p className="text-xs text-muted-foreground">{appliedRule.description}</p>}
                        <p className="text-xs text-muted-foreground mt-1">Pattern: <code className="font-mono bg-muted p-0.5 rounded-sm">{appliedRule.regexPattern}</code></p>
                      </TooltipContent>
                    </Tooltip>
                  )}:
                </h3>
                <div className="md:col-span-2 text-foreground break-words">
                  {displayFieldValue(prop, viewingObject[prop.name])}
                </div>
              </div>
            );
          })}
        </CardContent>
        </TooltipProvider>
      </Card>
      
      {!isPublicView && <IncomingRelationshipsViewer modelId={modelId} objectId={objectId} />}
      
      {!isPublicView && (
        <ShareLinkManager
            modelId={modelId}
            objectId={objectId}
        />
      )}

      {!isPublicView && (
         <Card className="max-w-4xl mx-auto shadow-lg mt-8">
            <CardHeader>
                <CardTitle className="text-2xl text-primary flex items-center">
                    <HistoryIcon className="mr-2 h-6 w-6" /> Object Changelog
                </CardTitle>
                <CardDescription>History of changes made to this object.</CardDescription>
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
                        <ShieldAlert className="h-8 w-8 mx-auto mb-2" />
                        <p>Error loading changelog: {changelogError}</p>
                    </div>
                )}
                {!isLoadingChangelog && !changelogError && changelog.length === 0 && (
                    <p className="text-muted-foreground text-center py-6">No changes recorded for this object yet.</p>
                )}
                {!isLoadingChangelog && !changelogError && changelog.length > 0 && (
                    <ScrollArea className="max-h-[500px]">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[180px]">Date &amp; Time</TableHead>
                                    <TableHead className="w-[150px]">User</TableHead>
                                    <TableHead className="w-[100px]">Action</TableHead>
                                    <TableHead>Details</TableHead>
                                    {hasPermission('objects:revert') && <TableHead className="w-[100px] text-right">Revert</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {changelog.map(entry => (
                                    <TableRow key={entry.id}>
                                        <TableCell className="text-xs">
                                            {formatDateFns(new Date(entry.changedAt), 'MMM d, yyyy, HH:mm:ss')}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="text-xs">
                                                <UserIcon className="mr-1.5 h-3 w-3" />
                                                {entry.changedByUsername || 'System'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={entry.changeType === 'CREATE' ? 'default' : entry.changeType.startsWith('REVERT_') ? 'warning' : 'secondary'} className="capitalize">
                                                {entry.changeType.toLowerCase().replace('_', ' ')}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {entry.changeType === 'CREATE' && (
                                                <div className="flex items-center">
                                                    <FileText className="h-3.5 w-3.5 mr-1.5 text-green-600" />
                                                    Object created with initial data.
                                                </div>
                                            )}
                                            {(entry.changeType === 'UPDATE' || entry.changeType === 'REVERT_UPDATE') && entry.changes.modifiedProperties && entry.changes.modifiedProperties.length > 0 && (
                                                <ul className="space-y-1">
                                                    {entry.changes.modifiedProperties.map((modProp, idx) => (
                                                        <li key={idx} className="flex items-start">
                                                            <Edit2Icon className="h-3.5 w-3.5 mr-1.5 mt-0.5 text-blue-500 shrink-0" />
                                                            <div>{renderChangeDetail(modProp)}</div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                            {(entry.changeType === 'UPDATE' || entry.changeType === 'REVERT_UPDATE') && (!entry.changes.modifiedProperties || entry.changes.modifiedProperties.length === 0) && (
                                                <span className="italic text-muted-foreground">Object updated, but no specific property changes logged.</span>
                                            )}
                                            {(entry.changeType === 'DELETE' || entry.changeType === 'REVERT_RESTORE') && (
                                                <div className="flex items-center">
                                                    <Trash2 className="h-3.5 w-3.5 mr-1.5 text-destructive" />
                                                    Object was soft-deleted.
                                                    {entry.changes.snapshot && <span className="text-muted-foreground ml-1 text-xs">(Snapshot taken)</span>}
                                                </div>
                                            )}
                                            {(entry.changeType === 'RESTORE' || entry.changeType === 'REVERT_DELETE') && (
                                                <div className="flex items-center">
                                                    <RotateCcw className="h-3.5 w-3.5 mr-1.5 text-green-600" />
                                                    Object was restored.
                                                </div>
                                            )}
                                            {(entry.changeType === 'REVERT_UPDATE' || entry.changeType === 'REVERT_DELETE' || entry.changeType === 'REVERT_RESTORE') && entry.changes.revertedFromChangelogEntryId && (
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    (Reverted from change made on: {formatDateFns(new Date(changelog.find(c => c.id === entry.changes.revertedFromChangelogEntryId)?.changedAt || entry.changedAt), 'MMM d, HH:mm')})
                                                </p>
                                            )}
                                        </TableCell>
                                        {hasPermission('objects:revert') && (
                                        <TableCell className="text-right">
                                            {canRevert(entry.changeType) && (
                                            <Button
                                                variant="outline"
                                                size="xs"
                                                onClick={() => handleRevertClick(entry.id)}
                                                disabled={isReverting && revertingEntryId === entry.id}
                                                className="text-xs"
                                            >
                                                {isReverting && revertingEntryId === entry.id ? (
                                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                                ) : (
                                                <RotateCcw className="mr-1 h-3 w-3" />
                                                )}
                                                Revert
                                            </Button>
                                            )}
                                        </TableCell>
                                        )}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                )}
            </CardContent>
        </Card>
      )}

      {!isPublicView && hasPermission('objects:revert') && (
        <AlertDialog open={isRevertConfirmOpen} onOpenChange={setIsRevertConfirmOpen}>
            <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                This action will revert the object's properties to the state they were in *before* the selected change occurred.
                This will create a new changelog entry for the revert action.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setRevertingEntryId(null)} disabled={isReverting}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmRevert} disabled={isReverting}>
                {isReverting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Yes, revert
                </AlertDialogAction>
            </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      )}

      <LightboxDialog open={!!lightboxImageUrl} onOpenChange={(open) => !open && setLightboxImageUrl(null)}>
        <LightboxDialogContent className="w-[90vw] max-w-[1600px] bg-transparent border-0 p-0 shadow-none">
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
        </LightboxDialogContent>
      </LightboxDialog>

      <LightboxDialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
        <LightboxDialogContent className="max-w-3xl">
          <LightboxDialogHeader>
            <LightboxDialogTitle>Change Details</LightboxDialogTitle>
            {selectedEntryDetails && (
                 <LightboxDialogDescription>
                    Details for {selectedEntryDetails.action} action on {selectedEntryDetails.entityType} <span className="font-mono text-xs">{selectedEntryDetails.entityName || selectedEntryDetails.entityId}</span> by {selectedEntryDetails.username} at {format(new Date(selectedEntryDetails.timestamp), 'PPpp')}.
                </LightboxDialogDescription>
            )}
          </LightboxDialogHeader>
          {selectedEntryDetails && (
            <ScrollArea className="max-h-[60vh] mt-4">
              <LogDetailViewer details={selectedEntryDetails.changes} />
            </ScrollArea>
          )}
        </LightboxDialogContent>
      </LightboxDialog>
    </div>
  );
}

    