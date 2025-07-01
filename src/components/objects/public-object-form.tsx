
'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { createObjectFormSchema } from '@/components/objects/object-form-schema';
import AdaptiveFormField from './adaptive-form-field';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { PublicShareData } from '@/lib/types';
import { Loader2, CheckCircle } from 'lucide-react';

interface PublicObjectFormProps {
  linkData: PublicShareData;
  onSuccess: () => void;
}

export default function PublicObjectForm({ linkData, onSuccess }: PublicObjectFormProps) {
  const { link, model, object: existingObject } = linkData;
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);

  const dynamicSchema = useMemo(() => createObjectFormSchema(model), [model]);
  
  const form = useForm<Record<string, any>>({
    resolver: zodResolver(dynamicSchema),
    defaultValues: existingObject || {},
  });

  const handleSubmit = async (values: Record<string, any>) => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/public/share/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkId: link.id,
          formData: values,
        }),
      });

      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to submit form.');
      }
      
      toast({ title: 'Success!', description: responseData.message });
      setSubmissionSuccess(true);
      onSuccess();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Submission Error', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submissionSuccess) {
    return (
        <div className="container mx-auto max-w-2xl py-12 text-center">
            <Card>
                <CardHeader>
                    <div className="mx-auto bg-green-100 rounded-full p-3 w-fit">
                        <CheckCircle className="h-10 w-10 text-green-600" />
                    </div>
                    <CardTitle className="text-2xl mt-4">Submission Received!</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">
                        Thank you. Your data has been successfully {link.link_type === 'create' ? 'created' : 'updated'}. You can now close this window.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            {link.link_type === 'create' ? `New ${model.name}` : `Update ${model.name}`}
          </CardTitle>
          <CardDescription>
            {link.link_type === 'create' ? `Fill out the form to create a new entry.` : `Please update the required information below.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              {model.properties.map((prop) => (
                <AdaptiveFormField
                  key={prop.id}
                  form={form}
                  property={prop}
                  formContext={link.link_type}
                  modelId={model.id}
                  objectId={existingObject?.id}
                />
              ))}
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
