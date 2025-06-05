
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
import type { ValidationRuleFormValues } from './validation-rule-form-schema';
import type { ValidationRuleset } from '@/lib/types';

interface ValidationRuleFormProps {
  form: UseFormReturn<ValidationRuleFormValues>;
  onSubmit: (values: ValidationRuleFormValues) => void;
  onCancel: () => void;
  isLoading?: boolean;
  existingRule?: ValidationRuleset;
}

export default function ValidationRuleForm({
  form,
  onSubmit,
  onCancel,
  isLoading,
  existingRule,
}: ValidationRuleFormProps) {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Rule Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Email Format, Strong Password" {...field} />
              </FormControl>
              <FormDescription>A unique and descriptive name for this rule.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="regexPattern"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Regex Pattern</FormLabel>
              <FormControl>
                <Input placeholder="e.g., ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$" {...field} />
              </FormControl>
              <FormDescription>
                The JavaScript-compatible regular expression pattern. Example for numbers only: <code>^[0-9]+$</code>
              </FormDescription>
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
                  placeholder="A brief description of what this rule validates."
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
            {isLoading || form.formState.isSubmitting ? 'Saving...' : (existingRule ? 'Update Rule' : 'Create Rule')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
