
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useData } from '@/contexts/data-context';
import type { Model, DataObject, Property } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Edit, Loader2, ExternalLink } from 'lucide-react';
import { format as formatDateFns, isValid as isDateValid } from 'date-fns';
import Link from 'next/link';
import { getObjectDisplayValue } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import ReactMarkdown from 'react-markdown';

export default function ViewObjectPage() {
  const router = useRouter();
  const params = useParams();
  const modelId = params.modelId as string;
  const objectId = params.objectId as string;

  const { getModelById, getObjectsByModelId, models: allModels, getAllObjects, isReady } = useData();

  const [currentModel, setCurrentModel] = useState<Model | null>(null);
  const [viewingObject, setViewingObject] = useState<DataObject | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const allDbObjects = useMemo(() => getAllObjects(), [getAllObjects, isReady]);

  useEffect(() => {
    if (isReady && modelId && objectId) {
      const foundModel = getModelById(modelId);
      if (foundModel) {
        setCurrentModel(foundModel);
        const modelObjects = getObjectsByModelId(modelId);
        const objectToView = modelObjects.find(obj => obj.id === objectId);

        if (objectToView) {
          setViewingObject(objectToView);
        } else {
          router.push(`/data/${modelId}`); 
        }
      } else {
        router.push('/models'); 
      }
      setIsLoadingData(false);
    }
  }, [modelId, objectId, getModelById, getObjectsByModelId, isReady, router]);

  const displayFieldValue = (property: Property, value: any) => {
    if (value === null || typeof value === 'undefined' || (Array.isArray(value) && value.length === 0)) {
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
        return strValue.length > 300 ? <pre className="whitespace-pre-wrap text-sm">{strValue.substring(0, 297) + '...'}</pre> : <pre className="whitespace-pre-wrap text-sm">{strValue}</pre>;
    }
  };

  if (!isReady || isLoadingData) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading object details...</p>
      </div>
    );
  }

  if (!currentModel || !viewingObject) {
     return (
      <div className="flex flex-col justify-center items-center h-screen">
        <p className="text-lg text-destructive">Object or Model not found.</p>
        <Button onClick={() => router.push(`/data/${modelId}`)} className="mt-4">Back to Data</Button>
      </div>
    );
  }

  const sortedProperties = [...currentModel.properties].sort((a,b) => a.orderIndex - b.orderIndex);

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
