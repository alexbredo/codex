
'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { useData } from '@/contexts/data-context';
import type { WizardRunState, WizardStepFormValues, Model } from '@/lib/types';
import { createObjectFormSchema } from '@/components/objects/object-form-schema';
import ObjectForm from '@/components/objects/object-form';
import { getObjectDisplayValue } from '@/lib/utils';
import { withAuth } from '@/contexts/auth-context';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Loader2, ShieldAlert, CheckCircle, ListOrdered, Home, Wand2, ArrowLeft, ArrowRight, ChevronsUpDown } from 'lucide-react';
import { z } from 'zod';
import Link from 'next/link';
import { Form } from '@/components/ui/form';

async function fetchWizardRunState(runId: string): Promise<WizardRunState> {
  const response = await fetch(`/api/codex-structure/wizards/run/${runId}`);
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to fetch wizard run state.');
  }
  return response.json();
}

async function submitWizardStep({ runId, stepIndex, stepType, formData, lookupObjectId }: {
  runId: string;
  stepIndex: number;
  stepType: 'create' | 'lookup';
  formData?: Record<string, any>;
  lookupObjectId?: string;
}) {
  const response = await fetch(`/api/codex-structure/wizards/run/${runId}/step`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stepIndex, stepType, formData, lookupObjectId }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to submit step.');
  }
  return response.json();
}

