
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
import type { Model, DataObject, WorkflowWithDetails } from '@/lib/types';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { z } from 'zod';

export default function EditObjectPage() {
  const router = useRouter();
  const params = useParams();
  const modelId = params.modelId as string;
  const objectId = params.objectId as string;

  const { getModelById, getObjectsByModelId, updateObject, getWorkflowById, isReady } = useData();
  const { toast } = useToast();

  const [currentModel, setCurrentModel] = useState<Model | null>(null);
  const [editingObject, setEditingObject] = useState<DataObject | null>(null);
  const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowWithDetails | null>(null);
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
        if (foundModel.workflowId) {
          const wf = getWorkflowById(foundModel.workflowId);
          setCurrentWorkflow(wf || null);
        } else {
          setCurrentWorkflow(null);
        }

        const modelObjects = getObjectsByModelId(modelId);
        const objectToEdit = modelObjects.find(obj => obj.id === objectId);

        if (objectToEdit) {
          setEditingObject(objectToEdit);
          const formValues: Record<string, any> = {
            currentStateId: objectToEdit.currentStateId || null,
          };
          foundModel.properties.forEach(prop => {
            formValues[prop.name] = objectToEdit[prop.name] ??
                                    (prop.relationshipType === 'many' ? [] :
                                    prop.type === 'boolean' ? false :
                                    prop.type === 'image' ? null : 
                                    prop.type === 'rating' ? 0 :
                                    undefined);
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
  }, [modelId, objectId, getModelById, getObjectsByModelId, getWorkflowById, isReady, form, router, toast]);

  const onSubmit = async (values: Record<string, any>) => {
    if (!currentModel || !editingObject) return;

    const processedValues = { ...values };
    const currentDateISO = new Date().toISOString();

    // Handle image uploads and auto-set dates
    for (const prop of currentModel.properties) {
      if (prop.type === 'image' && processedValues[prop.name] instanceof File) {
        const file = processedValues[prop.name] as File;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('modelId', currentModel.id);
        formData.append('objectId', editingObject.id);
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
      } else if (prop.type === 'date' && prop.autoSetOnUpdate) {
        processedValues[prop.name] = currentDateISO;
      }
    }

    // Validate required images if a new file wasn't selected but one was required
    for (const prop of currentModel.properties) {
       if (prop.type === 'image' && prop.required && !processedValues[prop.name]) {
          const hadExistingImage = typeof editingObject[prop.name] === 'string' && editingObject[prop.name];
          if (!hadExistingImage) { 
               form.setError(prop.name, { type: 'manual', message: `${prop.name} is required. Please select an image.` });
               toast({ variant: "destructive", title: "Validation Error", description: `${prop.name} is required.` });
               return;
          }
       }
    }

    // The `values` object from RHF already includes `currentStateId` if the field was rendered
    // The API will handle validation of this state transition.
    const updatePayload = { ...processedValues };

    try {
      await updateObject(currentModel.id, editingObject.id, updatePayload);
      toast({ title: `${currentModel.name} Updated`, description: `The ${currentModel.name.toLowerCase()} has been updated.` });
      router.push(`/data/${currentModel.id}`);
    } catch (error: any) {
      console.error(`Error updating ${currentModel.name}:`, error);
      toast({ variant: "destructive", title: "Error Updating Object", description: error.message || `Failed to update ${currentModel.name.toLowerCase()}.` });
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
            formObjectId={objectId}
            currentWorkflow={currentWorkflow}
          />
        </CardContent>
      </Card>
    </div>
  );
}
