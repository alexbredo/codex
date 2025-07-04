'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import type { ShareLinkType, SharedObjectLink } from '@/lib/types';
import { Loader2, Share2, ClipboardCopy, Check } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Separator } from '@/components/ui/separator';
import ShareLinkManager from './ShareLinkManager';

interface CreateShareLinkDialogProps {
  modelId: string;
  modelName?: string;
  objectId?: string | null;
  objectName?: string | null;
  activeLinkStatus?: 'view' | 'update' | 'create' | 'none';
}

const createShareLink = async (payload: {
  link_type: ShareLinkType;
  model_id: string;
  data_object_id?: string | null;
  expires_at?: string | null;
  expires_on_submit?: boolean;
}): Promise<SharedObjectLink> => {
  const response = await fetch('/api/codex-structure/share-links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to create share link.');
  }
  return response.json();
};

export default function CreateShareLinkDialog({ modelId, modelName, objectId, objectName, activeLinkStatus = 'none' }: CreateShareLinkDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [linkType, setLinkType] = useState<ShareLinkType>('view');
  const [expiration, setExpiration] = useState('7d');
  const [expiresOnSubmit, setExpiresOnSubmit] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [hasCopied, setHasCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: createShareLink,
    onSuccess: (data) => {
      const shareUrl = `${window.location.origin}/share/${data.id}`;
      setGeneratedLink(shareUrl);
      const queryKey = objectId ? ['shareLinks', objectId] : ['shareLinksForModel', modelId];
      queryClient.invalidateQueries({ queryKey: queryKey });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error Creating Link',
        description: error.message,
      });
    },
  });

  const handleSubmit = () => {
    let expiresAt: string | null = null;
    if (expiration !== 'never') {
      const date = new Date();
      if (expiration.endsWith('d')) {
        date.setDate(date.getDate() + parseInt(expiration));
      } else if (expiration.endsWith('h')) {
        date.setHours(date.getHours() + parseInt(expiration));
      }
      expiresAt = date.toISOString();
    }
    
    mutation.mutate({
      link_type: linkType,
      model_id: modelId,
      data_object_id: objectId,
      expires_at: expiresAt,
      expires_on_submit: expiresOnSubmit,
    });
  };

  const handleCopyToClipboard = () => {
    if (generatedLink) {
        navigator.clipboard.writeText(generatedLink).then(() => {
            setHasCopied(true);
            setTimeout(() => setHasCopied(false), 2000);
        });
    }
  };

  const isCreateMode = !objectId;

  React.useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setGeneratedLink('');
        setLinkType(isCreateMode ? 'create' : 'view');
        setExpiration('7d');
        setExpiresOnSubmit(false);
      }, 200);
    } else {
        setLinkType(isCreateMode ? 'create' : 'view');
    }
  }, [open, isCreateMode]);
  
  const buttonVariant = React.useMemo(() => {
    switch (activeLinkStatus) {
      case 'view': return 'share-view';
      case 'update': return 'share-update';
      case 'create': return 'share-create';
      default: return 'outline';
    }
  }, [activeLinkStatus]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={buttonVariant} size="sm">
          <Share2 className="mr-2 h-4 w-4"/>{isCreateMode ? 'Share Form' : 'Share'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Share {objectName ? `"${objectName}"` : (modelName ? `${modelName} Form` : 'Item')}</DialogTitle>
          <DialogDescription>
            {isCreateMode ? 'Generate a public link to allow others to create new entries.' : 'Manage public links to share or allow edits to this object.'}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-shrink-0 -mx-6 px-6 py-4 border-t">
          {generatedLink ? (
            <div className="space-y-4">
              <Label htmlFor="generated-link">Your Shareable Link</Label>
              <div className="relative">
                <Input id="generated-link" value={generatedLink} readOnly />
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-1/2 right-1 -translate-y-1/2 h-8 w-8"
                  onClick={handleCopyToClipboard}
                >
                  {hasCopied ? <Check className="h-4 w-4 text-green-500" /> : <ClipboardCopy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">Anyone with this link can access the content. The link expires {expiration === 'never' ? 'never' : `in ${expiration.replace('d', ' days').replace('h', ' hours')}`}.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <h4 className="font-medium text-foreground">Create New Link</h4>
              {!isCreateMode && (
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="link-type" className="text-right">Link Type</Label>
                  <Select value={linkType} onValueChange={(value) => setLinkType(value as ShareLinkType)}>
                    <SelectTrigger id="link-type" className="col-span-3">
                      <SelectValue placeholder="Select link type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="view">View-only</SelectItem>
                      <SelectItem value="update">Allow editing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="expiration" className="text-right">Expires In</Label>
                <Select value={expiration} onValueChange={setExpiration}>
                  <SelectTrigger id="expiration" className="col-span-3">
                    <SelectValue placeholder="Set expiration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1h">1 Hour</SelectItem>
                    <SelectItem value="24h">24 Hours</SelectItem>
                    <SelectItem value="7d">7 Days</SelectItem>
                    <SelectItem value="30d">30 Days</SelectItem>
                    <SelectItem value="never">Never</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                  <div />
                  <div className="col-span-3 flex items-center space-x-2">
                      <Checkbox
                          id="expires-on-submit"
                          checked={expiresOnSubmit}
                          onCheckedChange={(checked) => setExpiresOnSubmit(!!checked)}
                          disabled={linkType === 'view'}
                      />
                      <Label htmlFor="expires-on-submit" className="text-sm font-normal">
                          Single-use link (expires after first submission)
                      </Label>
                  </div>
              </div>
               <div className="grid grid-cols-4 items-center gap-4">
                  <div />
                  <div className="col-span-3">
                     <Button onClick={handleSubmit} disabled={mutation.isPending}>
                        {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Generate Link
                      </Button>
                  </div>
              </div>
            </div>
          )}
        </div>
        
        {!generatedLink && (
            <div className="flex-grow overflow-y-auto -mx-6 px-6 pt-4 border-t space-y-4">
                <div className="space-y-2">
                    <h4 className="font-medium text-foreground">Existing Links</h4>
                    <p className="text-xs text-muted-foreground">Manage existing public links for this {objectId ? 'object' : 'form'}.</p>
                </div>
                <div className="mt-4 -mx-4">
                    <ShareLinkManager modelId={modelId} objectId={objectId} />
                </div>
            </div>
        )}
        
        <DialogFooter className="flex-shrink-0 pt-4 border-t">
           <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
