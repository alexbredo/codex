
'use client';

import * as React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useWatch } from 'react-hook-form';
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
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const [testInput, setTestInput] = React.useState('');
  const [testResult, setTestResult] = React.useState<'valid' | 'invalid' | 'error' | null>(null);

  const regexPattern = useWatch({
    control: form.control,
    name: 'regexPattern',
  });

  React.useEffect(() => {
    if (!testInput || !regexPattern) {
      setTestResult(null);
      return;
    }
    try {
      const regex = new RegExp(regexPattern);
      setTestResult(regex.test(testInput) ? 'valid' : 'invalid');
    } catch (e) {
      setTestResult('error');
    }
  }, [testInput, regexPattern]);

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

        <div className="space-y-3 pt-6 mt-6 border-t">
          <h4 className="text-base font-semibold text-foreground">Test Rule</h4>
          <FormItem>
            <FormLabel>Sample Input</FormLabel>
            <FormControl>
              <Input
                placeholder="Enter text to test against the pattern"
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
              />
            </FormControl>
            <FormDescription>
              Live validation against the regex pattern above.
            </FormDescription>
          </FormItem>
          {testInput && (
            <div className="mt-2 flex items-center h-6">
              {testResult === 'valid' && (
                <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                  <CheckCircle className="mr-2 h-4 w-4" /> Valid
                </Badge>
              )}
              {testResult === 'invalid' && (
                <Badge variant="destructive">
                  <XCircle className="mr-2 h-4 w-4" /> Invalid
                </Badge>
              )}
              {testResult === 'error' && (
                <Badge variant="destructive">
                  <AlertTriangle className="mr-2 h-4 w-4" /> Invalid Regex Pattern
                </Badge>
              )}
            </div>
          )}
        </div>


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
