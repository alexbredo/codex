
'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useForm, type FieldErrors, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { useData } from '@/contexts/data-context';
import type { WizardRunState, Model } from '@/lib/types';
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

async function fetchWizardRunState(runId: string): Promise<WizardRunState> {
  const response = await fetch(`/api/codex-structure/wizards/run/${runId}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Failed to fetch wizard run state" }));
    throw new Error(errorData.error || 'Failed to fetch wizard run state');
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
    // Prioritize the detailed message from the backend.
    throw new Error(errorData.details || errorData.error || 'Failed to submit step.');
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
  const { getModelById, validationRulesets, getObjectsByModelId, models: allModels, getAllObjects, isReady: dataContextIsReady, fetchData: refreshDataContext } = useData();
  
  const [isFinishing, setIsFinishing] = React.useState(false);
  const [selectedLookupId, setSelectedLookupId] = React.useState<string>('');
  const [isLookupPopoverOpen, setIsLookupPopoverOpen] = React.useState(false);

  const { data: runState, isLoading, error, refetch } = useQuery<WizardRunState>({
    queryKey: ['wizardRun', runId],
    queryFn: () => fetchWizardRunState(runId),
    enabled: !!runId && dataContextIsReady,
  });

  const stepMutation = useMutation({
    mutationFn: submitWizardStep,
    onSuccess: async (result) => {
        if (result.isFinalStep) {
            await refreshDataContext('Wizard Completed');
            await refetch();
            setIsFinishing(true);
        } else {
            await refetch();
        }
    },
    onError: (err: Error) => {
        const currentStepIndexOnError = runState ? runState.currentStepIndex + 1 : 0;
        toast({ variant: 'destructive', title: `Error on Step ${currentStepIndexOnError + 1}`, description: err.message });
    }
  });

  const currentStepIndex = React.useMemo(() => {
    if (!runState || runState.status === 'COMPLETED') return -1;
    return runState.currentStepIndex + 1;
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

  const form: UseFormReturn<Record<string, any>> = useForm<Record<string, any>>({ resolver: zodResolver(dynamicSchema), defaultValues: {} });
  
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
  
  const handleNextStep = (values?: Record<string, any>) => {
    const stepType = currentStep?.stepType;
    let payload: Parameters<typeof submitWizardStep>[0];

    if (stepType === 'create' && values) {
        payload = { runId, stepIndex: currentStepIndex, stepType: 'create', formData: values };
    } else if (stepType === 'lookup') {
        if (!selectedLookupId) {
             toast({ title: "Selection Required", description: "Please select an item to continue.", variant: "destructive" });
             return;
        }
        payload = { runId, stepIndex: currentStepIndex, stepType: 'lookup', lookupObjectId: selectedLookupId };
    } else {
        return; // Should not happen
    }
    
    // Use the mutate function, and handle success/error via the useMutation callbacks
    stepMutation.mutate(payload);
  };


  const hiddenPropertyIds = React.useMemo(() => {
    if (!currentStep?.propertyMappings) return [];
    return currentStep.propertyMappings.map(m => m.targetPropertyId);
  }, [currentStep]);

  if (isLoading || !dataContextIsReady) {
    return (
      <div className="container mx-auto py-8 flex flex-col items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading wizard state...</p>
      </div>
    );
  }

  if (error) {
    return (
       <div className="container mx-auto py-8 text-center">
          <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-destructive mb-2">Could Not Load Wizard Run</h2>
          <p className="text-muted-foreground mb-4">{error?.message || "The wizard run data could not be found."}</p>
        </div>
    );
  }
  
  if (!runState) {
    return (
      <div className="container mx-auto py-8 text-center">
        <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-2xl font-semibold text-destructive mb-2">Could Not Load Wizard Run</h2>
        <p className="text-muted-foreground mb-4">The wizard run data could not be found.</p>
      </div>
    );
  }

  const { wizard, stepData: finalStepData } = runState;
  
  if (isFinishing || runState.status === 'COMPLETED') {
    return (
        <div className="container mx-auto max-w-2xl py-12">
            <Card>
                <CardHeader className="text-center">
                    <div className="mx-auto bg-green-100 rounded-full p-4 w-fit"><Wand2 className="h-12 w-12 text-green-600" /></div>
                    <CardTitle className="text-3xl mt-4">Wizard Completed!</CardTitle>
                    <CardDescription>All data has been successfully created.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <h3 className="text-lg font-semibold text-center">Summary of Created/Referenced Data</h3>
                    {wizard.steps.map((step, index) => {
                        const model = getModelById(step.modelId);
                        const dataForStep = finalStepData[index];
                        if (!model || !dataForStep) return null;

                        let summaryContent: React.ReactNode;
                        if (dataForStep.stepType === 'lookup' && dataForStep.objectId) {
                            const lookedUpObject = getObjectsByModelId(step.modelId).find(o => o.id === dataForStep.objectId);
                            summaryContent = (
                                <p className="text-sm">
                                    Selected: <span className="font-semibold text-primary">{getObjectDisplayValue(lookedUpObject, model, allModels, allDbObjects)}</span>
                                </p>
                            );
                        } else {
                            summaryContent = (
                                <div className="mt-2 space-y-1 text-sm">
                                    {Object.entries(dataForStep.formData || {}).map(([key, value]) => {
                                        const propDef = model.properties.find(p => p.name === key);
                                        let displayValue = String(value);

                                        if (propDef && propDef.type === 'relationship' && propDef.relatedModelId) {
                                            const relatedModel = getModelById(propDef.relatedModelId);
                                            if (relatedModel) {
                                                if (propDef.relationshipType === 'many' && Array.isArray(value)) {
                                                    displayValue = value.map(id => getObjectDisplayValue(getObjectsByModelId(propDef!.relatedModelId!).find(o => o.id === id), relatedModel, allModels, allDbObjects)).join(', ');
                                                } else if (typeof value === 'string') {
                                                    displayValue = getObjectDisplayValue(getObjectsByModelId(propDef.relatedModelId).find(o => o.id === value), relatedModel, allModels, allDbObjects);
                                                }
                                            }
                                        }
                                        
                                        return (
                                            <div key={key} className="grid grid-cols-3 gap-2">
                                                <span className="font-medium text-muted-foreground col-span-1">{key}</span>
                                                <span className="col-span-2">{displayValue}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        }

                        return (
                            <div key={step.id} className="border p-4 rounded-lg bg-muted/50">
                            <h4 className="font-bold text-primary">{model.name} <span className="text-sm text-muted-foreground font-normal">({dataForStep.stepType})</span></h4>
                            {summaryContent}
                            </div>
                        );
                    })}
                </CardContent>
                <CardFooter className="flex justify-center gap-4">
                    <Button onClick={() => router.push('/')}><Home className="mr-2 h-4 w-4"/> Go to Dashboard</Button>
                    <Button variant="secondary" onClick={() => router.push('/admin/wizards')}><ListOrdered className="mr-2 h-4 w-4"/> Back to Wizards</Button>
                </CardFooter>
            </Card>
        </div>
    );
  }
  
  if (!modelForStep || !currentStep) {
    return (
        <div className="container mx-auto py-8 text-center">
            <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-destructive mb-2">Configuration Error</h2>
            <p className="text-muted-foreground mb-4">The model for the current step ({currentStepIndex + 1}) could not be found.</p>
        </div>
    );
  }
  
  const isFinalStep = currentStepIndex === wizard.steps.length - 1;
  
  return (
    <div className="container mx-auto py-8">
        <Button variant="outline" onClick={() => router.push('/admin/wizards')} className="mb-6"><ArrowLeft className="mr-2 h-4 w-4" /> Exit Wizard</Button>
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
                    <p className="text-sm text-muted-foreground">{currentStep.instructions || `Please fill out the fields for the ${modelForStep.name}.`}</p>
                </div>
                {currentStep.stepType === 'create' ? (
                     <ObjectForm
                        form={form}
                        model={modelForStep}
                        onCancel={() => {}} 
                        onSubmit={async () => {}} 
                        propertyIdsToShow={currentStep.propertyIds}
                        hiddenPropertyIds={hiddenPropertyIds}
                        showSubmitButtons={false}
                    />
                ) : (
                    <div className="space-y-4">
                        <Popover open={isLookupPopoverOpen} onOpenChange={setIsLookupPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button type="button" variant="outline" role="combobox" aria-expanded={isLookupPopoverOpen} className="w-full justify-between">
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
                <Button type="button" variant="outline" onClick={() => {
                }} disabled={true}>Back</Button>
                <Button
                    type="button"
                    disabled={stepMutation.isPending}
                    onClick={() => {
                        if (currentStep.stepType === 'lookup') {
                            handleNextStep();
                        } else {
                            form.handleSubmit(handleNextStep)();
                        }
                    }}
                >
                    {stepMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                    {isFinalStep ? 'Finish' : 'Next'} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
            </CardFooter>
        </Card>
    </div>
  );
}

export default withAuth(RunWizardPageInternal);
    