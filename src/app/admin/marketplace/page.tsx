
'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { withAuth } from '@/contexts/auth-context';
import { useData } from '@/contexts/data-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldCheck, Store, Download, AlertTriangle, Info } from 'lucide-react';
import type { MarketplaceItem, MarketplaceItemType, ValidationRuleset } from '@/lib/types';
import semver from 'semver';

// Define the shape of the metadata we fetch for the list view
type MarketplaceItemMetadata = Omit<MarketplaceItem, 'versions'>;

// API Fetching Functions
async function fetchMarketplaceItems(): Promise<MarketplaceItemMetadata[]> {
  const response = await fetch('/api/marketplace/items');
  if (!response.ok) throw new Error('Failed to fetch marketplace items.');
  return response.json();
}

async function fetchMarketplaceItemDetails(itemId: string): Promise<MarketplaceItem> {
  const response = await fetch(`/api/marketplace/items/${itemId}`);
  if (!response.ok) throw new Error('Failed to fetch item details.');
  return response.json();
}

async function installItem(item: MarketplaceItem): Promise<any> {
    const response = await fetch('/api/marketplace/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Installation failed.');
    }
    return response.json();
}


function MarketplacePageInternal() {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { validationRulesets, fetchData } = useData();

    const { data: items, isLoading, error } = useQuery<MarketplaceItemMetadata[]>({
        queryKey: ['marketplaceItems'],
        queryFn: fetchMarketplaceItems,
    });
    
    const installMutation = useMutation({
        mutationFn: async (itemId: string) => {
            const itemToInstall = await fetchMarketplaceItemDetails(itemId);
            return installItem(itemToInstall);
        },
        onSuccess: async (data) => {
            toast({ title: 'Installation Success', description: data.message });
            // Refetch data context to get the new/updated items
            await fetchData('After Marketplace Install');
            // Invalidate this query to reflect any version changes if we were showing them
            await queryClient.invalidateQueries({ queryKey: ['marketplaceItems'] });
        },
        onError: (err: Error) => {
            toast({ variant: 'destructive', title: 'Installation Failed', description: err.message });
        },
    });

    const getIconForItemType = (type: MarketplaceItemType) => {
        switch (type) {
            case 'validation_rule': return <ShieldCheck className="h-6 w-6 text-primary" />;
            default: return <Info className="h-6 w-6 text-primary" />;
        }
    };

    const isItemInstalled = (item: MarketplaceItemMetadata): { installed: boolean; localPayload: any } => {
        if (item.type === 'validation_rule') {
            const latestVersion = (item as any).versions?.[0]?.payload as ValidationRuleset | undefined;
            if (!latestVersion) return { installed: false, localPayload: null };

            const localRule = validationRulesets.find(vr => vr.id === latestVersion.id);
            return { installed: !!localRule, localPayload: localRule };
        }
        return { installed: false, localPayload: null };
    };

    if (isLoading) {
        return (
            <div className="flex flex-col justify-center items-center h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p className="text-lg text-muted-foreground">Loading Marketplace...</p>
            </div>
        );
    }
    
    if (error) {
        return (
             <div className="container mx-auto py-8 text-center">
                <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
                <h2 className="text-2xl font-semibold text-destructive mb-2">Error Loading Marketplace</h2>
                <p className="text-muted-foreground mb-4">{error.message}</p>
            </div>
        );
    }

  return (
    <div className="container mx-auto py-8">
      <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="text-center md:text-left">
          <h1 className="text-3xl font-bold text-primary flex items-center">
            <Store className="mr-3 h-8 w-8" /> Marketplace
          </h1>
          <p className="text-muted-foreground">Install pre-built components into your instance.</p>
        </div>
      </header>

      {items && items.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map(item => {
                const { installed } = isItemInstalled(item);
                const buttonText = installed ? "Re-install / Update" : "Install";

                return (
                    <Card key={item.id} className="flex flex-col shadow-lg hover:shadow-xl transition-shadow duration-300">
                        <CardHeader>
                            <div className="flex justify-between items-start gap-4">
                                {getIconForItemType(item.type)}
                                <Badge variant="outline">v{item.latestVersion}</Badge>
                            </div>
                            <CardTitle className="text-xl pt-2">{item.name}</CardTitle>
                            <CardDescription>{item.description || 'No description provided.'}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-grow">
                            <p className="text-xs text-muted-foreground">Author: {item.author || 'Unknown'}</p>
                            <p className="text-xs text-muted-foreground">Type: {item.type.replace('_', ' ')}</p>
                        </CardContent>
                        <CardFooter>
                            <Button
                                className="w-full"
                                onClick={() => installMutation.mutate(item.id)}
                                disabled={installMutation.isPending && installMutation.variables === item.id}
                            >
                                {installMutation.isPending && installMutation.variables === item.id ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Download className="mr-2 h-4 w-4" />
                                )}
                                {buttonText}
                            </Button>
                        </CardFooter>
                    </Card>
                );
            })}
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-lg">
            <Info className="mx-auto h-12 w-12 mb-4" />
            <h3 className="text-xl font-semibold text-foreground">Marketplace is Empty</h3>
            <p className="mt-2">Publish some components like Validation Rules to see them here.</p>
        </div>
      )}
    </div>
  );
}

export default withAuth(MarketplacePageInternal, 'marketplace:install');
