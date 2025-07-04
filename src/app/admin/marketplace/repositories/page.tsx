
'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { withAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, Rss, PlusCircle, Trash2, ArrowLeft, RefreshCw, AlertTriangle } from 'lucide-react';
import type { MarketplaceRepository } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

const repositoryFormSchema = z.object({
  name: z.string().min(3, "Repository name is required."),
  url: z.string().url("A valid URL is required."),
});
type RepositoryFormValues = z.infer<typeof repositoryFormSchema>;

// API Functions
async function fetchRepositories(): Promise<MarketplaceRepository[]> {
  const res = await fetch('/api/marketplace/repositories');
  if (!res.ok) throw new Error('Failed to fetch repositories.');
  return res.json();
}
async function addRepository(values: RepositoryFormValues): Promise<MarketplaceRepository> {
  const res = await fetch('/api/marketplace/repositories', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values),
  });
  if (!res.ok) { const data = await res.json(); throw new Error(data.error || 'Failed to add repository.'); }
  return res.json();
}
async function deleteRepository(id: string): Promise<void> {
  const res = await fetch(`/api/marketplace/repositories/${id}`, { method: 'DELETE' });
  if (!res.ok) { const data = await res.json(); throw new Error(data.error || 'Failed to delete repository.'); }
}
async function syncRepositories(): Promise<{ message: string, syncedRepos: number, totalItems: number }> {
  const res = await fetch('/api/marketplace/repositories/sync', { method: 'POST' });
  if (!res.ok) { const data = await res.json(); throw new Error(data.error || 'Failed to sync repositories.'); }
  return res.json();
}

function ManageRepositoriesPageInternal() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: repositories, isLoading, error } = useQuery<MarketplaceRepository[]>({
    queryKey: ['marketplaceRepositories'],
    queryFn: fetchRepositories,
  });

  const form = useForm<RepositoryFormValues>({ resolver: zodResolver(repositoryFormSchema) });

  const addMutation = useMutation({
    mutationFn: addRepository,
    onSuccess: () => {
      toast({ title: 'Repository Added', description: 'The new repository has been saved.' });
      queryClient.invalidateQueries({ queryKey: ['marketplaceRepositories'] });
      form.reset({ name: '', url: '' });
    },
    onError: (err: Error) => toast({ variant: 'destructive', title: 'Error', description: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRepository,
    onSuccess: () => {
      toast({ title: 'Repository Deleted', description: 'The repository has been removed.' });
      queryClient.invalidateQueries({ queryKey: ['marketplaceRepositories'] });
    },
    onError: (err: Error) => toast({ variant: 'destructive', title: 'Error', description: err.message }),
  });

  const syncMutation = useMutation({
    mutationFn: syncRepositories,
    onSuccess: (data) => {
        toast({ title: 'Sync Complete', description: `${data.message} Synced ${data.syncedRepos} repositories and found ${data.totalItems} items.` });
        queryClient.invalidateQueries({ queryKey: ['marketplaceRepositories'] }); // To update last checked time
        queryClient.invalidateQueries({ queryKey: ['marketplaceItems'] }); // To update items on main page
    },
    onError: (err: Error) => toast({ variant: 'destructive', title: 'Sync Failed', description: err.message }),
  });

  return (
    <div className="container mx-auto py-8">
        <div className="flex justify-between items-center mb-6">
            <Button variant="outline" asChild>
                <Link href="/admin/marketplace"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Marketplace</Link>
            </Button>
            <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                {syncMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4"/>}
                Sync All Repositories
            </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
                <Card>
                    <CardHeader><CardTitle>Add New Repository</CardTitle><CardDescription>Add a URL to another CodexStructure marketplace.</CardDescription></CardHeader>
                    <CardContent>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit((v) => addMutation.mutate(v))} className="space-y-4">
                                <FormField control={form.control} name="name" render={({ field }) => ( <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="e.g., Community Hub" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                <FormField control={form.control} name="url" render={({ field }) => ( <FormItem><FormLabel>URL</FormLabel><FormControl><Input placeholder="https://example.com/api/marketplace/items" {...field} /></FormControl><FormDescription className="text-xs">The full URL to the remote items API.</FormDescription><FormMessage /></FormItem> )} />
                                <Button type="submit" disabled={addMutation.isPending}>
                                    {addMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlusCircle className="mr-2 h-4 w-4"/>}
                                    Add Repository
                                </Button>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
            </div>
            <div className="lg:col-span-2">
                <Card>
                    <CardHeader><CardTitle>Managed Repositories</CardTitle><CardDescription>List of remote marketplaces providing installable items.</CardDescription></CardHeader>
                    <CardContent>
                        {isLoading && <div className="flex justify-center items-center py-8"><Loader2 className="mr-2 h-5 w-5 animate-spin"/> Loading...</div>}
                        {error && <div className="text-destructive"><AlertTriangle className="inline-block mr-2"/> {error.message}</div>}
                        {repositories && (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>URL</TableHead>
                                        <TableHead>Last Checked</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {repositories.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No remote repositories configured.</TableCell></TableRow>}
                                    {repositories.map(repo => (
                                        <TableRow key={repo.id}>
                                            <TableCell className="font-medium">{repo.name}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground truncate max-w-xs" title={repo.url}>{repo.url}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{repo.lastCheckedAt ? formatDistanceToNow(new Date(repo.lastCheckedAt), { addSuffix: true }) : 'Never'}</TableCell>
                                            <TableCell className="text-right">
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="hover:text-destructive"><Trash2 className="h-4 w-4"/></Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will delete the repository "{repo.name}". Any items synced from it will be removed on the next sync.</AlertDialogDescription></AlertDialogHeader>
                                                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(repo.id)}>Delete</AlertDialogAction></AlertDialogFooter>
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
        </div>
    </div>
  );
}

export default withAuth(ManageRepositoriesPageInternal, 'marketplace:manage_repositories');

    