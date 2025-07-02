

'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { withAuth } from '@/contexts/auth-context';
import type { WizardRunSummary } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Loader2, Wand2, PlayCircle, Trash2, NotebookText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

async function fetchActiveRuns(): Promise<WizardRunSummary[]> {
  const response = await fetch('/api/codex-structure/wizards/runs');
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to fetch active wizard runs.');
  }
  return response.json();
}

async function abandonRun(runId: string) {
  const response = await fetch(`/api/codex-structure/wizards/run/${runId}`, { method: 'DELETE' });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to abandon wizard run.');
  }
}

function ActiveWizardRunsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: runs, isLoading, error } = useQuery<WizardRunSummary[]>({
    queryKey: ['activeWizardRuns'],
    queryFn: fetchActiveRuns,
  });

  const abandonMutation = useMutation({
    mutationFn: abandonRun,
    onSuccess: () => {
      toast({ title: 'Wizard Run Abandoned', description: 'The wizard run and its temporary data have been deleted.' });
      queryClient.invalidateQueries({ queryKey: ['activeWizardRuns'] });
    },
    onError: (err: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    },
  });

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }
    if (error) {
      return <p className="text-center text-destructive py-10">Error: {error.message}</p>;
    }
    if (!runs || runs.length === 0) {
      return (
        <div className="text-center py-12">
          <NotebookText size={48} className="mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold">No In-Progress Wizards</h3>
          <p className="text-muted-foreground mt-2">You do not have any wizards that were started but not completed.</p>
        </div>
      );
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Wizard Name</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead>Last Updated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map(run => (
            <TableRow key={run.id}>
              <TableCell className="font-medium">{run.wizardName}</TableCell>
              <TableCell>Step {run.currentStepIndex + 2}</TableCell>
              <TableCell>{formatDistanceToNow(new Date(run.updatedAt), { addSuffix: true })}</TableCell>
              <TableCell className="text-right space-x-2">
                <Button size="sm" onClick={() => router.push(`/wizards/run/${run.id}`)}>
                  <PlayCircle className="mr-2 h-4 w-4" /> Resume
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="mr-2 h-4 w-4" /> Abandon
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete this wizard run and any data you have entered so far. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => abandonMutation.mutate(run.id)}>
                        Abandon Run
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="container mx-auto py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-primary flex items-center gap-3">
          <Wand2 className="h-8 w-8" /> In-Progress Wizard Runs
        </h1>
        <p className="text-muted-foreground mt-2">View and resume any wizards you have started but not yet completed.</p>
      </header>
      <Card>
        <CardContent className="pt-6">
          {renderContent()}
        </CardContent>
      </Card>
    </div>
  );
}

export default withAuth(ActiveWizardRunsPage);

