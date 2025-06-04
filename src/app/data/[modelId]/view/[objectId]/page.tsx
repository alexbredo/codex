
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useData } from '@/contexts/data-context';
import type { Model, DataObject, Property, WorkflowWithDetails } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Edit, Loader2, ExternalLink, ImageIcon, CheckCircle2, ShieldAlert } from 'lucide-react';
import { format as formatDateFns, isValid as isDateValid } from 'date-fns';
import Link from 'next/link';
import { getObjectDisplayValue } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import ReactMarkdown from 'react-markdown';
import { StarDisplay } from '@/components/ui/star-display';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';

export default function ViewObjectPage() {
  const router = useRouter();
  const params = useParams();
  const modelId = params.modelId as string;
  const objectId = params.objectId as string;
  const { toast } = useToast();

  const { getModelById, models: allModels, getAllObjects, getWorkflowById, isReady: dataContextIsReady, formatApiError } = useData();

  const [currentModel, setCurrentModel] = useState<Model | null>(null);
  const [viewingObject, setViewingObject] = useState<DataObject | null>(null);
  const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowWithDetails | null>(null);
  const [isLoadingPageData, setIsLoadingPageData] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);


  const allDbObjects = useMemo(() => getAllObjects(), [getAllObjects, dataContextIsReady]);

  const getWorkflowStateName = useCallback((stateId: string | null | undefined): string => {
    if (!stateId || !currentWorkflow) return 'N/A';
    const state = currentWorkflow.states.find(s => s.id === stateId);
    return state ? state.name : 'Unknown State';
  }, [currentWorkflow]);

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
        const precision = property.precision === undefined ? 2 : property.precision;
        const unitText = property.unit || '';
        const parsedValue = parseFloat(value);
        if (isNaN(parsedValue)) return <span className="text-muted-foreground italic">Invalid number</span>;
        return `${parsedValue.toFixed(precision)}${unitText ? ` ${unitText}` : ''}`;
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
      <Card className="max-w-4xl mx-auto shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl text-primary">{getObjectDisplayValue(viewingObject, currentModel, allModels, allDbObjects)}</CardTitle>
          <CardDescription>Detailed view of this {currentModel.name.toLowerCase()} object.</CardDescription>
           {currentWorkflow && (
            <div className="mt-2">
                <Badge variant={viewingObject.currentStateId ? "default" : "secondary"} className="text-sm">
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    State: {objectStateName}
                </Badge>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-1">Object ID (UUID)</h3>
            <p className="text-sm font-mono bg-muted p-2 rounded-md">{viewingObject.id}</p>
          </div>
          <hr/>
          {sortedProperties.map(prop => (
            <div key={prop.id} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-start">
              <h3 className="text-md font-semibold text-foreground md:col-span-1">{prop.name}:</h3>
              <div className="md:col-span-2 text-foreground break-words">
                {displayFieldValue(prop, viewingObject[prop.name])}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