interface StepperProps {
  steps: { name: string }[];
  currentStepIndex: number;
}
const WizardStepper = ({ steps, currentStepIndex }: StepperProps) => (
  <div className="flex items-center space-x-4 mb-8">
    {steps.map((step, index) => (
      <React.Fragment key={index}>
        <div className="flex flex-col items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${index === currentStepIndex ? 'bg-primary text-primary-foreground' : index < currentStepIndex ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'}`}>
            {index < currentStepIndex ? <CheckCircle className="h-5 w-5" /> : index + 1}
          </div>
          <p className={`text-xs mt-1 text-center ${index === currentStepIndex ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>{step.name}</p>
        </div>
        {index < steps.length - 1 && <div className="flex-1 h-px bg-border" />}
      </React.Fragment>
    ))}
  </div>
);

function RunWizardPageInternal() {
  const router = useRouter();
  const params = useParams();
  const runId = params.runId as string;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { getModelById, validationRulesets, getObjectsByModelId, models: allModels, getAllObjects, isReady: dataContextIsReady } = useData();
  
  const [currentStepIndex, setCurrentStepIndex] = React.useState(0);
  const [isFinishing, setIsFinishing] = React.useState(false);
  
  const [selectedLookupId, setSelectedLookupId] = React.useState<string>('');
  const [isLookupPopoverOpen, setIsLookupPopoverOpen] = React.useState(false);

  const { data: runState, isLoading, error } = useQuery<WizardRunState>({
    queryKey: ['wizardRun', runId],
    queryFn: () => fetchWizardRunState(runId),
    enabled: !!runId && dataContextIsReady,
  });
  
  const stepMutation = useMutation({
    mutationFn: submitWizardStep,
    onSuccess: (data) => {
      if (data.isFinalStep) {
        setIsFinishing(true);
      } else {
        queryClient.invalidateQueries({ queryKey: ['wizardRun', runId] });
      }
    },
    onError: (err: Error) => {
      toast({ variant: 'destructive', title: `Error on Step ${currentStepIndex + 1}`, description: err.message });
    }
  });
  
  React.useEffect(() => {
    if (runState) {
        const lastCompletedStep = runState.currentStepIndex;
        const nextStep = lastCompletedStep + 1;
        if (nextStep < runState.wizard.steps.length) {
            setCurrentStepIndex(nextStep);
        } else if (runState.status === 'COMPLETED' || nextStep >= runState.wizard.steps.length) {
            setIsFinishing(true);
        }
    }
  }, [runState]);
  
  const currentStep = runState?.wizard.steps[currentStepIndex];
  const modelForStep = currentStep ? getModelById(currentStep.modelId) : null;
  const allDbObjects = React.useMemo(() => getAllObjects(), [getAllObjects, dataContextIsReady]);

  const dynamicSchema = React.useMemo(() => {
    if (modelForStep && currentStep?.stepType === 'create') {
      return createObjectFormSchema(modelForStep, validationRulesets, currentStep.propertyIds);
    }
    return z.object({});
  }, [modelForStep, validationRulesets, currentStep]);

  const form = useForm<Record<string, any>>({ resolver: zodResolver(dynamicSchema), defaultValues: {} });
  
  React.useEffect(() => {
    form.reset({});
    if (runState && currentStep) {
        const existingDataForStep = runState.stepData[currentStepIndex];
        if (existingDataForStep) {
            form.reset(existingDataForStep.formData);
            if(currentStep.stepType === 'lookup') {
                setSelectedLookupId(existingDataForStep.objectId || '');
            }
        }
    }
  }, [currentStepIndex, runState, form, currentStep]);
  
  React.useEffect(() => { form.resolver = zodResolver(dynamicSchema) as any; }, [dynamicSchema, form]);

  const handleNextStep = async (values: Record<string, any>) => {
    if (currentStep?.stepType === 'create') {
        await stepMutation.mutateAsync({ runId, stepIndex: currentStepIndex, stepType: 'create', formData: values });
    } else if (currentStep?.stepType === 'lookup') {
        if (!selectedLookupId) {
             toast({ title: "Selection Required", description: "Please select an item to continue.", variant: "destructive" });
             return;
        }
        await stepMutation.mutateAsync({ runId, stepIndex: currentStepIndex, stepType: 'lookup', lookupObjectId: selectedLookupId });
    }
  };
  
  const onInvalid = (errors: FieldErrors<Record<string, any>>) => {
    const errorMessages = Object.entries(errors).map(([fieldName, error]) => {
        const message = (error as any)?.message;
        if (message) return `${fieldName}: ${message}`;
        return null;
    }).filter(Boolean).join('; ');
    
    toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: `Please fix the following errors: ${errorMessages.substring(0, 150)}`
    });
  };

  if (isLoading || !dataContextIsReady) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading wizard state...</p>
      </div>
    );
  }

  if (error || !runState) {
    return (
       <div className="container mx-auto py-8 text-center">
          <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-destructive mb-2">Could Not Load Wizard Run</h2>
          <p className="text-muted-foreground mb-4">{error?.message || "The wizard run data could not be found."}</p>
        </div>
    );
  }
  
  const { wizard } = runState;
  const isFinalStep = currentStepIndex === wizard.steps.length - 1;

  if (isFinishing || runState.status === 'COMPLETED') {
    return (
        <div className="container mx-auto max-w-2xl py-12">
            <Card><CardHeader className="text-center">
                <div className="mx-auto bg-green-100 rounded-full p-4 w-fit"><Wand2 className="h-12 w-12 text-green-600" /></div>
                <CardTitle className="text-3xl mt-4">Wizard Completed!</CardTitle>
                <CardDescription>All data has been successfully created.</CardDescription>
            </CardHeader><CardFooter className="flex justify-center gap-4">
                <Button onClick={() => router.push('/')}><Home className="mr-2 h-4 w-4"/> Go to Dashboard</Button>
                <Button variant="secondary" onClick={() => router.push('/admin/wizards')}><ListOrdered className="mr-2 h-4 w-4"/> Back to Wizards</Button>
            </CardFooter></Card>
        </div>
    );
  }
  
  if (!modelForStep) {
    return (
        <div className="container mx-auto py-8 text-center">
            <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-destructive mb-2">Configuration Error</h2>
            <p className="text-muted-foreground mb-4">The model for the current step could not be found.</p>
        </div>
    );
  }
  
  return (
    <div className="container mx-auto py-8">
        <Button variant="outline" onClick={() => router.push('/admin/wizards')} className="mb-6"><ArrowLeft className="mr-2 h-4 w-4" /> Exit Wizard</Button>
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleNextStep, onInvalid)}>
                <Card className="max-w-2xl mx-auto">
                    <CardHeader>
                        <CardTitle className="text-2xl">{wizard.name}</CardTitle>
                        <CardDescription>Please follow the steps to complete the process.</CardDescription>
                        <div className="pt-4">
                            <WizardStepper 
                                steps={wizard.steps.map(s => ({name: getModelById(s.modelId)?.name || `Step ${s.orderIndex + 1}`}))} 
                                currentStepIndex={currentStepIndex} 
                            />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="p-4 mb-4 bg-muted/70 border rounded-lg">
                            <h4 className="font-semibold text-lg mb-1">{modelForStep.name}</h4>
                            <p className="text-sm text-muted-foreground">{currentStep?.instructions || `Please fill out the fields for the ${modelForStep.name}.`}</p>
                        </div>
                        {currentStep?.stepType === 'create' ? (
                            <ObjectForm 
                                key={currentStepIndex} 
                                form={form} 
                                model={modelForStep}
                                onSubmit={() => {}}
                                onCancel={() => {}}
                                isLoading={stepMutation.isPending} 
                                propertyIdsToShow={currentStep?.propertyIds} 
                            />
                        ) : (
                            <div className="space-y-4">
                                <Popover open={isLookupPopoverOpen} onOpenChange={setIsLookupPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" role="combobox" aria-expanded={isLookupPopoverOpen} className="w-full justify-between">
                                            <span className="truncate">{selectedLookupId ? getObjectDisplayValue(getObjectsByModelId(modelForStep.id).find(o=>o.id === selectedLookupId), modelForStep, allModels, allDbObjects) : `Select a ${modelForStep.name}...`}</span>
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger><PopoverContent className="w-[--radix-popover-trigger-width] p-0"><Command>
                                        <CommandInput placeholder={`Search ${modelForStep.name}...`} /><CommandEmpty>No {modelForStep.name.toLowerCase()} found.</CommandEmpty><CommandGroup><CommandList>
                                            {getObjectsByModelId(modelForStep.id).map(obj => (
                                                <CommandItem key={obj.id} value={getObjectDisplayValue(obj, modelForStep, allModels, allDbObjects)} onSelect={() => { setSelectedLookupId(obj.id); setIsLookupPopoverOpen(false); }}>
                                                    <CheckCircle className={`mr-2 h-4 w-4 ${selectedLookupId === obj.id ? "opacity-100" : "opacity-0"}`} />
                                                    {getObjectDisplayValue(obj, modelForStep, allModels, allDbObjects)}
                                                </CommandItem>
                                            ))}
                                        </CommandList></CommandGroup></Command>
                                </PopoverContent></Popover>
                            </div>
                        )}
                    </CardContent>
                    <CardFooter className="flex justify-between">
                        <Button type="button" variant="outline" onClick={() => setCurrentStepIndex(p => p - 1)} disabled={currentStepIndex === 0 || stepMutation.isPending}>Back</Button>
                        <Button
                          type="submit"
                          disabled={stepMutation.isPending}
                        >
                          {stepMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                          {isFinalStep ? 'Finish' : 'Next'} <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    </CardFooter>
                </Card>
            </form>
        </Form>
    </div>
  );
}

export default withAuth(RunWizardPageInternal);
