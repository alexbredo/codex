
'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useData } from '@/contexts/data-context';
import type { DataObject, Model } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { withAuth } from '@/contexts/auth-context';
import ObjectDetailView from '@/components/objects/object-detail-view';

// This component can now be rendered in two modes:
// 1. As a regular page within the app layout (default)
// 2. As a minimal, public-facing page via a share link
interface ViewObjectPageProps {
  isPublicView?: boolean;
  publicObjectData?: DataObject; // Data passed in for public view
  publicModelData?: Model; // Model data passed in for public view
}

function ViewObjectPageInternal({ isPublicView = false, publicObjectData, publicModelData }: ViewObjectPageProps) {
  const params = useParams();
  const { toast } = useToast();
  const { getModelById, formatApiError } = useData();

  const modelId = isPublicView ? publicModelData?.id : params.modelId as string;
  const objectId = isPublicView ? publicObjectData?.id : params.objectId as string;

  const fetchObject = async (): Promise<{ model: Model; object: DataObject }> => {
    if (isPublicView && publicObjectData && publicModelData) {
      return { model: publicModelData, object: publicObjectData };
    }
    
    if (!modelId || !objectId) {
      throw new Error("Model or Object ID is missing.");
    }

    const model = getModelById(modelId);
    if (!model) {
      throw new Error(`Model with ID ${modelId} not found.`);
    }

    const response = await fetch(`/api/codex-structure/models/${modelId}/objects/${objectId}`);
    if (!response.ok) {
      const errorMsg = await formatApiError(response, `Object with ID ${objectId} not found or error fetching.`);
      throw new Error(errorMsg);
    }
    const object = await response.json();
    return { model, object };
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['objectView', modelId, objectId],
    queryFn: fetchObject,
    enabled: !!modelId && !!objectId,
  });

  React.useEffect(() => {
    if (error) {
      toast({ variant: "destructive", title: "Error Loading Object", description: error.message });
    }
  }, [error, toast]);

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading object details...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto py-8 text-center">
        <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-2xl font-semibold text-destructive mb-2">Error Loading Object</h2>
        <p className="text-muted-foreground mb-4">{error?.message || "Object or Model details could not be fully loaded."}</p>
      </div>
    );
  }

  return <ObjectDetailView model={data.model} viewingObject={data.object} isPublicView={isPublicView} />;
}

// Check auth only if it's not a public view
export default function ViewObjectPageWrapper(props: ViewObjectPageProps) {
  if (props.isPublicView) {
    return <ViewObjectPageInternal {...props} />;
  }
  const AuthenticatedView = withAuth(ViewObjectPageInternal, 'any'); // Use 'any' to ensure user is logged in
  return <AuthenticatedView {...props} />;
}
