

'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useParams } from 'next/navigation';
import WizardForm from '@/components/wizards/wizard-form';
import type { WizardFormValues } from '@/components/wizards/wizard-form-schema';
import { wizardFormSchema } from '@/components/wizards/wizard-form-schema';
import { useData } from '@/contexts/data-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Wizard } from '@/lib/types';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { withAuth } from '@/contexts/auth-context';

function mapWizardToFormValues(wizard?: Wizard): WizardFormValues {
  if (!wizard) {
    return { name: '', description: '', steps: [] };
  }
  return {
    name: wizard.name,
    description: wizard.description || '',
    steps: wizard.steps.map(step => ({
        id: step.id,
        modelId: step.modelId,
        stepType: step.stepType || 'create',
        instructions: step.instructions || '',
        propertyIds: step.propertyIds || [],
        orderIndex: step.orderIndex,
        propertyMappings: step.propertyMappings || [],
    })),
  };
}

function EditWizardPageInternal() {
  const router = useRouter();
  const params = useParams();
  const wizardId = params.wizardId as string;

  const { getWizardById, updateWizard, isReady: dataIsReady, fetchData, getWizardByName } = useData(); 
  const { toast } = useToast();

  const [currentWizard, setCurrentWizard] = React.useState<Wizard | null>(null);
  const [isLoadingData, setIsLoadingData] = React.useState(true);

  const form = useForm<WizardFormValues>({
    resolver: zodResolver(wizardFormSchema),
    defaultValues: mapWizardToFormValues(), 
  });
  
  React.useEffect(() => {
    if (dataIsReady && wizardId) {
      const foundWizard = getWizardById(wizardId);
      if (foundWizard) {
        setCurrentWizard(foundWizard);
        form.reset(mapWizardToFormValues(foundWizard));
      } else {
        toast({ variant: "destructive", title: "Error", description: `Wizard with ID ${wizardId} not found.` });
        router.push('/admin/wizards');
      }
      setIsLoadingData(false);
    }
  }, [wizardId, getWizardById, dataIsReady, form, router, toast]);

  const onSubmit = async (values: WizardFormValues) => {
    if (!currentWizard) return;
    
    const existingByName = getWizardByName(values.name);
    if (existingByName && existingByName.id !== wizardId) {
        form.setError('name', { message: 'A wizard with this name already exists.' });
        return;
    }

    try {
      await updateWizard(currentWizard.id, values);
      toast({ title: "Wizard Updated", description: `Wizard "${values.name}" has been updated.` });
      await fetchData('After Wizard Update'); 
      router.push('/admin/wizards');
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error Updating Wizard", description: error.message });
    }
  };

  if (!dataIsReady || isLoadingData) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading wizard details...</p>
      </div>
    );
  }

  if (!currentWizard) {
     return (
      <div className="flex flex-col justify-center items-center h-screen">
        <p className="text-lg text-destructive">Wizard not found.</p>
        <Button onClick={() => router.push(`/admin/wizards`)} className="mt-4">Back to Wizard Admin</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 flex flex-col h-full">
      <Button variant="outline" onClick={() => router.push('/admin/wizards')} className="mb-6 flex-shrink-0 self-start">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Wizard Admin
      </Button>
      <Card className="max-w-4xl mx-auto flex-grow min-h-0 flex flex-col w-full">
        <CardHeader className="flex-shrink-0">
          <CardTitle className="text-2xl">Edit Wizard: {currentWizard.name}</CardTitle>
          <CardDescription>Update details for the "{currentWizard.name}" wizard.</CardDescription>
        </CardHeader>
        <CardContent className="flex-grow min-h-0">
          <WizardForm
            form={form}
            onSubmit={onSubmit}
            onCancel={() => router.push('/admin/wizards')}
            isLoading={form.formState.isSubmitting}
            isEditing
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default withAuth(EditWizardPageInternal, 'admin:manage_wizards');
