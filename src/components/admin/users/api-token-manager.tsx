
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, KeyRound, PlusCircle, Trash2, ClipboardCopy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface ApiToken {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string | null;
}

interface ApiTokenManagerProps {
  userId: string;
  username: string;
}

async function fetchApiTokens(userId: string): Promise<ApiToken[]> {
  const response = await fetch(`/api/users/${userId}/tokens`);
  if (!response.ok) throw new Error('Failed to fetch API tokens.');
  return response.json();
}

async function createApiToken(userId: string, name: string): Promise<ApiToken & { token: string }> {
  const response = await fetch(`/api/users/${userId}/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to create token.');
  }
  return response.json();
}

async function deleteApiToken(userId: string, tokenId: string) {
  const response = await fetch(`/api/users/${userId}/tokens/${tokenId}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to revoke token.');
}

export default function ApiTokenManager({ userId, username }: ApiTokenManagerProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newTokenName, setNewTokenName] = useState('');
  const [newlyGeneratedToken, setNewlyGeneratedToken] = useState<string | null>(null);
  const [hasCopied, setHasCopied] = useState(false);

  const { data: tokens, isLoading, error } = useQuery<ApiToken[]>({
    queryKey: ['apiTokens', userId],
    queryFn: () => fetchApiTokens(userId),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => createApiToken(userId, name),
    onSuccess: (data) => {
      setNewlyGeneratedToken(data.token);
      queryClient.invalidateQueries({ queryKey: ['apiTokens', userId] });
      setNewTokenName('');
    },
    onError: (err: Error) => {
      toast({ variant: 'destructive', title: 'Error Creating Token', description: err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (tokenId: string) => deleteApiToken(userId, tokenId),
    onSuccess: () => {
      toast({ title: 'Token Revoked', description: 'The API token has been successfully revoked.' });
      queryClient.invalidateQueries({ queryKey: ['apiTokens', userId] });
    },
    onError: (err: Error) => {
      toast({ variant: 'destructive', title: 'Error Revoking Token', description: err.message });
    },
  });
  
  const handleCopyToClipboard = () => {
    if (newlyGeneratedToken) {
        navigator.clipboard.writeText(newlyGeneratedToken).then(() => {
            setHasCopied(true);
            setTimeout(() => setHasCopied(false), 2000);
        });
    }
  };

  return (
    <div>
      {newlyGeneratedToken ? (
        <div className="space-y-4">
            <h3 className="font-semibold text-lg text-primary">New API Token Generated</h3>
            <p className="text-sm text-muted-foreground">Please copy this token now. You won't be able to see it again.</p>
            <div className="relative">
                <Input readOnly value={newlyGeneratedToken} className="pr-10 font-mono text-xs" />
                <Button size="icon" variant="ghost" className="absolute top-1/2 right-1 -translate-y-1/2 h-8 w-8" onClick={handleCopyToClipboard}>
                    {hasCopied ? <Check className="h-4 w-4 text-green-500" /> : <ClipboardCopy className="h-4 w-4" />}
                </Button>
            </div>
            <Button onClick={() => setNewlyGeneratedToken(null)}>Done</Button>
        </div>
      ) : (
        <>
            <Card>
                <CardHeader>
                <CardTitle className="text-lg">Create New Token</CardTitle>
                <CardDescription>Tokens allow programmatic access to the API on behalf of '{username}'.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-2">
                        <Input
                            placeholder="A descriptive name (e.g., 'My Script')"
                            value={newTokenName}
                            onChange={(e) => setNewTokenName(e.target.value)}
                            disabled={createMutation.isPending}
                        />
                        <Button onClick={() => createMutation.mutate(newTokenName)} disabled={!newTokenName || createMutation.isPending}>
                            {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                            Create
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="mt-6">
                <h3 className="text-md font-semibold mb-2">Active Tokens</h3>
                {isLoading && <div className="flex items-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Loading tokens...</div>}
                {error && <div className="text-destructive">Error: {error.message}</div>}
                {tokens && (
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead>Last Used</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {tokens.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No active tokens for this user.</TableCell></TableRow>}
                        {tokens.map(token => (
                            <TableRow key={token.id}>
                            <TableCell className="font-medium">{token.name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(token.createdAt), { addSuffix: true })}</TableCell>
                             <TableCell className="text-xs text-muted-foreground">
                                {token.lastUsedAt ? formatDistanceToNow(new Date(token.lastUsedAt), { addSuffix: true }) : 'Never'}
                            </TableCell>
                            <TableCell className="text-right">
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" className="hover:text-destructive" disabled={deleteMutation.isPending}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                        <AlertDialogDescription>This will permanently revoke the token "{token.name}". This action cannot be undone.</AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => deleteMutation.mutate(token.id)}>Revoke Token</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </TableCell>
                            </TableRow>
                        ))}
                        </TableBody>
                    </Table>
                )}
            </div>
        </>
      )}
    </div>
  );
}
