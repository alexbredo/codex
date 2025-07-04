
'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import type { PublishToMarketplaceFormValues, MarketplaceItemType, ValidationRuleset } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import semver from 'semver';

const publishSchema = z.object({
  name: z.string().min(3, "A name is required."),
  description: z.string().optional(),
  author: z.string().min(1, "Author name is required."),
  version: z.string().refine(v => semver.valid(v), {
    message: "Must be a valid semantic version (e.g., 1.0.0).",
  }),
  changelog: z.string().optional(),
});

interface PublishToMarketplaceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  itemType: MarketplaceItemType;
  itemPayload: ValidationRuleset; // For now, only this type
  onSuccess: () => void;
}

async function publishItem(payload: any) {
  const response = await fetch('/api/marketplace/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to publish item.');
  }
  return response.json();
}

export default function PublishToMarketplaceDialog({ isOpen, onClose, itemType, itemPayload, onSuccess }: PublishToMarketplaceDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<PublishToMarketplaceFormValues>({
    resolver: zodResolver(publishSchema),
    defaultValues: {
      name: itemPayload.name || '',
      description: itemPayload.description || '',
      author: user?.username || '',
      version: '1.0.0',
      changelog: 'Initial release.',
    },
  });
  
  React.useEffect(() => {
    if (itemPayload) {
        form.reset({
            name: itemPayload.name || '',
            description: itemPayload.description || '',
            author: user?.username || '',
            version: '1.0.0',
            changelog: 'Initial release.',
        })
    }
  }, [itemPayload, user, form]);

  const handleSubmit = async (values: PublishToMarketplaceFormValues) => {
    setIsSubmitting(true);
    try {
      await publishItem({
        itemType,
        itemPayload,
        metadata: values,
      });
      onSuccess();
      onClose();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Publishing Failed', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish to Local Marketplace</DialogTitle>
          <DialogDescription>
            Add or update this item in your instance's marketplace to share or reuse it easily.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField control={form.control} name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Marketplace Name</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField control={form.control} name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Textarea {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="author"
                    render={({ field }) => (
                        <FormItem><FormLabel>Author</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )}
                />
                <FormField control={form.control} name="version"
                    render={({ field }) => (
                        <FormItem><FormLabel>Version</FormLabel><FormControl><Input placeholder="e.g., 1.0.0" {...field} /></FormControl><FormMessage /></FormItem>
                    )}
                />
            </div>
            <FormField control={form.control} name="changelog"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Changelog / Release Notes</FormLabel>
                  <FormControl><Textarea {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Publish
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
