
'use client';

import type { UseFormReturn } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import type { ModelGroupFormValues } from './model-group-form-schema';
import type { ModelGroup } from '@/lib/types';

interface ModelGroupFormProps {
  form: UseFormReturn<ModelGroupFormValues>;
  onSubmit: (values: ModelGroupFormValues) => void;
  onCancel: () => void;
  isLoading?: boolean;
  existingGroup?: ModelGroup;
}

export default function ModelGroupForm({
  form,
  onSubmit,
  onCancel,
  isLoading,
  existingGroup,
}: ModelGroupFormProps) {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Group Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Core System, Sales, Marketing" {...field} />
              </FormControl>
              <FormDescription>A unique name for this model group.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="A brief description of what this group of models represents."
                  {...field}
                  value={field.value ?? ''} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end space-x-2 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading || form.formState.isSubmitting} className="bg-primary hover:bg-primary/90">
            {isLoading || form.formState.isSubmitting ? 'Saving...' : (existingGroup ? 'Update Group' : 'Create Group')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
