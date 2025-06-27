
'use client';

import type { UseFormReturn } from 'react-hook-form';
import { useForm, Controller } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import type { RoleFormValues } from './role-form-schema';
import type { Permission } from '@/lib/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';

interface RoleFormProps {
  form: UseFormReturn<RoleFormValues>;
  onSubmit: (values: RoleFormValues) => void;
  onCancel: () => void;
  isLoading?: boolean;
  isEditing?: boolean;
  isSystemRole?: boolean;
  allPermissions: Record<string, Permission[]>;
}

export default function RoleForm({
  form,
  onSubmit,
  onCancel,
  isLoading,
  isEditing,
  isSystemRole,
  allPermissions,
}: RoleFormProps) {
  const permissionCategories = Object.keys(allPermissions).sort();

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 h-full flex flex-col">
        <ScrollArea className="flex-grow pr-4 -mr-4">
          <div className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Content Editor, Sales Manager" {...field} disabled={isSystemRole} />
                  </FormControl>
                  {isSystemRole && <FormDescription>System role name cannot be changed.</FormDescription>}
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
                    <Textarea placeholder="A brief description of this role's purpose." {...field} value={field.value ?? ''} disabled={isSystemRole} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <FormLabel>Permissions</FormLabel>
              <FormDescription>Select the permissions this role should have.</FormDescription>
              <FormField
                control={form.control}
                name="permissionIds"
                render={({ field }) => (
                  <FormItem className="mt-2 rounded-md border p-4">
                    <div className="mb-4 flex items-center space-x-2">
                       <Checkbox
                          id="select-all-permissions"
                          disabled={isSystemRole}
                          checked={field.value?.length === Object.values(allPermissions).flat().length}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              const allIds = Object.values(allPermissions).flat().map(p => p.id);
                              field.onChange(allIds);
                            } else {
                              field.onChange([]);
                            }
                          }}
                        />
                        <label htmlFor="select-all-permissions" className="text-sm font-medium leading-none">
                            Select All Permissions
                        </label>
                    </div>

                    <Accordion type="multiple" className="w-full" defaultValue={permissionCategories}>
                      {permissionCategories.map((category) => (
                        <AccordionItem value={category} key={category}>
                          <AccordionTrigger className="text-base">{category}</AccordionTrigger>
                          <AccordionContent className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                            {allPermissions[category].map((permission) => (
                              <FormField
                                key={permission.id}
                                control={form.control}
                                name="permissionIds"
                                render={({ field: permissionField }) => (
                                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                    <FormControl>
                                      <Checkbox
                                        disabled={isSystemRole}
                                        checked={permissionField.value?.includes(permission.id)}
                                        onCheckedChange={(checked) => {
                                          return checked
                                            ? permissionField.onChange([...(permissionField.value || []), permission.id])
                                            : permissionField.onChange(
                                                (permissionField.value || []).filter(
                                                  (value) => value !== permission.id
                                                )
                                              );
                                        }}
                                      />
                                    </FormControl>
                                    <FormLabel className="font-normal">{permission.name}</FormLabel>
                                  </FormItem>
                                )}
                              />
                            ))}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                     <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </ScrollArea>
        <div className="flex justify-end space-x-2 pt-4 border-t flex-shrink-0">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading || form.formState.isSubmitting} className="bg-primary hover:bg-primary/90">
            {isLoading || form.formState.isSubmitting ? 'Saving...' : (isEditing ? 'Update Role' : 'Create Role')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
