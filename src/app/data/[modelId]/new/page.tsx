
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
import type { Model, Property } from '@/lib/types';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { z } from 'zod';
import { useAuth } from '@/contexts/auth-context';

function parseDefaultValue(value: string | undefined, type: Property['type'], relationshipType?: Property['relationshipType']): any {
  if (value === undefined || value === null || value.trim() === '') {
    return undefined;
  }

  switch (type) {
    case 'string':
    case 'markdown':
    case 'image':
    case 'url':
    case 'time':
    case 'datetime':
      return value;
    case 'number':
    case 'rating':
      const num = parseFloat(value);
      return isNaN(num) ? undefined : num;
    case 'boolean':
      return value.toLowerCase() === 'true';
    case 'date':
      try {
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date.toISOString();
      } catch {
        return null;
      }
    case 'relationship':
      if (relationshipType === 'many') {
        try {
          const parsedArray = JSON.parse(value);
          if (Array.isArray(parsedArray) && parsedArray.every(item => typeof item === 'string')) {
            return parsedArray;
          }
        } catch (e) {
          const ids = value.split(',').map(id => id.trim()).filter(id => id !== '');
          if (ids.length > 0) return ids;
        }
        return []; 
      }
      return value.trim(); 
    default:
      return undefined;
  }
}


export default function CreateObjectPage() {
  const router = useRouter();
  const params = useParams();
  const modelId = params.modelId as string;
  const { getModelById, addObject, validationRulesets, isReady } = useData(); 
  const { toast } = useToast();
  const { hasPermission, isLoading: isAuthLoading } = useAuth();
  const [currentModel, setCurrentModel] = useState<Model | null>(null);
  const [isLoadingModel, setIsLoadingModel] = useState(true);
  const [formObjectId, setFormObjectId] = useState<string | null>(null); 

  useEffect(() => {
    if (!isAuthLoading && !hasPermission('objects:create') && !hasPermission(`model:create:${modelId}`)) {
        toast({ variant: "destructive", title: "Unauthorized", description: "You don't have permission to create objects for this model." });
        router.replace(`/data/${modelId}`);
    }
  }, [isAuthLoading, hasPermission, router, modelId, toast]);


  const dynamicSchema = useMemo(() => {
    if (currentModel && isReady) { // Ensure validationRulesets are ready from context
      return createObjectFormSchema(currentModel, validationRulesets);
    }
    return z.object({});
  }, [currentModel, validationRulesets, isReady]);


  const form = useForm<Record<string, any>>({
    resolver: zodResolver(dynamicSchema),
    defaultValues: {},
  });


  useEffect(() => {
    if (isReady && modelId) {
      const foundModel = getModelById(modelId);
      if (foundModel) {
        setCurrentModel(foundModel);
        const newObjectId = crypto.randomUUID(); 
        setFormObjectId(newObjectId);

        const defaultValues: Record<string, any> = {};
        const currentDate = new Date();
        const localISODate = new Date(currentDate.getTime() - (currentDate.getTimezoneOffset() * 60000)).toISOString();

        
        foundModel.properties.forEach(prop => {
          let valueToSet: any;
          if (prop.autoSetOnCreate) {
            if (prop.type === 'date') {
              valueToSet = localISODate.split('T')[0];
            } else if (prop.type === 'datetime') {
              valueToSet = localISODate.slice(0, 16);
            }
          }
          
          if (valueToSet === undefined && prop.defaultValue !== undefined && prop.defaultValue !== null) {
             valueToSet = parseDefaultValue(prop.defaultValue, prop.type, prop.relationshipType);
          }
          
          if (valueToSet === undefined) { 
             switch (prop.type) {
                case 'boolean': valueToSet = false; break;
                case 'date':
                case 'datetime':
                case 'time': 
                  valueToSet = null; 
                  break;
                case 'relationship': valueToSet = prop.relationshipType === 'many' ? [] : ''; break;
                case 'rating': valueToSet = 0; break;
                case 'image': valueToSet = null; break;
                default: valueToSet = undefined; 
            }
          }
          defaultValues[prop.name] = valueToSet;
        });
        form.reset(defaultValues);
      } else {
        toast({ variant: "destructive", title: "Error", description: "Model not found." });
        router.push('/models');
      }
      setIsLoadingModel(false);
    }
  }, [modelId, getModelById, isReady, form, router, toast]);

  useEffect(() => { // Re-evaluate resolver when dynamicSchema changes
    form.resolver = zodResolver(dynamicSchema) as any;
  }, [dynamicSchema, form]);


  const onSubmit = async (values: Record<string, any>) => {
    if (!currentModel || !formObjectId) return;

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
          formData.append('objectId', formObjectId); 
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
        } else if (prop.autoSetOnCreate) {
          if (prop.type === 'date') {
            processedValues[prop.name] = localISODate.split('T')[0];
          } else if (prop.type === 'datetime') {
            processedValues[prop.name] = localISODate.slice(0, 16);
          }
        }
      }
      
      for (const prop of currentModel.properties) {
        if (prop.type === 'image' && prop.required && !processedValues[prop.name]) {
           form.setError(prop.name, { type: 'manual', message: `${prop.name} is required. Please select an image.` });
           toast({ variant: "destructive", title: "Validation Error", description: `${prop.name} is required.` });
           return; 
        }
      }

      await addObject(currentModel.id, processedValues, formObjectId); 
      toast({ title: `${currentModel.name} Created`, description: `A new ${currentModel.name.toLowerCase()} has been created.` });
      router.push(`/data/${currentModel.id}`);
    } catch (error: any) {
      console.error(`Error creating ${currentModel.name}:`, error);
      let errorMessage = error.message || `Failed to create ${currentModel.name.toLowerCase()}.`;
      if (error.field && typeof error.field === 'string') {
        form.setError(error.field, { type: 'manual', message: error.message });
      }
      toast({ variant: "destructive", title: "Error Creating Object", description: errorMessage });
    }
  };

  if (!isReady || isLoadingModel || isAuthLoading) {
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
            onCancel={() => router.push(`/data/${currentModel.id}`)}
            isLoading={form.formState.isSubmitting}
            formObjectId={formObjectId}
          />
        </CardContent>
      </Card>
    </div>
  );
}
