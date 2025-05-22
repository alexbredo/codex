
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
import type { Model, DataObject } from '@/lib/types';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { z } from 'zod';

export default function EditObjectPage() {
  const router = useRouter();
  const params = useParams();
  const modelId = params.modelId as string;
  const objectId = params.objectId as string;

  const { getModelById, getObjectsByModelId, updateObject, isReady } = useData();
  const { toast } = useToast();

  const [currentModel, setCurrentModel] = useState<Model | null>(null);
  const [editingObject, setEditingObject] = useState<DataObject | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const dynamicSchema = useMemo(() => currentModel ? createObjectFormSchema(currentModel) : z.object({}), [currentModel]);

  const form = useForm<Record<string, any>>({
    resolver: zodResolver(dynamicSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (isReady && modelId && objectId) {
      const foundModel = getModelById(modelId);
      if (foundModel) {
        setCurrentModel(foundModel);
        const modelObjects = getObjectsByModelId(modelId);
        const objectToEdit = modelObjects.find(obj => obj.id === objectId);

        if (objectToEdit) {
          setEditingObject(objectToEdit);
          const formValues: Record<string, any> = {};
          foundModel.properties.forEach(prop => {
            formValues[prop.name] = objectToEdit[prop.name] ??
                                    (prop.relationshipType === 'many' ? [] :
                                    prop.type === 'boolean' ? false : undefined);
          });
          form.reset(formValues);
        } else {
          toast({ variant: "destructive", title: "Error", description: `Object with ID ${objectId} not found.` });
          router.push(`/data/${modelId}`);
        }
      } else {
        toast({ variant: "destructive", title: "Error", description: `Model with ID ${modelId} not found.` });
        router.push('/models');
      }
      setIsLoadingData(false);
    }
  }, [modelId, objectId, getModelById, getObjectsByModelId, isReady, form, router, toast]);

  const onSubmit = (values: Record<string, any>) => {
    if (!currentModel || !editingObject) return;

    const processedValues = { ...values };
    const currentDateISO = new Date().toISOString();

    currentModel.properties.forEach(prop => {
      if (prop.type === 'date' && prop.autoSetOnUpdate) {
        processedValues[prop.name] = currentDateISO; // Forcefully set if autoSetOnUpdate is true
      }
      // autoSetOnCreate is historical, its value is already in 'values' from the loaded object.
    });

    try {
      updateObject(currentModel.id, editingObject.id, processedValues);
      toast({ title: `${currentModel.name} Updated`, description: `The ${currentModel.name.toLowerCase()} has been updated.` });
      router.push(`/data/${currentModel.id}`);
    } catch (error: any) {
      console.error(`Error updating ${currentModel.name}:`, error);
      toast({ variant: "destructive", title: "Error", description: `Failed to update ${currentModel.name.toLowerCase()}. ${error.message}` });
    }
  };

  if (!isReady || isLoadingData) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading object details...</p>
      </div>
    );
  }

  if (!currentModel || !editingObject) {
     return (
      <div className="flex flex-col justify-center items-center h-screen">
        <p className="text-lg text-destructive">Object or Model not found.</p>
        <Button onClick={() => router.push(`/data/${modelId}`)} className="mt-4">Back to Data</Button>
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
          <CardTitle className="text-2xl">Edit {currentModel.name}</CardTitle>
          <CardDescription>Update the details for this {currentModel.name.toLowerCase()} object.</CardDescription>
        </CardHeader>
        <CardContent>
          <ObjectForm
            form={form}
            model={currentModel}
            onSubmit={onSubmit}
            onCancel={() => router.push(`/data/${modelId}`)}
            existingObject={editingObject}
            isLoading={form.formState.isSubmitting}
          />
        </CardContent>
      </Card>
    </div>
  );
}
