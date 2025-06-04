
'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useParams } from 'next/navigation';
import WorkflowForm from '@/components/workflows/workflow-form';
import type { WorkflowFormValues } from '@/components/workflows/workflow-form-schema';
import { workflowFormSchema } from '@/components/workflows/workflow-form-schema';
import { useData } from '@/contexts/data-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { WorkflowWithDetails } from '@/lib/types';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { withAuth } from '@/contexts/auth-context';

function mapWorkflowToFormValues(workflow?: WorkflowWithDetails): WorkflowFormValues {
  if (!workflow) {
    return {
      name: '',
      description: '',
      states: [{ id: `temp-${crypto.randomUUID()}`, name: 'New', description: 'Initial state', isInitial: true, successorStateNames: [] }],
    };
  }
  return {
    name: workflow.name,
    description: workflow.description || '',
    states: workflow.states.map(state => {
      const successorNames = state.successorStateIds
        .map(id => workflow.states.find(s => s.id === id)?.name)
        .filter(name => !!name) as string[];
      return {
        id: state.id,
        name: state.name,
        description: state.description || '',
        isInitial: !!state.isInitial,
        successorStateNames: successorNames,
      };
    }),
  };
}

function EditWorkflowPageInternal() {
  const router = useRouter();
  const params = useParams();
  const workflowId = params.workflowId as string;

  const { getWorkflowById, updateWorkflow, isReady: dataIsReady, fetchData } = useData(); // Removed pause/resumePolling
  const { toast } = useToast();

  const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowWithDetails | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const form = useForm<WorkflowFormValues>({
    resolver: zodResolver(workflowFormSchema),
    defaultValues: mapWorkflowToFormValues(), 
  });
  
  // Removed useEffect for pause/resumePolling

  useEffect(() => {
    if (dataIsReady && workflowId) {
      const foundWorkflow = getWorkflowById(workflowId);
      if (foundWorkflow) {
        setCurrentWorkflow(foundWorkflow);
        form.reset(mapWorkflowToFormValues(foundWorkflow));
      } else {
        toast({ variant: "destructive", title: "Error", description: `Workflow with ID ${workflowId} not found.` });
        router.push('/admin/workflows');
      }
      setIsLoadingData(false);
    }
  }, [workflowId, getWorkflowById, dataIsReady, form, router, toast]);

  const onSubmit = async (values: WorkflowFormValues) => {
    if (!currentWorkflow) return;

    const payloadStates = values.states.map(s => ({
      id: s.id?.startsWith('temp-') ? undefined : s.id,
      name: s.name,
      description: s.description,
      isInitial: s.isInitial,
      successorStateNames: s.successorStateNames || [],
    }));
    
    const payload = {
      name: values.name,
      description: values.description,
      states: payloadStates,
    };

    try {
      await updateWorkflow(currentWorkflow.id, payload);
      toast({ title: "Workflow Updated", description: `Workflow "${values.name}" has been updated.` });
      await fetchData(); 
      router.push('/admin/workflows');
    } catch (error: any) {
      let errorMessage = "Failed to update workflow.";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      toast({ variant: "destructive", title: "Error Updating Workflow", description: errorMessage });
    }
  };

  if (!dataIsReady || isLoadingData) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading workflow details...</p>
      </div>
    );
  }

  if (!currentWorkflow) {
     return (
      <div className="flex flex-col justify-center items-center h-screen">
        <p className="text-lg text-destructive">Workflow not found.</p>
        <Button onClick={() => router.push(`/admin/workflows`)} className="mt-4">Back to Workflow Admin</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 flex flex-col h-full">
      <Button variant="outline" onClick={() => router.push('/admin/workflows')} className="mb-6 flex-shrink-0">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Workflow Admin
      </Button>
      <Card className="max-w-4xl mx-auto flex-grow min-h-0 flex flex-col w-full">
        <CardHeader className="flex-shrink-0">
          <CardTitle className="text-2xl">Edit Workflow: {currentWorkflow.name}</CardTitle>
          <CardDescription>Update details for the "{currentWorkflow.name}" workflow.</CardDescription>
        </CardHeader>
        <CardContent className="flex-grow min-h-0">
          <WorkflowForm
            form={form}
            onSubmit={onSubmit}
            onCancel={() => router.push('/admin/workflows')}
            existingWorkflow={currentWorkflow}
            isLoading={form.formState.isSubmitting}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default withAuth(EditWorkflowPageInternal, ['administrator']);
