
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
import { ArrowLeft, Loader2 } from 'lucide-react';

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
        const sortedProperties = [...foundModel.properties].sort((a, b) => a.orderIndex - b.orderIndex);
        
        form.reset({
          name: foundModel.name,
          description: foundModel.description || '',
          namespace: foundModel.namespace || 'Default',
          displayPropertyNames: foundModel.displayPropertyNames || [],
          properties: sortedProperties.map(p => {
            const isRelationship = p.type === 'relationship';
            const isDate = p.type === 'date';
            const isNumber = p.type === 'number';
            const isString = p.type === 'string';
            // const isMarkdown = p.type === 'markdown'; // Not directly used for conditional defaults here
            // const isRating = p.type === 'rating'; // Not directly used for conditional defaults here
            // const isImage = p.type === 'image'; // Not directly used for conditional defaults here


            return {
              id: p.id || crypto.randomUUID(),
              name: p.name,
              type: p.type,
              relatedModelId: isRelationship ? p.relatedModelId : undefined,
              required: !!p.required,
              relationshipType: isRelationship ? (p.relationshipType || 'one') : undefined,
              unit: isNumber ? p.unit : undefined,
              precision: isNumber ? (p.precision === undefined || p.precision === null ? 2 : p.precision) : undefined,
              autoSetOnCreate: isDate ? !!p.autoSetOnCreate : false,
              autoSetOnUpdate: isDate ? !!p.autoSetOnUpdate : false,
              isUnique: isString ? !!p.isUnique : false, 
              defaultValue: p.defaultValue ?? '', // Ensures empty string if null/undefined, preserves existing string
              orderIndex: p.orderIndex,
            } as PropertyFormValues;
          }),
        });
      } else {
        toast({ variant: "destructive", title: "Error", description: "Model not found." });
        router.push('/models');
      }
      setIsLoadingModel(false);
    }
  }, [modelId, getModelById, isReady, form, router, toast, setCurrentModel]);

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
      namespace: (values.namespace && values.namespace.trim() !== '') ? values.namespace.trim() : 'Default',
      displayPropertyNames: values.displayPropertyNames && values.displayPropertyNames.length > 0 ? values.displayPropertyNames : undefined,
      properties: values.properties.map((p, index) => ({
        id: p.id || crypto.randomUUID(),
        name: p.name,
        type: p.type,
        relatedModelId: p.type === 'relationship' ? p.relatedModelId : undefined,
        required: !!p.required,
        relationshipType: p.type === 'relationship' ? (p.relationshipType || 'one') : undefined,
        unit: p.unit,
        precision: p.precision,
        autoSetOnCreate: !!p.autoSetOnCreate,
        autoSetOnUpdate: !!p.autoSetOnUpdate,
        isUnique: !!p.isUnique, 
        defaultValue: p.defaultValue,
        orderIndex: index,
      } as Property)),
    };

    try {
      await updateModel(currentModel.id, modelData);
      toast({ title: "Model Updated", description: `Model "${values.name}" has been successfully updated.` });
      router.push('/models');
    } catch (error: any) {
      console.error("Error updating model:", error);
      toast({ variant: "destructive", title: "Error updating model", description: error.message || "An unknown error occurred." });
    }
  };

  if (!isReady || isLoadingModel) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading model details...</p>
      </div>
    );
  }

  if (!currentModel) {
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
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl">Edit Model: {currentModel.name}</CardTitle>
          <CardDescription>Update the details for the "{currentModel.name}" model in namespace "{currentModel.namespace}".</CardDescription>
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
