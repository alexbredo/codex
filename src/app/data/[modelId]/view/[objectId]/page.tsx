
'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useData } from '@/contexts/data-context';
import { useAuth } from '@/contexts/auth-context';
import type { DataObject, Model } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle } from 'lucide-react';
import ObjectDetailView from '@/components/objects/object-detail-view';

export default function ObjectDetailViewPageWrapper() {
  const params = useParams();
  const dataContext = useData();
  const authContext = useAuth();
  const router = useRouter();

  const [model, setModel] = React.useState<Model | null>(null);
  const [viewingObject, setViewingObject] = React.useState<DataObject | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  
  React.useEffect(() => {
    if (dataContext.isReady && !authContext.isLoading) {
      const modelId = params.modelId as string;
      const objectId = params.objectId as string;

      if (!modelId || !objectId) {
        setError("Model or Object ID is missing from the URL.");
        setIsLoading(false);
        return;
      }
      
      const foundModel = dataContext.getModelById(modelId);
      if (!foundModel) {
        setError(`Model with ID ${modelId} not found.`);
        setIsLoading(false);
        return;
      }

      const objects = dataContext.getObjectsByModelId(modelId, true);
      const foundObject = objects.find(o => o.id === objectId);
      if (!foundObject) {
        setError(`Object with ID ${objectId} not found in model "${foundModel.name}".`);
        setIsLoading(false);
        return;
      }

      setModel(foundModel);
      setViewingObject(foundObject);
      setIsLoading(false);
    }
  }, [dataContext.isReady, authContext.isLoading, params, dataContext.getModelById, dataContext.getObjectsByModelId]);
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-2xl font-semibold text-destructive mb-2">Error</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  if (!model || !viewingObject) {
    return (
      <div className="container mx-auto py-8 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <p>The requested object could not be loaded.</p>
      </div>
    );
  }

  return <ObjectDetailView model={model} viewingObject={viewingObject} isPublicView={false} />;
}
