
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useParams } from 'next/navigation';
import ObjectForm from '@/components/objects/object-form';
import { createObjectFormSchema } from '@/components/objects/object-form-schema';
import { useData } from '@/contexts/data-context';
import { useAuth } from '@/contexts/auth-context'; // Import useAuth
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Model, DataObject, WorkflowWithDetails } from '@/lib/types';
import { ArrowLeft, Loader2, ShieldAlert } from 'lucide-react';
import { z } from 'zod';

export default function EditObjectPage() {
  const router = useRouter();
  const params = useParams();
  const modelId = params.modelId as string;
  const objectId = params.objectId as string;

  const { getModelById, updateObject, getWorkflowById, validationRulesets, allUsers, isReady: dataContextIsReady, formatApiError } = useData(); // Get allUsers
  const { user: currentUser, isLoading: authIsLoading, hasPermission } = useAuth(); // Get current authenticated user
  const { toast } = useToast();

  const [currentModel, setCurrentModel] = useState<Model | null>(null);
  const [editingObject, setEditingObject] = useState<DataObject | null>(null);
  const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowWithDetails | null>(null);
  const [isLoadingPageData, setIsLoadingPageData] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const dynamicSchema = useMemo(() => {
    if (currentModel && dataContextIsReady) { 
      return createObjectFormSchema(currentModel, validationRulesets);
    }
    return z.object({});
  }, [currentModel, validationRulesets, dataContextIsReady]);


  const form = useForm<Record<string, any>>({
    resolver: zodResolver(dynamicSchema),
    defaultValues: {},
  });


  useEffect(() => {
    const loadObjectForEditing = async () => {
      if (!dataContextIsReady || !modelId || !objectId || authIsLoading || !currentUser) {
        return;
      }

      setIsLoadingPageData(true);
      setPageError(null);

      const foundModel = getModelById(modelId);
      if (!foundModel) {
        const modelNotFoundError = `Model with ID ${modelId} not found.`;
        setPageError(modelNotFoundError);
        toast({ variant: "destructive", title: "Error", description: modelNotFoundError });
        setIsLoadingPageData(false);
        router.push('/models'); 
        return;
      }

      try {
        const response = await fetch(`/api/codex-structure/models/${modelId}/objects/${objectId}`);
        if (!response.ok) {
          const errorMsg = await formatApiError(response, `Object with ID ${objectId} not found or error fetching.`);
          throw new Error(errorMsg);
        }
        const objectToEdit: DataObject = await response.json();

        // Perform permission check *after* fetching the object
        const isOwner = objectToEdit.ownerId === currentUser.id;
        if (!hasPermission(`model:edit:${modelId}`) && !(hasPermission('objects:edit_own') && isOwner)) {
            toast({ variant: 'destructive', title: 'Unauthorized', description: "You don't have permission to edit this object." });
            router.replace(`/data/${modelId}`);
            // Don't continue processing
            return;
        }

        // If authorized, proceed to set state
        setCurrentModel(foundModel);
        if (foundModel.workflowId) {
            setCurrentWorkflow(getWorkflowById(foundModel.workflowId) || null);
        } else {
            setCurrentWorkflow(null);
        }
        setEditingObject(objectToEdit);

        const formValues: Record<string, any> = {
          currentStateId: objectToEdit.currentStateId || null,
          ownerId: objectToEdit.ownerId || null,
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

      } catch (error: any) {
        console.error("Error fetching object for edit:", error);
        setPageError(error.message || "Failed to load object details for editing.");
        toast({ variant: "destructive", title: "Error Loading Object", description: error.message });
      } finally {
        setIsLoadingPageData(false);
      }
    };
    
    loadObjectForEditing();

  }, [
    modelId, 
    objectId, 
    dataContextIsReady, 
    authIsLoading, 
    currentUser, 
    hasPermission, 
    getModelById, 
    getWorkflowById, 
    form, 
    router, 
    toast, 
    formatApiError
  ]);
  
  useEffect(() => { 
    form.resolver = zodResolver(dynamicSchema) as any;
  }, [dynamicSchema, form]);


  const onSubmit = async (values: Record<string, any>) => {
    if (!currentModel || !editingObject) return;

    const processedValues = { ...values };
    const currentDate = new Date();
    const localISODate = new Date(currentDate.getTime() - (currentDate.getTimezoneOffset() * 60000)).toISOString();


    try {
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
        } else if (prop.autoSetOnUpdate) {
          if (prop.type === 'date') {
            processedValues[prop.name] = localISODate.split('T')[0];
          } else if (prop.type === 'datetime') {
            processedValues[prop.name] = localISODate.slice(0, 16);
          }
        }
      }

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

      const updatePayload = { ...processedValues };
      // ownerId is now part of 'values' and will be included if changed by admin in the form

      await updateObject(currentModel.id, editingObject.id, updatePayload);
      toast({ title: `${currentModel.name} Updated`, description: `The ${currentModel.name.toLowerCase()} has been updated.` });
      router.push(`/data/${currentModel.id}`);
    } catch (error: any) {
      console.error(`Error updating ${currentModel.name}:`, error);
      let errorMessage = error.message || `Failed to update ${currentModel.name.toLowerCase()}.`;
       if (error.field && typeof error.field === 'string') {
        form.setError(error.field, { type: 'manual', message: error.message });
      }
      toast({ variant: "destructive", title: "Error Updating Object", description: errorMessage });
    }
  };

  if (isLoadingPageData || authIsLoading || !dataContextIsReady) { // Include authIsLoading and dataContextIsReady
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading object details for editing...</p>
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="container mx-auto py-8 text-center">
        <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-2xl font-semibold text-destructive mb-2">Error Loading Object</h2>
        <p className="text-muted-foreground mb-4">{pageError}</p>
        <Button onClick={() => router.push(`/data/${modelId}`)} className="mt-4">
          Back to {currentModel?.name || 'Data'}
        </Button>
      </div>
    );
  }

  if (!currentModel || !editingObject) {
     return (
      <div className="flex flex-col justify-center items-center h-screen">
        <p className="text-lg text-destructive">Object or Model details could not be fully loaded.</p>
        <Button onClick={() => router.push(modelId ? `/data/${modelId}` : '/models')} className="mt-4">
          Back to {currentModel?.name || 'Data'}
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 flex flex-col h-full">
      <Button variant="outline" onClick={() => router.push(`/data/${modelId}`)} className="mb-6 flex-shrink-0 self-start">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to {currentModel.name} Data
      </Button>
      <Card className="max-w-2xl mx-auto w-full flex-grow min-h-0 flex flex-col">
        <CardHeader className="flex-shrink-0">
          <CardTitle className="text-2xl">Edit {currentModel.name}</CardTitle>
          <CardDescription>Update the details for this {currentModel.name.toLowerCase()} object.</CardDescription>
        </CardHeader>
        <CardContent className="flex-grow min-h-0">
          <ObjectForm
            form={form}
            model={currentModel}
            onSubmit={onSubmit}
            onCancel={() => router.push(`/data/${modelId}`)}
            existingObject={editingObject}
            isLoading={form.formState.isSubmitting}
            currentWorkflow={currentWorkflow}
            allUsers={allUsers} // Pass all users
            currentUser={currentUser} // Pass current authenticated user
            validationRulesets={validationRulesets}
          />
        </CardContent>
      </Card>
    </div>
  );
}
