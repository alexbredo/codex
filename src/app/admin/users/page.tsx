
'use client';

import { useEffect, useState, useCallback } from 'react';
import { withAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Users as UsersIcon, ShieldAlert } from 'lucide-react';
import { useData } from '@/contexts/data-context';

interface User {
  id: string;
  username: string;
  role: 'user' | 'administrator';
}

function UserAdminPageInternal() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { fetchData, isReady: dataContextIsReady, formatApiError } = useData();

  useEffect(() => {
    // Fetch general data when component mounts
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

  useEffect(() => {
    // Also fetch users specifically for this page if data context is ready
    if (dataContextIsReady) {
      fetchUsersApi();
    }
  }, [fetchUsersApi, dataContextIsReady]);

  const handleRoleChange = async (userId: string, newRole: 'user' | 'administrator') => {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!response.ok) {
        const errorMsg = await formatApiError(response, 'Failed to update user role');
        throw new Error(errorMsg);
      }
      const updatedUser: User = await response.json();
      setUsers(prevUsers => prevUsers.map(u => (u.id === updatedUser.id ? updatedUser : u)));
      toast({ title: 'User Role Updated', description: `Role for ${updatedUser.username} set to ${updatedUser.role}.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error updating role', description: err.message });
    }
  };

  if (!dataContextIsReady || isLoading) {
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
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <UsersIcon className="mr-3 h-6 w-6 text-primary" /> User Administration
          </CardTitle>
          <CardDescription>Manage user accounts and their roles within the application.</CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-muted-foreground">No users found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Current Role</TableHead>
                  <TableHead className="w-[200px]">Change Role</TableHead>
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
                    <TableCell>
                      <Select
                        value={user.role}
                        onValueChange={(newRole) => handleRoleChange(user.id, newRole as 'user' | 'administrator')}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select new role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="administrator">Administrator</SelectItem>
                        </SelectContent>
                      </Select>
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
