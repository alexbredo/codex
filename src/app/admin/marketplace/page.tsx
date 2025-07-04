
'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { withAuth } from '@/contexts/auth-context';
import { useData } from '@/contexts/data-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldCheck, Store, Download, AlertTriangle, Info, CheckCircle, Rss, UploadCloud, Workflow as WorkflowIcon, Search, X } from 'lucide-react';
import type { MarketplaceItem, MarketplaceItemType, ValidationRuleset, WorkflowWithDetails } from '@/lib/types';
import Link from 'next/link';
import semver from 'semver';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';


// It now includes the source of the item (local/remote) and the payload.
type MarketplaceItemMetadata = Omit<MarketplaceItem, 'versions'> & {
  latestVersionPayload: any;
  source: 'local' | 'remote';
  sourceRepositoryName?: string;
};

// Enum for installation status
enum InstallStatus {
  NotInstalled,
  Installed, // An older or modified version is installed
  UpToDate,
}

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
    const { validationRulesets, workflows, fetchData } = useData();

    const [expandedItemId, setExpandedItemId] = React.useState<string | null>(null);

    // Filter and search state
    const [searchTerm, setSearchTerm] = React.useState('');
    const [filterType, setFilterType] = React.useState<MarketplaceItemType | 'all'>('all');
    const [filterSource, setFilterSource] = React.useState<'all' | 'local' | 'remote'>('all');

    const { data: items, isLoading, error } = useQuery<MarketplaceItemMetadata[]>({
        queryKey: ['marketplaceItems'],
        queryFn: fetchMarketplaceItems,
    });
    
    const { data: expandedItemDetails, isLoading: isLoadingDetails } = useQuery<MarketplaceItem>({
      queryKey: ['marketplaceItemDetails', expandedItemId],
      queryFn: () => fetchMarketplaceItemDetails(expandedItemId!),
      enabled: !!expandedItemId,
    });
    
    const installMutation = useMutation({
        mutationFn: async (itemId: string) => {
            const itemToInstall = await fetchMarketplaceItemDetails(itemId);
            return installItem(itemToInstall);
        },
        onSuccess: async (data) => {
            toast({ title: 'Installation Success', description: data.message });
            await fetchData('After Marketplace Install');
            await queryClient.invalidateQueries({ queryKey: ['marketplaceItems'] });
        },
        onError: (err: Error) => {
            toast({ variant: 'destructive', title: 'Installation Failed', description: err.message });
        },
    });

    const filteredItems = React.useMemo(() => {
        if (!items) return [];
        return items.filter(item => {
            const searchTermLower = searchTerm.toLowerCase();
            const searchMatch = (
                item.name.toLowerCase().includes(searchTermLower) ||
                (item.description && item.description.toLowerCase().includes(searchTermLower)) ||
                (item.author && item.author.toLowerCase().includes(searchTermLower))
            );

            const typeMatch = filterType === 'all' || item.type === filterType;
            const sourceMatch = filterSource === 'all' || item.source === filterSource;

            return searchMatch && typeMatch && sourceMatch;
        });
    }, [items, searchTerm, filterType, filterSource]);

    const handleClearFilters = () => {
        setSearchTerm('');
        setFilterType('all');
        setFilterSource('all');
    };

    const hasActiveFilters = searchTerm || filterType !== 'all' || filterSource !== 'all';


    const getIconForItemType = (type: MarketplaceItemType) => {
        switch (type) {
            case 'validation_rule': return <ShieldCheck className="h-6 w-6 text-primary" />;
            case 'workflow': return <WorkflowIcon className="h-6 w-6 text-primary" />;
            default: return <Info className="h-6 w-6 text-primary" />;
        }
    };
    
    const getItemInstallStatus = (item: MarketplaceItemMetadata): InstallStatus => {
      if (item.type === 'validation_rule') {
        const marketplaceRule = item.latestVersionPayload as ValidationRuleset | null;
        if (!marketplaceRule?.id) {
          return InstallStatus.NotInstalled; // Cannot determine status if payload is invalid
        }
        
        const localRule = validationRulesets.find(vr => vr.id === marketplaceRule.id);
        
        if (!localRule) return InstallStatus.NotInstalled;

        if (!localRule.marketplaceVersion) {
            if ( localRule.name === marketplaceRule.name && localRule.description === marketplaceRule.description && localRule.regexPattern === marketplaceRule.regexPattern) return InstallStatus.UpToDate;
            return InstallStatus.Installed;
        }

        try {
            if (semver.gt(item.latestVersion, localRule.marketplaceVersion)) return InstallStatus.Installed;
            return InstallStatus.UpToDate;
        } catch (e) {
            console.error("semver comparison failed:", e);
            if ( localRule.name === marketplaceRule.name && localRule.description === marketplaceRule.description && localRule.regexPattern === marketplaceRule.regexPattern) return InstallStatus.UpToDate;
            return InstallStatus.Installed;
        }
      }
      if (item.type === 'workflow') {
        const marketplaceWorkflow = item.latestVersionPayload as WorkflowWithDetails | null;
        if (!marketplaceWorkflow?.id) {
          return InstallStatus.NotInstalled;
        }
        
        const localWorkflow = workflows.find(wf => wf.id === marketplaceWorkflow.id);
        
        if (!localWorkflow) return InstallStatus.NotInstalled;

        if (!localWorkflow.marketplaceVersion) {
            return InstallStatus.Installed; // Workflows are complex, if there's no version, assume it's updatable.
        }

        try {
            if (semver.gt(item.latestVersion, localWorkflow.marketplaceVersion)) return InstallStatus.Installed;
            return InstallStatus.UpToDate;
        } catch (e) {
            console.error("semver comparison failed for workflow:", e);
            return InstallStatus.Installed;
        }
      }
      return InstallStatus.NotInstalled;
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
      <header className="flex flex-col justify-between items-start mb-8 gap-6">
        <div className="flex justify-between w-full items-center">
          <div className="text-left">
            <h1 className="text-3xl font-bold text-primary flex items-center">
              <Store className="mr-3 h-8 w-8" /> Marketplace
            </h1>
            <p className="text-muted-foreground">Install pre-built components into your instance.</p>
          </div>
          <Link href="/admin/marketplace/repositories" passHref>
              <Button variant="outline"><Rss className="mr-2 h-4 w-4"/> Manage Repositories</Button>
          </Link>
        </div>

        <div className="w-full flex flex-col md:flex-row gap-4 items-end p-4 border rounded-lg bg-card shadow-sm">
            <div className="flex-grow w-full md:w-auto">
                <Label htmlFor="search-marketplace">Search</Label>
                <div className="relative mt-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                        id="search-marketplace"
                        placeholder="Search by name, description..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 w-full"
                    />
                </div>
            </div>
            <div className="flex-grow w-full md:w-auto">
              <Label htmlFor="filter-type">Type</Label>
              <Select value={filterType} onValueChange={(val) => setFilterType(val as any)}>
                <SelectTrigger id="filter-type" className="mt-1">
                  <SelectValue placeholder="Filter by type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="validation_rule">Validation Rule</SelectItem>
                  <SelectItem value="workflow">Workflow</SelectItem>
                </SelectContent>
              </Select>
            </div>
             <div className="flex-grow w-full md:w-auto">
              <Label htmlFor="filter-source">Source</Label>
              <Select value={filterSource} onValueChange={(val) => setFilterSource(val as any)}>
                <SelectTrigger id="filter-source" className="mt-1">
                  <SelectValue placeholder="Filter by source..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="remote">Remote</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {hasActiveFilters && (
                <Button variant="ghost" onClick={handleClearFilters}>
                    <X className="mr-2 h-4 w-4" /> Clear
                </Button>
            )}
        </div>
      </header>
      
      {items && items.length > 0 ? (
        filteredItems.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map(item => {
                const status = getItemInstallStatus(item);
                let buttonText = 'Install';
                let buttonDisabled = false;
                let buttonIcon = <Download className="mr-2 h-4 w-4" />;

                if (status === InstallStatus.UpToDate) {
                  buttonText = 'Installed';
                  buttonDisabled = true;
                  buttonIcon = <CheckCircle className="mr-2 h-4 w-4" />;
                } else if (status === InstallStatus.Installed) {
                  buttonText = 'Update';
                }

                return (
                    <Card key={item.id} className="flex flex-col shadow-lg hover:shadow-xl transition-shadow duration-300">
                        <CardHeader>
                            <div className="flex justify-between items-start gap-4">
                                {getIconForItemType(item.type)}
                                <div className="flex items-center gap-2">
                                  {item.source === 'remote' && (
                                    <Badge variant="outline" title={`From: ${item.sourceRepositoryName}`} className="text-xs flex items-center gap-1 border-blue-500/50 text-blue-600">
                                      <Rss className="h-3 w-3"/> Remote
                                    </Badge>
                                  )}
                                  <Badge variant="outline">v{item.latestVersion}</Badge>
                                </div>
                            </div>
                            <CardTitle className="text-xl pt-2">{item.name}</CardTitle>
                            <CardDescription>{item.description || 'No description provided.'}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-grow">
                            <p className="text-xs text-muted-foreground">Author: {item.author || 'Unknown'}</p>
                            <p className="text-xs text-muted-foreground capitalize">Type: {item.type.replace(/_/g, ' ')}</p>
                        </CardContent>

                        <Accordion type="single" collapsible className="w-full px-2" onValueChange={setExpandedItemId}>
                            <AccordionItem value={item.id} className="border-b-0">
                                <AccordionTrigger className="text-sm py-2 px-4 hover:no-underline text-muted-foreground hover:text-primary">
                                    Version History
                                </AccordionTrigger>
                                <AccordionContent>
                                    {isLoadingDetails && expandedItemId === item.id && <div className="p-4 text-center"><Loader2 className="h-4 w-4 animate-spin"/></div>}
                                    {expandedItemDetails && expandedItemId === item.id && (
                                        <ScrollArea className="h-32 px-4">
                                            <div className="space-y-3">
                                                {expandedItemDetails.versions.map((version) => (
                                                    <div key={version.version}>
                                                        <div className="flex justify-between items-center font-semibold text-xs">
                                                            <Badge variant="secondary">v{version.version}</Badge>
                                                            <span className="text-muted-foreground">{format(new Date(version.publishedAt), 'PP')}</span>
                                                        </div>
                                                        <p className="mt-1 text-xs text-muted-foreground">{version.changelog || 'No changelog provided.'}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                    )}
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                        
                        <CardFooter>
                            <Button
                                className="w-full"
                                onClick={() => installMutation.mutate(item.id)}
                                disabled={buttonDisabled || (installMutation.isPending && installMutation.variables === item.id)}
                            >
                                {installMutation.isPending && installMutation.variables === item.id ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    buttonIcon
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
                <h3 className="text-xl font-semibold text-foreground">No Items Found</h3>
                <p className="mt-2">Your search or filters did not match any marketplace items.</p>
                {hasActiveFilters && <Button variant="outline" className="mt-4" onClick={handleClearFilters}>Clear Filters</Button>}
            </div>
        )
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
