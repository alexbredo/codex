
'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import ModelForm from '@/components/models/model-form';
import type { ModelFormValues, PropertyFormValues } from '@/components/models/model-form-schema';
import { modelFormSchema } from '@/components/models/model-form-schema';
import { useData } from '@/contexts/data-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import type { Property } from '@/lib/types';
import { withAuth } from '@/contexts/auth-context';

const INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE = "__DEFAULT_DISPLAY_PROPERTY__";
const INTERNAL_NO_WORKFLOW_VALUE = "__NO_WORKFLOW_SELECTED__";
const INTERNAL_DEFAULT_GROUP_ID = "00000000-0000-0000-0000-000000000001";

function CreateModelPageInternal() {
  const router = useRouter();
  const { addModel, getModelByName, isReady } = useData();
  const { toast } = useToast();

  const form = useForm<ModelFormValues>({
    resolver: zodResolver(modelFormSchema),
    defaultValues: {
      name: '',
      description: '',
      modelGroupId: null, // Let the form component default this visually
      displayPropertyNames: [],
      workflowId: null,
      properties: [{
        id: crypto.randomUUID(),
        name: '',
        type: 'string',
        required: false,
        relationshipType: 'one',
        unit: undefined,
        precision: undefined,
        autoSetOnCreate: false,
        autoSetOnUpdate: false,
        isUnique: false,
        defaultValue: undefined,
        validationRulesetId: null,
        orderIndex: 0,
      } as PropertyFormValues],
    },
  });


  const onSubmit = async (values: ModelFormValues) => {
    const existingByName = getModelByName(values.name);
    if (existingByName) {
        form.setError("name", { type: "manual", message: "A model with this name already exists." });
        return;
    }

    const modelData = {
      name: values.name,
      description: values.description,
      modelGroupId: values.modelGroupId || null, // Ensure null is passed if undefined
      displayPropertyNames: values.displayPropertyNames?.filter(name => name !== INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE),
      workflowId: values.workflowId === INTERNAL_NO_WORKFLOW_VALUE ? null : values.workflowId,
      properties: values.properties.map((p_form_value, index) => {
        const propertyForApi: Property = {
          ...p_form_value, // Spread all fields from form
          id: p_form_value.id || crypto.randomUUID(),
          model_id: '', // Will be set on the backend, not needed here
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
          validationRulesetId: p_form_value.type === 'string' ? (p_form_value.validationRulesetId) : null,
          minValue: p_form_value.type === 'number' ? (p_form_value.minValue === undefined || p_form_value.minValue === null || isNaN(Number(p_form_value.minValue)) ? null : Number(p_form_value.minValue)) : null,
          maxValue: p_form_value.type === 'number' ? (p_form_value.maxValue === undefined || p_form_value.maxValue === null || isNaN(Number(p_form_value.maxValue)) ? null : Number(p_form_value.maxValue)) : null,
        };
        return propertyForApi;
      }),
    };

    try {
      const newModel = await addModel(modelData);
      if (newModel) {
        toast({ title: "Model Created", description: `Model "${newModel.name}" has been successfully created.` });
        router.push('/models');
      } else {
        throw new Error("Model creation did not return the new model.");
      }
    } catch (error: any) {
      console.error("Error creating model:", error);
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to create model." });
    }
  };

  if (!isReady) {
    return <div className="flex justify-center items-center h-screen"><p>Loading...</p></div>;
  }

  return (
    <div className="container mx-auto py-8">
      <Button variant="outline" onClick={() => router.push('/models')} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Model Admin
      </Button>
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl">Create New Model</CardTitle>
          <CardDescription>Define a new data model structure for your application.</CardDescription>
        </CardHeader>
        <CardContent>
          <ModelForm
            form={form}
            onSubmit={onSubmit}
            onCancel={() => router.push('/models')}
            isLoading={form.formState.isSubmitting}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default withAuth(CreateModelPageInternal, 'models:manage');
