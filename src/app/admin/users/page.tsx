
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { withAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, Users as UsersIcon, ShieldAlert, PlusCircle, Edit, Trash2 } from 'lucide-react';
import { useData } from '@/contexts/data-context';
import UserForm from '@/components/admin/users/user-form';
import type { UserFormValues } from '@/components/admin/users/user-form-schema';
import { userFormSchema, updateUserFormSchema } from '@/components/admin/users/user-form-schema';

interface User {
  id: string;
  username: string;
  role: 'user' | 'administrator';
}

function UserAdminPageInternal() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true); // For user list specific loading
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const { toast } = useToast();
  const { fetchData, isReady: dataContextIsReady, formatApiError } = useData();

  const form = useForm<UserFormValues>({
    resolver: zodResolver(editingUser ? updateUserFormSchema : userFormSchema),
    defaultValues: {
      username: '',
      password: '',
      confirmPassword: '',
      role: 'user',
    },
  });

  // Effect for fetching general context data
  useEffect(() => {
    fetchData('Navigated to User Admin');
  }, [fetchData]);

  const fetchUsersApi = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/users');
      if (!response.ok) {
        const errorMsg = await formatApiError(response, 'Failed to fetch users');
        throw new Error(errorMsg);
      }
      const data: User[] = await response.json();
      setUsers(data);
    } catch (err: any) {
      setError(err.message);
      toast({ variant: 'destructive', title: 'Error fetching users', description: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [toast, formatApiError]);

  // Effect for fetching the user list
  useEffect(() => {
    if (dataContextIsReady) {
      fetchUsersApi();
    }
  }, [dataContextIsReady, fetchUsersApi]); 
  
  useEffect(() => {
    form.reset({
      username: editingUser?.username || '',
      password: '', // Always clear password fields
      confirmPassword: '',
      role: editingUser?.role || 'user',
    });
    // Update resolver when editingUser changes
    form.resolver = zodResolver(editingUser ? updateUserFormSchema : userFormSchema) as any;
  }, [editingUser, form, isFormOpen]);


  const handleCreateNew = () => {
    setEditingUser(null);
    setIsFormOpen(true);
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setIsFormOpen(true);
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    try {
      const response = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      if (!response.ok) {
        const errorMsg = await formatApiError(response, `Failed to delete user ${username}`);
        throw new Error(errorMsg);
      }
      toast({ title: 'User Deleted', description: `User "${username}" has been deleted.` });
      fetchUsersApi(); // Refresh list
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error Deleting User', description: err.message });
    }
  };

  const onSubmitUserForm = async (values: UserFormValues) => {
    try {
      let response;
      const payload: Partial<UserFormValues> = { username: values.username, role: values.role };
      if (values.password && values.password.trim() !== '') {
        payload.password = values.password;
      }

      if (editingUser) {
        response = await fetch(`/api/users/${editingUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        response = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const errorMsg = await formatApiError(response, `Failed to ${editingUser ? 'update' : 'create'} user`);
        throw new Error(errorMsg);
      }
      
      toast({ title: `User ${editingUser ? 'Updated' : 'Created'}`, description: `User "${values.username}" has been successfully ${editingUser ? 'updated' : 'created'}.` });
      setIsFormOpen(false);
      fetchUsersApi(); // Refresh list
    } catch (err: any) {
      toast({ variant: 'destructive', title: `Error ${editingUser ? 'Updating' : 'Creating'} User`, description: err.message });
    }
  };

  if (!dataContextIsReady || isLoading) { // Check both general context readiness and user list loading
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading user list...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8 text-center">
         <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h2 className="text-2xl font-semibold text-destructive mb-2">Error Loading Users</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={fetchUsersApi}>Try Again</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center">
            <UsersIcon className="mr-3 h-8 w-8 text-primary" />
            <div>
                <h1 className="text-3xl font-bold text-primary">User Administration</h1>
                <p className="text-muted-foreground">Manage user accounts and their roles.</p>
            </div>
        </div>
        <Button onClick={handleCreateNew} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <PlusCircle className="mr-2 h-4 w-4" /> Create User
        </Button>
      </header>

      <Dialog open={isFormOpen} onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) setEditingUser(null);
      }}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Edit User' : 'Create New User'}</DialogTitle>
            <DialogDescription>
              {editingUser ? `Update details for user "${editingUser.username}".` : 'Fill in the details to create a new user.'}
            </DialogDescription>
          </DialogHeader>
          <UserForm
            form={form}
            onSubmit={onSubmitUserForm}
            onCancel={() => { setIsFormOpen(false); setEditingUser(null); }}
            isEditing={!!editingUser}
            isLoading={form.formState.isSubmitting}
          />
        </DialogContent>
      </Dialog>
      
      <Card>
        <CardContent className="pt-6">
          {users.length === 0 ? (
            <p className="text-muted-foreground">No users found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right w-[150px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.username}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        user.role === 'administrator' ? 'bg-primary/20 text-primary' : 'bg-secondary text-secondary-foreground'
                      }`}>
                        {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleEditUser(user)} className="mr-2 hover:text-primary">
                        <Edit className="h-4 w-4" />
                      </Button>
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
                              This action cannot be undone. This will permanently delete the user "{user.username}".
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteUser(user.id, user.username)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default withAuth(UserAdminPageInternal, ['administrator']);
