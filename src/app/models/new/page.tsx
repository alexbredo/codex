
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

const INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE = "__DEFAULT_DISPLAY_PROPERTY__";
const INTERNAL_NO_WORKFLOW_VALUE = "__NO_WORKFLOW_SELECTED__";

export default function CreateModelPage() {
  const router = useRouter();
  const { addModel, getModelByName, isReady } = useData();
  const { toast } = useToast();

  const form = useForm<ModelFormValues>({
    resolver: zodResolver(modelFormSchema),
    defaultValues: {
      name: '',
      description: '',
      namespace: 'Default',
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
    console.log("[CreateModelPage] onSubmit - received values from ModelForm:", JSON.stringify(values, null, 2));
    const existingByName = getModelByName(values.name);
    if (existingByName) {
        form.setError("name", { type: "manual", message: "A model with this name already exists." });
        return;
    }

    const modelData = {
      name: values.name,
      description: values.description,
      namespace: (values.namespace && values.namespace.trim() !== '' && values.namespace !== '__DEFAULT_NAMESPACE_VALUE__') ? values.namespace.trim() : 'Default',
      displayPropertyNames: values.displayPropertyNames?.filter(name => name !== INTERNAL_DEFAULT_DISPLAY_PROPERTY_VALUE),
      workflowId: values.workflowId === INTERNAL_NO_WORKFLOW_VALUE ? null : values.workflowId,
      properties: values.properties.map((p_form_value, index) => {
        const propertyForApi: Property = {
          ...p_form_value, // Spread all fields from form
          id: p_form_value.id || crypto.randomUUID(),
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
        };
        return propertyForApi;
      }),
    };
    console.log("[CreateModelPage] onSubmit - modelData to be sent to addModel:", JSON.stringify(modelData, null, 2));

    try {
      await addModel(modelData);
      toast({ title: "Model Created", description: `Model "${values.name}" has been successfully created.` });
      router.push('/models');
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
