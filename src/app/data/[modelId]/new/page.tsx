
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

  const dynamicSchema = useMemo(() => currentModel ? createObjectFormSchema(currentModel) : z.object({}), [currentModel]);

  const form = useForm<Record<string, any>>({
    resolver: zodResolver(dynamicSchema),
    defaultValues: {}, // Default values will be set by useEffect
  });

  useEffect(() => {
    if (isReady && modelId) {
      const foundModel = getModelById(modelId);
      if (foundModel) {
        setCurrentModel(foundModel);
        const defaultValues: Record<string, any> = {};
        foundModel.properties.forEach(prop => {
          defaultValues[prop.name] = prop.type === 'boolean' ? false :
                                   prop.type === 'date' ? null :
                                   prop.relationshipType === 'many' ? [] :
                                   undefined;
        });
        form.reset(defaultValues);
      } else {
        toast({ variant: "destructive", title: "Error", description: "Model not found." });
        router.push('/models');
      }
      setIsLoadingModel(false);
    }
  }, [modelId, getModelById, isReady, form, router, toast]);

  const onSubmit = (values: Record<string, any>) => {
    if (!currentModel) return;
    try {
      addObject(currentModel.id, values);
      toast({ title: `${currentModel.name} Created`, description: `A new ${currentModel.name.toLowerCase()} has been created.` });
      router.push(`/data/${currentModel.id}`);
    } catch (error: any) {
      console.error(`Error creating ${currentModel.name}:`, error);
      toast({ variant: "destructive", title: "Error", description: `Failed to create ${currentModel.name.toLowerCase()}. ${error.message}` });
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
          />
        </CardContent>
      </Card>
    </div>
  );
}

    