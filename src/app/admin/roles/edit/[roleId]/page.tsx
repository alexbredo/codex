
'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import RoleForm from '@/components/admin/roles/role-form';
import type { RoleFormValues } from '@/components/admin/roles/role-form-schema';
import { roleFormSchema } from '@/components/admin/roles/role-form-schema';
import { useData } from '@/contexts/data-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Role, Permission } from '@/lib/types';
import { ArrowLeft, Loader2, ShieldAlert } from 'lucide-react';
import { withAuth } from '@/contexts/auth-context';

type GroupedPermissions = Record<string, Permission[]>;

async function fetchRoleDetails(roleId: string): Promise<Role> {
  const response = await fetch(`/api/roles/${roleId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch role details.');
  }
  return response.json();
}

async function fetchAllPermissions(): Promise<GroupedPermissions> {
  const response = await fetch('/api/permissions');
  if (!response.ok) {
    throw new Error('Failed to fetch permissions.');
  }
  return response.json();
}

function EditRolePageInternal() {
  const router = useRouter();
  const params = useParams();
  const roleId = params.roleId as string;

  const { formatApiError } = useData();
  const { toast } = useToast();

  const { data: roleData, isLoading: isLoadingRole, error: roleError } = useQuery<Role>({
    queryKey: ['role', roleId],
    queryFn: () => fetchRoleDetails(roleId),
    enabled: !!roleId,
  });

  const { data: permissionsData, isLoading: isLoadingPermissions, error: permissionsError } = useQuery<GroupedPermissions>({
    queryKey: ['permissions'],
    queryFn: fetchAllPermissions,
  });

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: {
      name: '',
      description: '',
      permissionIds: [],
    },
  });

  useEffect(() => {
    if (roleData) {
      form.reset({
        name: roleData.name,
        description: roleData.description || '',
        permissionIds: roleData.permissionIds || [],
      });
    }
  }, [roleData, form]);

  const onSubmit = async (values: RoleFormValues) => {
    try {
      const response = await fetch(`/api/roles/${roleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const errorMsg = await formatApiError(response, 'Failed to update role');
        throw new Error(errorMsg);
      }

      toast({ title: "Role Updated", description: `Role "${values.name}" has been updated.` });
      router.push('/admin/roles');
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error Updating Role", description: error.message });
    }
  };

  if (isLoadingRole || isLoadingPermissions) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading role details...</p>
      </div>
    );
  }

  if (roleError || permissionsError) {
    return (
      <div className="container mx-auto py-8 text-center">
        <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-2xl font-semibold text-destructive mb-2">Error Loading Data</h2>
        <p className="text-muted-foreground mb-4">{roleError?.message || permissionsError?.message}</p>
        <Button onClick={() => router.push('/admin/roles')} className="mt-4">Back to Roles</Button>
      </div>
    );
  }

  if (!roleData) {
    return (
      <div className="container mx-auto py-8 text-center">
        <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-2xl font-semibold text-destructive mb-2">Role Not Found</h2>
        <Button onClick={() => router.push('/admin/roles')} className="mt-4">Back to Roles</Button>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-8 flex flex-col h-full">
      <Button variant="outline" onClick={() => router.push('/admin/roles')} className="mb-6 flex-shrink-0 self-start">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Role Admin
      </Button>
      <Card className="max-w-4xl mx-auto flex-grow min-h-0 flex flex-col w-full">
        <CardHeader className="flex-shrink-0">
          <CardTitle className="text-2xl">Edit Role: {roleData.name}</CardTitle>
          <CardDescription>Update the details and permissions for this role.</CardDescription>
        </CardHeader>
        <CardContent className="flex-grow min-h-0">
          <RoleForm
            form={form}
            onSubmit={onSubmit}
            onCancel={() => router.push('/admin/roles')}
            isEditing={true}
            isLoading={form.formState.isSubmitting}
            allPermissions={permissionsData || {}}
            isSystemRole={!!roleData.isSystemRole}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default withAuth(EditRolePageInternal, ['administrator']);
