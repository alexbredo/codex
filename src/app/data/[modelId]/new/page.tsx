
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useParams } from 'next/navigation';
import ObjectForm from '@/components/objects/object-form';
import { createObjectFormSchema } from '@/components/objects/object-form-schema';
import { useData } from '@/contexts/data-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Model } from '@/lib/types';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { z } from 'zod';

export default function CreateObjectPage() {
  const router = useRouter();
  const params = useParams();
  const modelId = params.modelId as string;
  const { getModelById, addObject, isReady } = useData();
  const { toast } = useToast();
  const [currentModel, setCurrentModel] = useState<Model | null>(null);
  const [isLoadingModel, setIsLoadingModel] = useState(true);
  const [formObjectId, setFormObjectId] = useState<string | null>(null); // For image uploads

  const dynamicSchema = useMemo(() => currentModel ? createObjectFormSchema(currentModel) : z.object({}), [currentModel]);

  const form = useForm<Record<string, any>>({
    resolver: zodResolver(dynamicSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (isReady && modelId) {
      const foundModel = getModelById(modelId);
      if (foundModel) {
        setCurrentModel(foundModel);
        const newObjectId = crypto.randomUUID(); // Generate UUID for potential image uploads
        setFormObjectId(newObjectId);

        const defaultValues: Record<string, any> = {};
        const currentDateISO = new Date().toISOString();
        foundModel.properties.forEach(prop => {
          if (prop.type === 'date' && prop.autoSetOnCreate) {
            defaultValues[prop.name] = currentDateISO;
          } else {
            defaultValues[prop.name] = prop.type === 'boolean' ? false :
                                     prop.type === 'date' ? null :
                                     prop.relationshipType === 'many' ? [] :
                                     prop.type === 'image' ? null :
                                     prop.type === 'rating' ? 0 :
                                     undefined;
          }
        });
        form.reset(defaultValues);
      } else {
        toast({ variant: "destructive", title: "Error", description: "Model not found." });
        router.push('/models');
      }
      setIsLoadingModel(false);
    }
  }, [modelId, getModelById, isReady, form, router, toast]);

  const onSubmit = async (values: Record<string, any>) => {
    if (!currentModel || !formObjectId) return;

    const processedValues = { ...values };
    const currentDateISO = new Date().toISOString();

    try {
      // Handle image uploads
      for (const prop of currentModel.properties) {
        if (prop.type === 'image' && processedValues[prop.name] instanceof File) {
          const file = processedValues[prop.name] as File;
          const formData = new FormData();
          formData.append('file', file);
          formData.append('modelId', currentModel.id);
          formData.append('objectId', formObjectId); // Use pre-generated objectId
          formData.append('propertyName', prop.name);


          const uploadResponse = await fetch('/api/codex-structure/upload-image', {
            method: 'POST',
            body: formData,
          });

          if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json();
            throw new Error(errorData.error || `Failed to upload image ${file.name}`);
          }
          const uploadResult = await uploadResponse.json();
          processedValues[prop.name] = uploadResult.url; 
        } else if (prop.type === 'date' && prop.autoSetOnCreate) {
          processedValues[prop.name] = currentDateISO;
        }
      }
      
      for (const prop of currentModel.properties) {
        if (prop.type === 'image' && prop.required && !processedValues[prop.name]) {
           form.setError(prop.name, { type: 'manual', message: `${prop.name} is required. Please select an image.` });
           toast({ variant: "destructive", title: "Validation Error", description: `${prop.name} is required.` });
           return; 
        }
      }

      await addObject(currentModel.id, processedValues, formObjectId); // Pass formObjectId to addObject
      toast({ title: `${currentModel.name} Created`, description: `A new ${currentModel.name.toLowerCase()} has been created.` });
      router.push(`/data/${currentModel.id}`);
    } catch (error: any) {
      console.error(`Error creating ${currentModel.name}:`, error);
      toast({ variant: "destructive", title: "Error Creating Object", description: error.message || `Failed to create ${currentModel.name.toLowerCase()}.` });
    }
  };

  if (!isReady || isLoadingModel) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading model for new object...</p>
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
      <Button variant="outline" onClick={() => router.push(`/data/${modelId}`)} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to {currentModel.name} Data
      </Button>
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl">Create New {currentModel.name}</CardTitle>
          <CardDescription>Fill in the details for the new {currentModel.name.toLowerCase()} object.</CardDescription>
        </CardHeader>
        <CardContent>
          <ObjectForm
            form={form}
            model={currentModel}
            onSubmit={onSubmit}
            onCancel={() => router.push(`/data/${modelId}`)}
            isLoading={form.formState.isSubmitting}
            formObjectId={formObjectId}
          />
        </CardContent>
      </Card>
    </div>
  );
}
