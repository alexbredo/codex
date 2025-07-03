
'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useData } from '@/contexts/data-context';
import { useToast } from '@/hooks/use-toast';
import { modelGroupFormSchema, type ModelGroupFormValues } from '@/components/model-groups/model-group-form-schema';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PlusCircle } from 'lucide-react';

interface NewModelGroupDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onGroupCreated: (newGroupId: string) => void;
}

export default function NewModelGroupDialog({ isOpen, setIsOpen, onGroupCreated }: NewModelGroupDialogProps) {
  const { addModelGroup } = useData();
  const { toast } = useToast();

  const form = useForm<ModelGroupFormValues>({
    resolver: zodResolver(modelGroupFormSchema),
    defaultValues: { name: '', description: '' },
  });

  const handleCreateNewGroup = async (values: ModelGroupFormValues) => {
    try {
      const newGroup = await addModelGroup(values);
      toast({ title: "Group Created", description: `Group "${newGroup.name}" created successfully.` });
      onGroupCreated(newGroup.id);
      setIsOpen(false);
      form.reset();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error Creating Group", description: error.message });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="icon" aria-label="Create new group">
          <PlusCircle className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Model Group</DialogTitle>
          <DialogDescription>Define a new group to organize your models.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleCreateNewGroup)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Group Name</FormLabel>
                  <FormControl><Input placeholder="e.g., Core System" {...field} /></FormControl>
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
                  <FormControl><Textarea placeholder="Brief description..." {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" onClick={() => form.reset()} disabled={form.formState.isSubmitting}>Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Creating...' : 'Create Group'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
