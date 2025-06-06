
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useData } from '@/contexts/data-context';
import type { Model, DataObject, Property, WorkflowWithDetails, ValidationRuleset, ChangelogEntry, PropertyChangeDetail } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Edit, Loader2, ExternalLink, ImageIcon, CheckCircle2, ShieldAlert, ShieldCheck, UserCircle, CalendarClock, History, FileText, Users as UsersIconLucide } from 'lucide-react';
import { format as formatDateFns, isValid as isDateValid } from 'date-fns';
import Link from 'next/link';
import { getObjectDisplayValue } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import ReactMarkdown from 'react-markdown';
import { StarDisplay } from '@/components/ui/star-display';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from '@/components/ui/scroll-area';


export default function ViewObjectPage() {
  const router = useRouter();
  const params = useParams();
  const modelId = params.modelId as string;
  const objectId = params.objectId as string;
  const { toast } = useToast();

  const { getModelById, models: allModels, getAllObjects, getWorkflowById, validationRulesets, getUserById, isReady: dataContextIsReady, formatApiError } = useData();

  const [currentModel, setCurrentModel] = useState<Model | null>(null);
  const [viewingObject, setViewingObject] = useState<DataObject | null>(null);
  const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowWithDetails | null>(null);
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const [isLoadingPageData, setIsLoadingPageData] = useState(true);
  const [isLoadingChangelog, setIsLoadingChangelog] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [changelogError, setChangelogError] = useState<string | null>(null);


  const allDbObjects = useMemo(() => getAllObjects(), [getAllObjects, dataContextIsReady]);

  const getWorkflowStateName = useCallback((stateId: string | null | undefined): string => {
    if (!stateId || !currentWorkflow) return 'N/A';
    const state = currentWorkflow.states.find(s => s.id === stateId);
    return state ? state.name : 'Unknown State';
  }, [currentWorkflow]);

  const ownerUsername = useMemo(() => {
    if (viewingObject?.ownerId) {
      const owner = getUserById(viewingObject.ownerId);
      return owner?.username || 'Unknown User';
    }
    return 'Not Assigned';
  }, [viewingObject, getUserById]);


  useEffect(() => {
    const loadObjectData = async () => {
      if (!dataContextIsReady || !modelId || !objectId) {
        return;
      }

      setIsLoadingPageData(true);
      setPageError(null);

      const foundModel = getModelById(modelId);
      if (!foundModel) {
        toast({ variant: "destructive", title: "Error", description: `Model with ID ${modelId} not found.` });
        router.push('/models');
        setIsLoadingPageData(false);
        return;
      }
      setCurrentModel(foundModel);

      if (foundModel.workflowId) {
        setCurrentWorkflow(getWorkflowById(foundModel.workflowId) || null);
      } else {
        setCurrentWorkflow(null);
      }

      try {
        const response = await fetch(`/api/codex-structure/models/${modelId}/objects/${objectId}`);
        if (!response.ok) {
          const errorMsg = await formatApiError(response, `Object with ID ${objectId} not found or error fetching.`);
          throw new Error(errorMsg);
        }
        const objectToView: DataObject = await response.json();
        setViewingObject(objectToView);
      } catch (error: any) {
        console.error("Error fetching object for view:", error);
        setPageError(error.message || "Failed to load object details.");
        toast({ variant: "destructive", title: "Error Loading Object", description: error.message });
      } finally {
        setIsLoadingPageData(false);
      }
    };

    loadObjectData();
  }, [modelId, objectId, dataContextIsReady, getModelById, getWorkflowById, router, toast, formatApiError]);

  useEffect(() => {
    const fetchChangelog = async () => {
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
    };

    if (viewingObject) {
      fetchChangelog();
    }
  }, [viewingObject, objectId, toast, formatApiError]);


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
          <div className="relative w-full max-w-md aspect-video rounded-md overflow-hidden border">
            <Image
              src={finalImageUrl}
              alt={`${property.name} for ${getObjectDisplayValue(viewingObject, currentModel, allModels, allDbObjects)}`}
              layout="fill"
              objectFit="contain"
              data-ai-hint={currentModel?.name.toLowerCase() || "object image"}
              onError={(e) => { (e.target as HTMLImageElement).src = placeholderImage; (e.target as HTMLImageElement).dataset.aiHint = 'placeholder image'; }}
            />
            {finalImageUrl !== placeholderImage && (
                 <a href={finalImageUrl} target="_blank" rel="noopener noreferrer" className="absolute bottom-2 right-2 bg-background/70 p-1 rounded-sm hover:bg-background">
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </a>
            )}
          </div>
        );
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
                return relatedObj ? (
                  <Link key={itemId} href={`/data/${relatedModel.id}/view/${relatedObj.id}`} passHref legacyBehavior>
                    <a className="inline-block">
                      <Badge variant="outline" className="hover:bg-secondary cursor-pointer">
                        {displayVal} <ExternalLink className="ml-1 h-3 w-3 opacity-70" />
                      </Badge>
                    </a>
                  </Link>
                ) : (
                  <Badge key={itemId} variant="outline" className="mr-1 mb-1">{displayVal}</Badge>
                );
              })}
            </div>
          );
        } else {
          const relatedObj = (allDbObjects[property.relatedModelId] || []).find(o => o.id === value);
          const displayVal = getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects);
          return relatedObj ? (
            <Link href={`/data/${relatedModel.id}/view/${relatedObj.id}`} passHref legacyBehavior>
              <a className="inline-block">
                <Badge variant="outline" className="hover:bg-secondary cursor-pointer">
                  {displayVal} <ExternalLink className="ml-1 h-3 w-3 opacity-70" />
                </Badge>
              </a>
            </Link>
          ) : <span className="text-muted-foreground italic">{displayVal}</span>;
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
    if (typeof value === 'object') return JSON.stringify(value); // Fallback for other objects
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
    } else {
      const propDef = currentModel?.properties.find(p => p.name === propertyName);
      propertyDisplayName = propDef?.name || propertyName;
      finalOldValue = formatChangelogValue(oldValue);
      finalNewValue = formatChangelogValue(newValue);
    }

    return (
      <>
        <span className="font-semibold">{propertyDisplayName}:</span>
        <span className="text-destructive line-through mx-1" title={String(oldValue)}>{finalOldValue}</span>
        <span className="text-green-600 font-medium" title={String(newValue)}>{finalNewValue}</span>
      </>
    );
  };


  if (isLoadingPageData) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading object details...</p>
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="container mx-auto py-8 text-center">
        <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-2xl font-semibold text-destructive mb-2">Error Loading Object</h2>
        <p className="text-muted-foreground mb-4">{pageError}</p>
        <Button onClick={() => router.push(`/data/${modelId}`)} className="mt-4">Back to {currentModel?.name || 'Data'}</Button>
      </div>
    );
  }


  if (!currentModel || !viewingObject) {
     return (
      <div className="flex flex-col justify-center items-center h-screen">
        <p className="text-lg text-destructive">Object or Model not found.</p>
        <Button onClick={() => router.push(modelId ? `/data/${modelId}` : '/models')} className="mt-4">
            Back to {currentModel?.name || 'Data'}
        </Button>
      </div>
    );
  }

  const sortedProperties = [...currentModel.properties].sort((a,b) => a.orderIndex - b.orderIndex);
  const objectStateName = getWorkflowStateName(viewingObject.currentStateId);

  const formattedDate = (dateString: string | undefined) => {
    if (!dateString) return <span className="text-muted-foreground italic">Not set</span>;
    try {
      const date = new Date(dateString);
      return isDateValid(date) ? formatDateFns(date, 'PPP p') : <span className="text-muted-foreground italic">Invalid date</span>;
    } catch {
      return <span className="text-muted-foreground italic">Invalid date format</span>;
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <Button variant="outline" onClick={() => router.push(`/data/${modelId}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to {currentModel.name} Data
        </Button>
        <Button onClick={() => router.push(`/data/${modelId}/edit/${objectId}`)}>
          <Edit className="mr-2 h-4 w-4" /> Edit This {currentModel.name}
        </Button>
      </div>
      <Card className="max-w-4xl mx-auto shadow-lg mb-8">
        <CardHeader>
          <CardTitle className="text-3xl text-primary">{getObjectDisplayValue(viewingObject, currentModel, allModels, allDbObjects)}</CardTitle>
          <CardDescription>Detailed view of this {currentModel.name.toLowerCase()} object.</CardDescription>
          <div className="mt-2 space-y-1">
            {currentWorkflow && (
              <div>
                  <Badge variant={viewingObject.currentStateId ? "default" : "secondary"} className="text-sm">
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      State: {objectStateName}
                  </Badge>
              </div>
            )}
            <div>
              <Badge variant="outline" className="text-sm">
                <UserCircle className="mr-2 h-4 w-4 text-muted-foreground" />
                Owned By: {ownerUsername}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground">
              <div className="flex items-center">
                <CalendarClock size={14} className="mr-1.5" />
                Created: {formattedDate(viewingObject.createdAt)}
              </div>
              <div className="flex items-center">
                <CalendarClock size={14} className="mr-1.5" />
                Last Modified: {formattedDate(viewingObject.updatedAt)}
              </div>
            </div>
          </div>
        </CardHeader>
        <TooltipProvider>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-1">Object ID (UUID)</h3>
            <p className="text-sm font-mono bg-muted p-2 rounded-md">{viewingObject.id}</p>
          </div>
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
                        <ShieldCheck className="h-4 w-4 ml-2 text-blue-500" />
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

      <Card className="max-w-4xl mx-auto shadow-lg">
        <CardHeader>
            <CardTitle className="text-2xl text-primary flex items-center">
                <History className="mr-2 h-6 w-6" /> Object Changelog
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
                                <TableHead className="w-[180px]">Date & Time</TableHead>
                                <TableHead className="w-[150px]">User</TableHead>
                                <TableHead className="w-[100px]">Action</TableHead>
                                <TableHead>Details</TableHead>
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
                                            <UsersIconLucide className="mr-1.5 h-3 w-3" />
                                            {entry.changedByUsername || 'System'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={entry.changeType === 'CREATE' ? 'default' : 'secondary'} className="capitalize">
                                            {entry.changeType.toLowerCase()}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-xs">
                                        {entry.changeType === 'CREATE' && (
                                            <div className="flex items-center">
                                                <FileText className="h-3.5 w-3.5 mr-1.5 text-green-600" />
                                                Object created with initial data.
                                            </div>
                                        )}
                                        {entry.changeType === 'UPDATE' && entry.changes.modifiedProperties && entry.changes.modifiedProperties.length > 0 && (
                                            <ul className="space-y-1">
                                                {entry.changes.modifiedProperties.map((modProp, idx) => (
                                                    <li key={idx} className="flex items-start">
                                                        <Edit className="h-3.5 w-3.5 mr-1.5 mt-0.5 text-blue-500 shrink-0" />
                                                        <div>{renderChangeDetail(modProp)}</div>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                        {entry.changeType === 'UPDATE' && (!entry.changes.modifiedProperties || entry.changes.modifiedProperties.length === 0) && (
                                             <span className="italic text-muted-foreground">Object updated, but no specific property changes logged (possibly meta-data update).</span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </ScrollArea>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

