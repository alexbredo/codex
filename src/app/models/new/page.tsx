
'use client';

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
      namespace: (values.namespace && values.namespace.trim() !== '') ? values.namespace.trim() : 'Default',
      displayPropertyNames: values.displayPropertyNames && values.displayPropertyNames.length > 0 ? values.displayPropertyNames : undefined,
      properties: values.properties.map((p, index) => ({
        id: p.id || crypto.randomUUID(),
        name: p.name,
        type: p.type,
        relatedModelId: p.type === 'relationship' ? p.relatedModelId : undefined,
        required: p.required,
        relationshipType: p.type === 'relationship' ? p.relationshipType : undefined,
        unit: p.unit,
        precision: p.precision,
        autoSetOnCreate: p.autoSetOnCreate,
        autoSetOnUpdate: p.autoSetOnUpdate,
        isUnique: p.isUnique, 
        defaultValue: p.defaultValue,
        orderIndex: index,
      } as Property)),
    };

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
