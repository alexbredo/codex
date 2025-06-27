
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { useData } from '@/contexts/data-context';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Loader2, Shield, PlusCircle, Edit, Trash2, KeyRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

interface RoleWithCounts extends Role {
  userCount: number;
  permissionCount: number;
}
interface Role {
  id: string;
  name: string;
  description?: string;
  isSystemRole?: boolean;
}

async function fetchRolesWithCounts(): Promise<RoleWithCounts[]> {
  const response = await fetch('/api/roles');
  if (!response.ok) {
    throw new Error('Failed to fetch roles.');
  }
  return response.json();
}

function RoleAdminPageInternal() {
  const router = useRouter();
  const { toast } = useToast();
  const { formatApiError } = useData();
  const { hasPermission } = useAuth();

  const { data: roles, isLoading, error, refetch } = useQuery<RoleWithCounts[]>({
    queryKey: ['rolesWithCounts'],
    queryFn: fetchRolesWithCounts,
  });

  const handleDeleteRole = async (roleId: string, roleName: string) => {
    try {
      const response = await fetch(`/api/roles/${roleId}`, { method: 'DELETE' });
      if (!response.ok) {
        const errorMsg = await formatApiError(response, `Failed to delete role "${roleName}"`);
        throw new Error(errorMsg);
      }
      toast({ title: "Role Deleted", description: `Role "${roleName}" has been deleted.` });
      refetch(); // Refetch the list of roles
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error Deleting Role', description: err.message });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading roles...</p>
      </div>
    );
  }

  if (error) {
    return <div className="text-center text-destructive">Error: {error.message}</div>;
  }

  return (
    <div className="container mx-auto py-8">
      <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="text-center md:text-left">
          <h1 className="text-3xl font-bold text-primary flex items-center">
            <Shield className="mr-3 h-8 w-8" /> Role Administration
          </h1>
          <p className="text-muted-foreground">Manage user roles and their associated permissions.</p>
        </div>
        {hasPermission('roles:manage') && (
            <Button onClick={() => router.push('/admin/roles/new')} className="bg-accent text-accent-foreground hover:bg-accent/90">
                <PlusCircle className="mr-2 h-4 w-4" /> Create Role
            </Button>
        )}
      </header>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-center">Users</TableHead>
                <TableHead className="text-center">Permissions</TableHead>
                <TableHead className="text-right w-[150px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles?.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">
                    {role.name}
                    {role.isSystemRole && <Badge variant="secondary" className="ml-2 text-xs">System</Badge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground truncate max-w-xs">{role.description || 'N/A'}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={role.userCount > 0 ? "default" : "outline"} className="w-16 justify-center">
                      {role.userCount}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                     <Badge variant={role.permissionCount > 0 ? "default" : "outline"} className="w-16 justify-center">
                        {role.permissionCount}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {hasPermission('roles:manage') && (
                        <>
                        <Link href={`/admin/roles/edit/${role.id}`}>
                            <Button variant="ghost" size="icon" className="mr-2 hover:text-primary">
                                <Edit className="h-4 w-4" />
                            </Button>
                        </Link>
                        {!role.isSystemRole && (
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="hover:text-destructive">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                    This will permanently delete the "{role.name}" role. This action cannot be undone.
                                    You cannot delete a role if users are still assigned to it.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteRole(role.id, role.name)}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
                        </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default withAuth(RoleAdminPageInternal, 'roles:manage');
