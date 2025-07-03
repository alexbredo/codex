'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SharedObjectLink } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trash2, ClipboardCopy, Check, FileWarning } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface ShareLinkManagerProps {
  modelId: string;
  objectId?: string | null;
}

async function fetchShareLinks({ modelId, objectId }: ShareLinkManagerProps): Promise<SharedObjectLink[]> {
  const queryParams = new URLSearchParams();
  if (objectId) queryParams.append('data_object_id', objectId);
  else if (modelId) queryParams.append('model_id', modelId);

  // If no specific identifier is provided, don't fetch.
  if (!objectId && !modelId) return [];

  const response = await fetch(`/api/codex-structure/share-links?${queryParams.toString()}`);
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to fetch share links');
  }
  return response.json();
}

async function deleteShareLink(linkId: string) {
  const response = await fetch(`/api/codex-structure/share-links/${linkId}`, { method: 'DELETE' });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to revoke link');
  }
}

export default function ShareLinkManager({ modelId, objectId }: ShareLinkManagerProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [copiedLinkId, setCopiedLinkId] = React.useState<string | null>(null);

  const queryKey = objectId ? ['shareLinks', objectId] : ['shareLinksForModel', modelId];

  const { data: links, isLoading, error } = useQuery<SharedObjectLink[]>({
    queryKey: queryKey,
    queryFn: () => fetchShareLinks({ modelId, objectId }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteShareLink,
    onSuccess: () => {
      toast({ title: 'Link Revoked', description: 'The share link has been successfully deleted.' });
      queryClient.invalidateQueries({ queryKey: queryKey });
    },
    onError: (err: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    },
  });

  const handleCopyLink = (linkId: string) => {
    const shareUrl = `${window.location.origin}/share/${linkId}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedLinkId(linkId);
      setTimeout(() => setCopiedLinkId(null), 2000);
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-6 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading Existing Links...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-destructive py-6">
        <FileWarning className="mx-auto h-8 w-8 mb-2" />
        <p className="text-sm">{error.message}</p>
      </div>
    );
  }
  
  if (!links || links.length === 0) {
    return <p className="text-center text-sm text-muted-foreground py-4">No active share links for this {objectId ? 'object' : 'form'}.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {links.map(link => {
          const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
          return (
            <TableRow key={link.id}>
              <TableCell><Badge variant="outline" className="capitalize">{link.link_type}</Badge></TableCell>
              <TableCell className="text-xs">
                {formatDistanceToNow(new Date(link.created_at), { addSuffix: true })}<br/>
                <span className="text-muted-foreground">by {link.created_by_username || 'Unknown'}</span>
              </TableCell>
              <TableCell className="text-xs">{link.expires_at ? format(new Date(link.expires_at), 'PP p') : 'Never'}</TableCell>
              <TableCell>
                <Badge variant={isExpired ? 'destructive' : 'default'} className={isExpired ? '' : 'bg-green-600 hover:bg-green-700'}>
                  {isExpired ? 'Expired' : 'Active'}
                </Badge>
              </TableCell>
              <TableCell className="text-right space-x-1">
                 <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleCopyLink(link.id)} title="Copy Link">
                    {copiedLinkId === link.id ? <Check className="h-4 w-4 text-green-500" /> : <ClipboardCopy className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => deleteMutation.mutate(link.id)} disabled={deleteMutation.isPending} title="Revoke Link">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
