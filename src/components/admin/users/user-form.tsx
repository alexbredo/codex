
'use client';

import type { UseFormReturn } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import type { UserFormValues } from './user-form-schema';
import type { Role } from '@/lib/types';
import { MultiSelectAutocomplete, type MultiSelectOption } from '@/components/ui/multi-select-autocomplete';
import { useMemo } from 'react';

interface UserFormProps {
  form: UseFormReturn<UserFormValues>;
  onSubmit: (values: UserFormValues) => void;
  onCancel: () => void;
  isEditing?: boolean;
  isLoading?: boolean;
  roles: Role[];
}

export default function UserForm({
  form,
  onSubmit,
  onCancel,
  isEditing = false,
  isLoading = false,
  roles = [],
}: UserFormProps) {

  const roleOptions: MultiSelectOption[] = useMemo(() => {
    return roles.map(role => ({
      value: role.id,
      label: role.name,
    })).sort((a,b) => a.label.localeCompare(b.label));
  }, [roles]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="Enter username" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{isEditing ? 'New Password (Optional)' : 'Password'}</FormLabel>
              <FormControl>
                <Input type="password" placeholder={isEditing ? 'Leave blank to keep current password' : 'Enter password'} {...field} />
              </FormControl>
              {isEditing && <FormDescription className="text-xs">If you want to change the password, enter a new one. Otherwise, leave this blank.</FormDescription>}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{isEditing ? 'Confirm New Password' : 'Confirm Password'}</FormLabel>
              <FormControl>
                <Input type="password" placeholder={isEditing ? 'Confirm new password (if changing)' : 'Confirm password'} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="roleIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Roles</FormLabel>
              <MultiSelectAutocomplete
                options={roleOptions}
                selected={field.value || []}
                onChange={field.onChange}
                placeholder="Select user roles..."
                emptyIndicator="No roles found."
              />
               <FormDescription className="text-xs">Assign one or more roles to this user.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end space-x-2 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading || form.formState.isSubmitting} className="bg-primary hover:bg-primary/90">
            {isLoading || form.formState.isSubmitting ? 'Saving...' : (isEditing ? 'Update User' : 'Create User')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
