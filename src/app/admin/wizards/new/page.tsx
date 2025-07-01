

'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import WizardForm from '@/components/wizards/wizard-form';
import type { WizardFormValues } from '@/components/wizards/wizard-form-schema';
import { wizardFormSchema } from '@/components/wizards/wizard-form-schema';
import { useData } from '@/contexts/data-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { withAuth } from '@/contexts/auth-context';

function CreateWizardPageInternal() {
  const router = useRouter();
  const { addWizard, isReady: dataIsReady, getWizardByName } = useData(); 
  const { toast } = useToast();

  const form = useForm<WizardFormValues>({
    resolver: zodResolver(wizardFormSchema),
    defaultValues: {
      name: '',
      description: '',
      steps: [],
    },
  });
  
  const onSubmit = async (values: WizardFormValues) => {
    if (getWizardByName(values.name)) {
      form.setError('name', { message: 'A wizard with this name already exists.' });
      return;
    }
    
    try {
      await addWizard(values);
      toast({ title: "Wizard Created", description: `Wizard "${values.name}" has been created.` });
      router.push('/admin/wizards');
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error Creating Wizard", description: error.message });
    }
  };

  if (!dataIsReady) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading wizard form...</p>
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
          <CardTitle className="text-2xl">Create New Wizard</CardTitle>
          <CardDescription>Define the steps and forms for your new guided wizard.</CardDescription>
        </CardHeader>
        <CardContent className="flex-grow min-h-0">
          <WizardForm
            form={form}
            onSubmit={onSubmit}
            onCancel={() => router.push('/admin/wizards')}
            isLoading={form.formState.isSubmitting}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default withAuth(CreateWizardPageInternal, 'admin:manage_wizards');
