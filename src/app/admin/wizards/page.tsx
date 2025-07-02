

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useData } from '@/contexts/data-context';
import { withAuth } from '@/contexts/auth-context';
import type { Wizard, WizardRunSummary } from '@/lib/types';
import { PlusCircle, Edit, Trash2, Search, Loader2, Wand2, StepForward, PlayCircle, Redo, Eraser } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { getObjectDisplayValue } from '@/lib/utils'; // Import the utility
import * as React from 'react';

async function fetchActiveRuns(): Promise<WizardRunSummary[]> {
  const response = await fetch('/api/codex-structure/wizards/runs');
  if (!response.ok) throw new Error('Failed to fetch active wizard runs.');
  return response.json();
}

async function abandonRun(runId: string) {
  const response = await fetch(`/api/codex-structure/wizards/run/${runId}`, { method: 'DELETE' });
  if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to abandon wizard run.');
  }
}


function WizardsAdminPageInternal() {
  const { wizards, deleteWizard, isReady: dataIsReady, fetchData, formatApiError, getModelById, getObjectsByModelId, allModels, getAllObjects } = useData();
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isStartingWizard, setIsStartingWizard] = useState<string | null>(null);

  const { data: activeRuns = [] } = useQuery<WizardRunSummary[]>({
    queryKey: ['activeWizardRuns'],
    queryFn: fetchActiveRuns,
    enabled: dataIsReady,
  });

  const allDbObjects = useMemo(() => getAllObjects(), [getAllObjects, dataIsReady]);

  const abandonMutation = useMutation({
    mutationFn: abandonRun,
    onSuccess: () => {
        toast({ title: 'Wizard Run Abandoned', description: 'The in-progress run has been deleted.' });
        queryClient.invalidateQueries({ queryKey: ['activeWizardRuns'] });
    },
    onError: (err: Error) => {
        toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
  });


  useEffect(() => {
    fetchData('Navigated to Wizard Admin');
  }, [fetchData]);

  const filteredWizards = useMemo(() => {
    return wizards.filter(w =>
      w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (w.description && w.description.toLowerCase().includes(searchTerm.toLowerCase()))
    ).sort((a,b) => a.name.localeCompare(b.name));
  }, [wizards, searchTerm]);

  const handleCreateNew = () => {
    router.push('/admin/wizards/new');
  };

  const handleEdit = (wizardId: string) => {
    router.push(`/admin/wizards/edit/${wizardId}`);
  };

  const handleDelete = async (wizardId: string, wizardName: string) => {
    try {
      await deleteWizard(wizardId);
      toast({ title: "Wizard Deleted", description: `Wizard "${wizardName}" has been successfully deleted.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error Deleting Wizard", description: error.message });
    }
  };
  
  const handleStartNewWizardRun = async (wizardId: string) => {
    setIsStartingWizard(wizardId);
    try {
      const response = await fetch(`/api/codex-structure/wizards/${wizardId}/start`, { method: 'POST' });
      if (!response.ok) {
        const errorMsg = await formatApiError(response, 'Failed to start wizard run.');
        throw new Error(errorMsg);
      }
      const { runId } = await response.json();
      router.push(`/wizards/run/${runId}`);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error Starting Wizard', description: error.message });
    } finally {
      setIsStartingWizard(null);
    }
  };

  if (!dataIsReady) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading wizard admin...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="text-center md:text-left">
          <h1 className="text-3xl font-bold text-primary flex items-center">
            <Wand2 className="mr-3 h-8 w-8" /> Wizard Administration
          </h1>
          <p className="text-muted-foreground">Define and manage guided data entry flows.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-grow md:flex-grow-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search wizards..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full md:w-64"
            />
          </div>
          <Button onClick={handleCreateNew} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <PlusCircle className="mr-2 h-4 w-4" /> Create Wizard
          </Button>
        </div>
      </header>

      {filteredWizards.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Wand2 size={48} className="mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold">No Wizards Found</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm ? `No wizards match your search for "${searchTerm}".` : "You haven't created any wizards yet."}
            </p>
            {!searchTerm && (
              <Button onClick={handleCreateNew} variant="default">
                <PlusCircle className="mr-2 h-4 w-4" /> Create First Wizard
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {filteredWizards.map((wizard) => {
            const runsForThisWizard = activeRuns.filter(r => r.wizardId === wizard.id);
            return (
              <Card key={wizard.id} className="shadow-lg">
                <CardHeader className="flex flex-row justify-between items-start">
                    <div>
                        <CardTitle>{wizard.name}</CardTitle>
                        <CardDescription className="max-w-prose">{wizard.description || 'No description provided.'}</CardDescription>
                         <div className="text-xs text-muted-foreground pt-1 flex items-center">
                            <StepForward className="mr-1.5 h-3 w-3" /> {wizard.steps.length} {wizard.steps.length === 1 ? 'Step' : 'Steps'}
                        </div>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(wizard.id)} className="hover:text-primary">
                            <Edit className="h-4 w-4 mr-1" /> Edit
                        </Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="hover:text-destructive">
                                <Trash2 className="h-4 w-4 mr-1" /> Delete
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action cannot be undone. This will permanently delete the wizard "{wizard.name}".
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(wizard.id, wizard.name)}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                         <Button variant="outline" size="sm" onClick={() => handleStartNewWizardRun(wizard.id)} disabled={isStartingWizard === wizard.id}>
                            {isStartingWizard === wizard.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2"/>}
                            Run Wizard
                        </Button>
                    </div>
                </CardHeader>
                {runsForThisWizard.length > 0 && (
                    <CardContent>
                        <div className="bg-muted/50 border rounded-lg p-3">
                            <h4 className="font-semibold text-sm mb-2">In-Progress Runs</h4>
                            <div className="space-y-2">
                                {runsForThisWizard.map(run => {
                                    const stepDataPreviewNode = (() => {
                                        if (!run.stepData) return <span className="italic">No data entered yet.</span>;
                                        try {
                                            const parsedData = JSON.parse(run.stepData);
                                            const completedStepsCount = run.currentStepIndex + 1;
                                            if (completedStepsCount === 0) return <span className="italic">No data entered yet.</span>;

                                            const previews: React.ReactNode[] = [];
                                            for (let i = 0; i < completedStepsCount; i++) {
                                                const stepData = parsedData[i];
                                                const stepDef = wizard.steps.find(s => s.orderIndex === i);
                                                const model = stepDef ? getModelById(stepDef.modelId) : null;
                                                if (!stepData || !stepDef || !model) continue;

                                                let previewText: string = '';
                                                let key = model.name;

                                                if (stepData.stepType === 'lookup' && stepData.formData) {
                                                    const lookedUpObject = { id: stepData.objectId, ...stepData.formData };
                                                    key = `Selected ${model.name}`;
                                                    previewText = getObjectDisplayValue(lookedUpObject, model, allModels, allDbObjects);
                                                } else if (stepData.stepType === 'create' && stepData.formData) {
                                                    const tempCreatedObject = { id: '', ...stepData.formData };
                                                    key = `New ${model.name}`;
                                                    previewText = getObjectDisplayValue(tempCreatedObject, model, allModels, allDbObjects);
                                                }

                                                if (previewText) {
                                                    previews.push(<span key={i} className="font-medium">{key}: <span className="text-primary">{previewText}</span></span>);
                                                }
                                            }
                                            
                                            if (previews.length === 0) return <span className="italic">No preview available.</span>;

                                            return (
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                    {previews.map((preview, idx) => (
                                                        <React.Fragment key={idx}>
                                                            {preview}
                                                            {idx < previews.length - 1 && <span className="text-muted-foreground text-xs">&bull;</span>}
                                                        </React.Fragment>
                                                    ))}
                                                </div>
                                            );
                                        } catch (e) {
                                            console.error("Error parsing wizard run preview:", e);
                                            return <span className="italic text-destructive">Could not parse preview.</span>;
                                        }
                                    })();
                                    return (
                                        <div key={run.id} className="flex justify-between items-center bg-background p-2 rounded-md">
                                            <div className="flex flex-col gap-1 flex-grow min-w-0">
                                                <div className="flex justify-between items-center">
                                                    <p className="text-sm">Step {run.currentStepIndex + 2} of {wizard.steps.length}</p>
                                                    <p className="text-xs text-muted-foreground">Last updated: {formatDistanceToNow(new Date(run.updatedAt), { addSuffix: true })}</p>
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {stepDataPreviewNode}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                                                <Button size="sm" variant="secondary" onClick={() => router.push(`/wizards/run/${run.id}`)}>
                                                    <Redo className="h-4 w-4 mr-2"/> Resume
                                                </Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="destructive" size="sm" disabled={abandonMutation.isPending}>
                                                            {abandonMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <Eraser className="h-4 w-4 mr-2"/>}
                                                            Abandon
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader><AlertDialogTitle>Abandon this run?</AlertDialogTitle><AlertDialogDescription>This will delete this in-progress run and any data entered. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                                                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => abandonMutation.mutate(run.id)}>Abandon Run</AlertDialogAction></AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default withAuth(WizardsAdminPageInternal, 'admin:manage_wizards');
