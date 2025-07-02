
'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

function StartWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const wizardId = searchParams.get('wizardId');

  useEffect(() => {
    if (!wizardId) {
      toast({ title: 'Error', description: 'No wizard ID provided.', variant: 'destructive' });
      router.replace('/admin/wizards');
      return;
    }

    const startRun = async () => {
      try {
        const response = await fetch(`/api/codex-structure/wizards/${wizardId}/start`, { method: 'POST' });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to start wizard run.');
        }
        const { runId } = await response.json();
        router.push(`/wizards/run/${runId}`);
      } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error Starting Wizard', description: error.message });
        router.replace('/admin/wizards');
      }
    };

    startRun();
  }, [wizardId, router, toast]);

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="mt-4 text-muted-foreground">Starting wizard...</p>
    </div>
  );
}

export default function RunStartHandlerPage() {
    return (
        <Suspense fallback={<div className="flex flex-col items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="mt-4 text-muted-foreground">Loading...</p></div>}>
            <StartWizard />
        </Suspense>
    )
}
