
'use client';

import { useEffect } from 'react'; 
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import WorkflowForm from '@/components/workflows/workflow-form';
import type { WorkflowFormValues } from '@/components/workflows/workflow-form-schema';
import { workflowFormSchema } from '@/components/workflows/workflow-form-schema';
import { useData } from '@/contexts/data-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { withAuth } from '@/contexts/auth-context';

const DEFAULT_STATE_COLORS_NEW = [ // Using the same list as in the form for consistency
  '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899',
  '#6366F1', '#EF4444', '#22C55E', '#D946EF', '#F97316',
  '#06B6D4', '#FBBF24', '#A855F7', '#F43F5E', '#7DD3FC'
];

function CreateWorkflowPageInternal() {
  const router = useRouter();
  const { addWorkflow, isReady: dataIsReady, fetchData } = useData(); 
  const { toast } = useToast();

  const form = useForm<WorkflowFormValues>({
    resolver: zodResolver(workflowFormSchema),
    defaultValues: {
      name: '',
      description: '',
      states: [{ 
        id: `temp-${crypto.randomUUID()}`, 
        name: 'New', 
        description: 'Initial state', 
        color: DEFAULT_STATE_COLORS_NEW[0],
        isInitial: true, 
        orderIndex: 0, 
        successorStateNames: [] 
      }],
    },
  });
  
  const onSubmit = async (values: WorkflowFormValues) => {
    const payloadStates = values.states.map((s, index) => ({
      id: s.id?.startsWith('temp-') ? undefined : s.id,
      name: s.name,
      description: s.description,
      color: s.color,
      isInitial: s.isInitial,
      orderIndex: s.orderIndex !== undefined ? s.orderIndex : index, // Ensure orderIndex is passed
      successorStateNames: s.successorStateNames || [],
    }));
    
    const payload = {
      name: values.name,
      description: values.description,
      states: payloadStates,
    };

    try {
      await addWorkflow(payload);
      toast({ title: "Workflow Created", description: `Workflow "${values.name}" has been created.` });
      await fetchData('After Workflow Create'); 
      router.push('/admin/workflows');
    } catch (error: any) {
      let errorMessage = "Failed to create workflow.";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      toast({ variant: "destructive", title: "Error Creating Workflow", description: errorMessage });
    }
  };

  if (!dataIsReady) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading workflow form...</p>
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
          <CardTitle className="text-2xl">Create New Workflow</CardTitle>
          <CardDescription>Define states and transitions for your new workflow.</CardDescription>
        </CardHeader>
        <CardContent className="flex-grow min-h-0">
          <WorkflowForm
            form={form}
            onSubmit={onSubmit}
            onCancel={() => router.push('/admin/workflows')}
            isLoading={form.formState.isSubmitting}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default withAuth(CreateWorkflowPageInternal, ['administrator']);
