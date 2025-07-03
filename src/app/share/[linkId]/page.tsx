
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ShieldAlert, FileWarning, Hourglass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PublicShareData } from '@/lib/types';
import ViewObjectPage from '@/app/data/[modelId]/view/[objectId]/page'; // Re-using the detailed view component
import PublicObjectForm from '@/components/objects/public-object-form';

async function fetchSharedData(linkId: string): Promise<PublicShareData> {
  if (!linkId) throw new Error("No link ID provided.");
  const response = await fetch(`/api/public/share/${linkId}`);
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to fetch shared data');
  }
  return response.json();
}


export default function SharedObjectPage() {
  const params = useParams();
  const router = useRouter();
  const linkId = params.linkId as string;

  const { data: shareData, isLoading, error } = useQuery<PublicShareData>({
    queryKey: ['sharedData', linkId],
    queryFn: () => fetchSharedData(linkId),
    enabled: !!linkId,
    retry: 1, // Don't retry endlessly on 404s
  });

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col justify-center items-center h-screen">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">Loading shared data...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="container mx-auto py-8 text-center">
          <FileWarning className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-destructive mb-2">Could Not Load Share Link</h2>
          <p className="text-muted-foreground mb-4">{error.message}</p>
        </div>
      );
    }
    
    if (shareData) {
        switch (shareData.link.link_type) {
            case 'view':
                if (shareData.object && shareData.model) {
                    return <ViewObjectPage isPublicView={true} viewingObject={shareData.object} model={shareData.model} />;
                }
                break;
            case 'create':
            case 'update':
                 return (
                    <PublicObjectForm
                        linkData={shareData}
                        onSuccess={() => {
                            // Potentially redirect to a success page or show a message
                        }}
                    />
                 );
        }
    }

    return (
       <div className="container mx-auto py-8 text-center">
          <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-destructive mb-2">Invalid Link</h2>
          <p className="text-muted-foreground mb-4">The requested share link is invalid or the data could not be loaded.</p>
        </div>
    );
  };

  return (
    <div className="bg-background">
      {renderContent()}
    </div>
  );
}
