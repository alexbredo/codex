

'use client';

import * as React from 'react';
import { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useParams } from 'next/navigation';
import ObjectForm from '@/components/objects/object-form';
import { createObjectFormSchema } from '@/components/objects/object-form-schema';
import { useData } from '@/contexts/data-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { Model, DataObject, Wizard } from '@/lib/types';
import { ArrowLeft, Loader2, ShieldAlert, CheckCircle, ListOrdered, Home, Wand2 } from 'lucide-react';
import { z } from 'zod';
import { withAuth } from '@/contexts/auth-context';
import { getObjectDisplayValue } from '@/lib/utils';
import Link from 'next/link';

interface WizardStepperProps {
  steps: { name: string }[];
  currentStepIndex: number;
}

const WizardStepper = ({ steps, currentStepIndex }: WizardStepperProps) => (
  <div className="flex items-center space-x-4 mb-8">
    {steps.map((step, index) => (
      <React.Fragment key={index}>
        <div className="flex flex-col items-center">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              index === currentStepIndex ? 'bg-primary text-primary-foreground' :
              index < currentStepIndex ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'
            }`}
          >
            {index < currentStepIndex ? <CheckCircle className="h-5 w-5" /> : index + 1}
          </div>
          <p className={`text-xs mt-1 text-center ${index === currentStepIndex ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>{step.name}</p>
        </div>
        {index < steps.length - 1 && <div className="flex-1 h-px bg-border" />}
      </React.Fragment>
    ))}
  </div>
);

const INTERNAL_MAPPING_OBJECT_ID_KEY = "__OBJECT_ID__";

