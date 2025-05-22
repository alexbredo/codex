
'use client';

import { useEffect, useState } from 'react';
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
import { ArrowLeft } from 'lucide-react';

export default function EditModelPage() {
  const router = useRouter();
  const params = useParams();
  const modelId = params.modelId as string;
  const { getModelById, updateModel, getModelByName, isReady } = useData();
  const { toast } = useToast();
  const [currentModel, setCurrentModel] = useState<Model | null>(null);
  const [isLoadingModel, setIsLoadingModel] = useState(true);

  const form = useForm<ModelFormValues>({
    resolver: zodResolver(modelFormSchema),
    // Default values will be set by useEffect once model is loaded
  });

  useEffect(() => {
    if (isReady && modelId) {
      const foundModel = getModelById(modelId);
      if (foundModel) {
        setCurrentModel(foundModel);
        form.reset({
          name: foundModel.name,
          description: foundModel.description || '',
          displayPropertyNames: foundModel.displayPropertyNames || [],
          properties: foundModel.properties.map(p => ({
            ...p,
            id: p.id || crypto.randomUUID(), // Ensure ID exists
            relationshipType: p.relationshipType || 'one', // Ensure default
            // unit and precision are part of the Property type and will be included
          } as PropertyFormValues)),
        });
      } else {
        toast({ variant: "destructive", title: "Error", description: "Model not found." });
        router.push('/models');
      }
      setIsLoadingModel(false);
    }
  }, [modelId, getModelById, isReady, form, router, toast]);

  const onSubmit = (values: ModelFormValues) => {
    if (!currentModel) return;

    const existingByName = getModelByName(values.name);
    if (existingByName && existingByName.id !== currentModel.id) {
        form.setError("name", { type: "manual", message: "A model with this name already exists." });
        return;
    }

    // values.properties here are already processed by ModelForm's internal submit handler
    // to have correct unit/precision based on type
    const modelData = {
      name: values.name,
      description: values.description,
      displayPropertyNames: values.displayPropertyNames && values.displayPropertyNames.length > 0 ? values.displayPropertyNames : undefined,
      properties: values.properties.map(p => ({
        id: p.id || crypto.randomUUID(),
        name: p.name,
        type: p.type,
        relatedModelId: p.type === 'relationship' ? p.relatedModelId : undefined,
        required: p.required,
        relationshipType: p.type === 'relationship' ? p.relationshipType : undefined,
        unit: p.unit, // p.unit is correctly set/undefined by ModelForm
        precision: p.precision, // p.precision is correctly set/undefined/defaulted by ModelForm
      } as Property)),
    };

    try {
      updateModel(currentModel.id, modelData);
      toast({ title: "Model Updated", description: `Model "${values.name}" has been successfully updated.` });
      router.push('/models');
    } catch (error) {
      console.error("Error updating model:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to update model." });
    }
  };

  if (!isReady || isLoadingModel) {
    return <div className="flex justify-center items-center h-screen"><p>Loading model details...</p></div>;
  }

  if (!currentModel) {
    // This case should be handled by the redirect in useEffect, but as a fallback:
    return <div className="flex justify-center items-center h-screen"><p>Model not found.</p></div>;
  }

  return (
    <div className="container mx-auto py-8">
      <Button variant="outline" onClick={() => router.push('/models')} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Models
      </Button>
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
    </div>
  );
}
