
'use client';

import { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useParams } from 'next/navigation';
import ModelForm from '@/components/models/model-form';
import type { ModelFormValues, PropertyFormValues } from '@/components/models/model-form-schema';
import { modelFormSchema } from '@/components/models/model-form-schema';
import { useData } from '@/contexts/data-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Model, Property } from '@/lib/types';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { withAuth } from '@/contexts/auth-context';

const INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE = "__DEFAULT_DISPLAY_PROPERTY__";
const INTERNAL_NO_WORKFLOW_VALUE = "__NO_WORKFLOW_SELECTED__";


function EditModelPageInternal() {
  const router = useRouter();
  const params = useParams();
  const modelId = params.modelId as string;
  const { getModelById, updateModel, getModelByName, isReady, fetchData } = useData();
  const { toast } = useToast();
  const [currentModel, setCurrentModel] = useState<Model | null>(null);
  const [isLoadingModel, setIsLoadingModel] = useState(true);
  const pageInitializedForCurrentModelIdRef = useRef<string | null>(null);

  const form = useForm<ModelFormValues>({
    resolver: zodResolver(modelFormSchema),
  });
  
  useEffect(() => {
    if (!modelId) return;

    if (pageInitializedForCurrentModelIdRef.current !== modelId) {
        setIsLoadingModel(true);
        setCurrentModel(null);
        fetchData(`Navigated to Edit Model: ${modelId}`);
    }
  }, [modelId, fetchData]);

  useEffect(() => {
    if (isReady && modelId && isLoadingModel) {
      const foundModel = getModelById(modelId);
      if (foundModel) {
        setCurrentModel(foundModel);
        const sortedProperties = [...foundModel.properties].sort((a, b) => a.orderIndex - b.orderIndex);
        form.reset({
          name: foundModel.name,
          description: foundModel.description || '',
          modelGroupId: foundModel.modelGroupId,
          displayPropertyNames: foundModel.displayPropertyNames || [],
          workflowId: foundModel.workflowId || null,
          properties: sortedProperties.map(p => ({
            id: p.id || crypto.randomUUID(),
            name: p.name,
            type: p.type,
            relatedModelId: p.type === 'relationship' ? p.relatedModelId : undefined,
            required: !!p.required,
            relationshipType: p.type === 'relationship' ? (p.relationshipType || 'one') : undefined,
            unit: p.type === 'number' ? p.unit : undefined,
            precision: p.type === 'number' ? (p.precision === undefined || p.precision === null ? 2 : p.precision) : undefined,
            autoSetOnCreate: p.type === 'date' ? !!p.autoSetOnCreate : false,
            autoSetOnUpdate: p.type === 'date' ? !!p.autoSetOnUpdate : false,
            isUnique: p.type === 'string' ? !!p.isUnique : false,
            defaultValue: p.defaultValue ?? '',
            orderIndex: p.orderIndex,
            validationRulesetId: p.validationRulesetId ?? null,
            minValue: p.type === 'number' ? (p.minValue === undefined || p.minValue === null ? null : Number(p.minValue)) : null,
            maxValue: p.type === 'number' ? (p.maxValue === undefined || p.maxValue === null ? null : Number(p.maxValue)) : null,
          } as PropertyFormValues)),
        });
        setIsLoadingModel(false);
        pageInitializedForCurrentModelIdRef.current = modelId;
      }
    } else if (isReady && modelId && !isLoadingModel && !getModelById(modelId)) {
      toast({ variant: "destructive", title: "Error", description: `Model with ID ${modelId} could not be found.` });
      router.push('/models');
    }
  }, [modelId, isReady, isLoadingModel, getModelById, form, router, toast]);

  const onSubmit = async (values: ModelFormValues) => {
    if (!currentModel) return;

    const existingByName = getModelByName(values.name);
    if (existingByName && existingByName.id !== currentModel.id) {
        form.setError("name", { type: "manual", message: "A model with this name already exists." });
        return;
    }

    const modelData = {
      name: values.name,
      description: values.description,
      modelGroupId: values.modelGroupId,
      displayPropertyNames: values.displayPropertyNames?.filter(name => name !== INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE),
      workflowId: values.workflowId === INTERNAL_NO_WORKFLOW_VALUE ? null : values.workflowId,
      properties: values.properties.map((p_form_value, index) => {
        const propertyForApi: Property = {
          ...p_form_value,
          id: p_form_value.id || crypto.randomUUID(),
          model_id: currentModel.id,
          orderIndex: index,
          required: !!p_form_value.required,
          autoSetOnCreate: !!p_form_value.autoSetOnCreate,
          autoSetOnUpdate: !!p_form_value.autoSetOnUpdate,
          isUnique: !!p_form_value.isUnique,
          defaultValue: p_form_value.defaultValue ?? undefined,
          relatedModelId: p_form_value.type === 'relationship' ? p_form_value.relatedModelId : undefined,
          relationshipType: p_form_value.type === 'relationship' ? (p_form_value.relationshipType || 'one') : undefined,
          unit: p_form_value.type === 'number' ? p_form_value.unit : undefined,
          precision: p_form_value.type === 'number' ? (p_form_value.precision === undefined || p_form_value.precision === null ? 2 : Number(p_form_value.precision)) : undefined,
          validationRulesetId: p_form_value.type === 'string' ? (p_form_value.validationRulesetId || null) : null,
          minValue: p_form_value.type === 'number' ? (p_form_value.minValue === undefined || p_form_value.minValue === null || isNaN(Number(p_form_value.minValue)) ? null : Number(p_form_value.minValue)) : null,
          maxValue: p_form_value.type === 'number' ? (p_form_value.maxValue === undefined || p_form_value.maxValue === null || isNaN(Number(p_form_value.maxValue)) ? null : Number(p_form_value.maxValue)) : null,
        };
        return propertyForApi;
      }),
    };
    
    try {
      const updatedModel = await updateModel(currentModel.id, modelData);
      if (updatedModel) {
        toast({ title: "Model Updated", description: `Model "${updatedModel.name}" has been successfully updated.` });
        router.push('/models');
      } else {
        throw new Error("Update operation did not return the updated model.");
      }
    } catch (error: any) {
      console.error("Error updating model:", error);
      toast({ variant: "destructive", title: "Error updating model", description: error.message || "An unknown error occurred." });
    }
  };

  if (isLoadingModel) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading model details...</p>
      </div>
    );
  }

  if (!currentModel && !isLoadingModel) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
         <p className="text-lg text-destructive">Model not found.</p>
         <Button onClick={() => router.push('/models')} className="mt-4">Go to Models</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <Button variant="outline" onClick={() => router.push('/models')} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Model Admin
      </Button>
      {currentModel && (
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl">Edit Model: {currentModel.name}</CardTitle>
            <CardDescription>Update the details for the "{currentModel.name}" model.</CardDescription>
          </CardHeader>
          <CardContent>
            <ModelForm
              form={form}
              onSubmit={onSubmit}
              onCancel={() => router.push('/models')}
              existingModel={currentModel}
              isLoading={form.formState.isSubmitting}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default withAuth(EditModelPageInternal, 'models:manage');