function RunWizardPageInternal() {
  const router = useRouter();
  const params = useParams();
  const wizardId = params.wizardId as string;

  const { getModelById, getWizardById, addObject, isReady, validationRulesets, models: allModels, getAllObjects } = useData();
  const { toast } = useToast();

  const [currentWizard, setCurrentWizard] = useState<Wizard | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [wizardData, setWizardData] = useState<Record<number, any>>({});
  const [createdObjectIds, setCreatedObjectIds] = useState<Record<number, string>>({});
  const [isFinished, setIsFinished] = useState(false);
  const [isSubmittingStep, setIsSubmittingStep] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const currentStep = currentWizard?.steps[currentStepIndex];
  const modelForStep = currentStep ? getModelById(currentStep.modelId) : null;
  
  const allDbObjects = useMemo(() => getAllObjects(), [getAllObjects, isReady]);

  const dynamicSchema = useMemo(() => {
    if (modelForStep && isReady) {
      return createObjectFormSchema(modelForStep, validationRulesets, currentStep?.propertyIds);
    }
    return z.object({});
  }, [modelForStep, isReady, validationRulesets, currentStep]);

  const form = useForm<Record<string, any>>({
    resolver: zodResolver(dynamicSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (isReady && wizardId) {
      const foundWizard = getWizardById(wizardId);
      if (foundWizard) {
        setCurrentWizard(foundWizard);
      } else {
        setPageError(`Wizard with ID ${wizardId} not found.`);
      }
    }
  }, [wizardId, getWizardById, isReady]);

  useEffect(() => {
    const stepData = wizardData[currentStepIndex] || {};
    const newDefaultValues: Record<string, any> = { ...stepData };

    if (currentStep && currentStep.propertyMappings && currentStepIndex > 0) {
      currentStep.propertyMappings.forEach(mapping => {
        const sourceStepData = wizardData[mapping.sourceStepIndex];
        const sourceModel = getModelById(currentWizard?.steps[mapping.sourceStepIndex].modelId || '');
        
        if (sourceStepData && sourceModel) {
          let valueToMap: any;

          if (mapping.sourcePropertyId === INTERNAL_MAPPING_OBJECT_ID_KEY) {
              valueToMap = createdObjectIds[mapping.sourceStepIndex];
          } else {
              const sourceProperty = sourceModel.properties.find(p => p.id === mapping.sourcePropertyId);
              if (sourceProperty) {
                valueToMap = sourceStepData[sourceProperty.name];
              }
          }

          if (valueToMap !== undefined) {
            const targetProperty = modelForStep?.properties.find(p => p.id === mapping.targetPropertyId);
            if (targetProperty) {
              newDefaultValues[targetProperty.name] = valueToMap;
            }
          }
        }
      });
    }

    form.reset(newDefaultValues);
  }, [currentStepIndex, wizardData, form, currentStep, getModelById, currentWizard, modelForStep, createdObjectIds]);

  useEffect(() => {
    form.resolver = zodResolver(dynamicSchema) as any;
  }, [dynamicSchema, form]);

  const onSubmitStep = async (values: Record<string, any>) => {
    setIsSubmittingStep(true);
    const newWizardData = { ...wizardData, [currentStepIndex]: values };
    setWizardData(newWizardData);
    
    try {
        const createdObject = await addObject(modelForStep!.id, values);
        if (createdObject && createdObject.id) {
            setCreatedObjectIds(prev => ({ ...prev, [currentStepIndex]: createdObject.id }));
            
            if (currentStepIndex < currentWizard!.steps.length - 1) {
                setCurrentStepIndex(prev => prev + 1);
            } else {
                setIsFinished(true);
                toast({ title: "Wizard Completed!", description: "All data has been successfully created." });
            }
        } else {
            throw new Error("API did not return a valid object on creation.");
        }
    } catch (error: any) {
        toast({ variant: "destructive", title: `Error on Step ${currentStepIndex + 1}`, description: error.message });
    } finally {
        setIsSubmittingStep(false);
    }
  };
  
  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  const mappedTargetPropertyIds = useMemo(() => {
    if (!currentStep?.propertyMappings) return new Set<string>();
    return new Set(currentStep.propertyMappings.map(m => m.targetPropertyId));
  }, [currentStep]);

  if (!isReady || !currentWizard) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">{pageError ? 'Error' : 'Loading Wizard...'}</p>
        {pageError && <p className="text-destructive mt-2">{pageError}</p>}
      </div>
    );
  }

  if (isFinished) {
    return (
        <div className="container mx-auto max-w-2xl py-12">
            <Card>
                <CardHeader className="text-center">
                    <div className="mx-auto bg-green-100 rounded-full p-4 w-fit">
                        <Wand2 className="h-12 w-12 text-green-600" />
                    </div>
                    <CardTitle className="text-3xl mt-4">Wizard Completed!</CardTitle>
                    <CardDescription>The following data objects were created.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {currentWizard.steps.map((step, index) => {
                        const model = getModelById(step.modelId);
                        const objectId = createdObjectIds[index];
                        const objectData = wizardData[index];
                        if (!model || !objectId || !objectData) return null;

                        return (
                            <Card key={step.id} className="bg-muted/50">
                                <CardHeader className="flex flex-row items-center justify-between p-4">
                                    <div>
                                        <CardTitle className="text-xl">{model.name}</CardTitle>
                                        <CardDescription>Data entered in this step.</CardDescription>
                                    </div>
                                    <Button asChild variant="secondary" size="sm">
                                        <Link href={`/data/${model.id}/view/${objectId}`}>View Full Object</Link>
                                    </Button>
                                </CardHeader>
                                <CardContent className="p-4 pt-0 text-sm space-y-2">
                                    {step.propertyIds.map(propId => {
                                        const propDef = model.properties.find(p => p.id === propId);
                                        if (!propDef) return null;
                                        
                                        const value = objectData[propDef.name];
                                        let displayValue: React.ReactNode = String(value ?? '');

                                        if (value === null || value === undefined || value === '') {
                                          displayValue = <span className="text-muted-foreground italic">Not Set</span>;
                                        } else if (propDef.type === 'relationship' && !Array.isArray(value)) {
                                            const relatedModel = getModelById(propDef.relatedModelId!);
                                            const relatedObj = (allDbObjects[propDef.relatedModelId!] || []).find(o => o.id === value);
                                            displayValue = getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects);
                                        } else if (propDef.type === 'boolean') {
                                            displayValue = value ? 'Yes' : 'No';
                                        }

                                        return (
                                            <div key={propId} className="flex justify-between border-b pb-1 last:border-b-0">
                                                <span className="font-medium text-muted-foreground">{propDef.name}:</span>
                                                <span className="text-right truncate pl-4" title={String(value)}>
                                                  {displayValue}
                                                </span>
                                            </div>
                                        );
                                    })}
                                    {step.propertyIds.length === 0 && <p className="text-xs text-muted-foreground italic text-center">No fields were configured for this step.</p>}
                                </CardContent>
                            </Card>
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

  if (!modelForStep) {
    return (
      <div className="container mx-auto py-8 text-center">
        <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-2xl font-semibold text-destructive mb-2">Configuration Error</h2>
        <p className="text-muted-foreground mb-4">The model for this step could not be found. Please check the wizard configuration.</p>
        <Button onClick={() => router.push('/admin/wizards')} className="mt-4">Back to Wizard Admin</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <Button variant="outline" onClick={() => router.push('/admin/wizards')} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> Exit Wizard
      </Button>
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl">{currentWizard.name}</CardTitle>
          <CardDescription>Please follow the steps to complete the process.</CardDescription>
          <div className="pt-4">
            <WizardStepper steps={currentWizard.steps.map(s => ({name: getModelById(s.modelId)?.name || `Step ${s.orderIndex + 1}`}))} currentStepIndex={currentStepIndex} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="p-4 mb-4 bg-muted/70 border rounded-lg">
            <h4 className="font-semibold text-lg mb-1">{modelForStep.name}</h4>
            <p className="text-sm text-muted-foreground">{currentStep?.instructions || `Please fill out the fields for the ${modelForStep.name}.`}</p>
          </div>
          <ObjectForm
            key={currentStepIndex}
            form={form}
            model={modelForStep}
            onSubmit={onSubmitStep}
            onCancel={() => {}}
            isLoading={isSubmittingStep}
            propertyIdsToShow={currentStep?.propertyIds}
            hiddenPropertyIds={Array.from(mappedTargetPropertyIds)}
            hideFooter={true}
          />
        </CardContent>
        <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={handleBack} disabled={currentStepIndex === 0 || isSubmittingStep}>
                Back
            </Button>
            <Button onClick={form.handleSubmit(onSubmitStep)} disabled={isSubmittingStep}>
                {isSubmittingStep && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                {currentStepIndex === currentWizard.steps.length - 1 ? 'Finish' : 'Next'}
            </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default withAuth(RunWizardPageInternal, 'any');
