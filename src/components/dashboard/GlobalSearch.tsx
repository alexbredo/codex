
'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  DatabaseZap,
  FileText,
  Loader2,
  ListFilter,
  MessageSquareQuote,
  LayoutDashboard,
  FolderKanban,
  Users,
  Workflow as WorkflowIcon,
  ShieldCheck,
  History,
  KeyRound,
  Wand2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Model, DataObject, Wizard } from '@/lib/types';
import { useData } from '@/contexts/data-context';
import { useDebounce } from '@/hooks/use-debounce';
import { useAuth } from '@/contexts/auth-context';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';


interface SearchResult {
  object: DataObject;
  model: Model;
  displayValue: string;
}

// Navigation Items for Search
const staticNavItemsBase = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'any' },
];
const adminNavItems = [
  { href: '/models', label: 'Model Admin', icon: DatabaseZap, permission: 'models:manage' },
  { href: '/model-groups', label: 'Group Admin', icon: FolderKanban, permission: 'admin:manage_model_groups' },
  { href: '/admin/workflows', label: 'Workflow Admin', icon: WorkflowIcon, permission: 'admin:manage_workflows' },
  { href: '/admin/validation-rules', label: 'Validation Rules', icon: ShieldCheck, permission: 'admin:manage_validation_rules' },
  { href: '/admin/users', label: 'User Admin', icon: Users, permission: 'users:view' },
  { href: '/admin/roles', label: 'Role Admin', icon: KeyRound, permission: 'roles:manage' },
  { href: '/admin/structural-changelog', label: 'Activity Log', icon: History, permission: 'admin:view_activity_log' },
  { href: '/admin/wizards', label: 'Wizard Admin', icon: Wand2, permission: 'admin:manage_wizards' },
];


async function fetchSearchResults(query: string): Promise<SearchResult[]> {
  if (!query) return [];
  const response = await fetch(`/api/codex-structure/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) {
    console.error("Search request failed");
    return [];
  }
  return response.json();
}

async function fetchPropertyValues(propertyName: string, modelName?: string): Promise<string[]> {
  if (!propertyName) return [];
  let url = `/api/codex-structure/properties/${propertyName}/values`;
  if (modelName) {
    url += `?modelName=${encodeURIComponent(modelName)}`;
  }
  const response = await fetch(url);
  if (!response.ok) {
    console.error("Failed to fetch property values");
    return [];
  }
  return response.json();
}


export function GlobalSearch({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const debouncedQuery = useDebounce(query, 300);

  const { models, wizards, isReady: dataIsReady } = useData();
  const { hasPermission } = useAuth();
  
  const allSearchableProperties = React.useMemo(() => {
    if (!dataIsReady) return [];
    const propertySet = new Set<string>();
    models.forEach(model => {
      model.properties.forEach(prop => {
        if (prop.type === 'string' || prop.type === 'number' || prop.type === 'boolean') {
          propertySet.add(prop.name);
        }
      });
    });
    return Array.from(propertySet).sort();
  }, [models, dataIsReady]);

  // --- Search State Logic ---
  const modelSuggestionMatch = debouncedQuery.trim().toLowerCase() === 'model:';

  const modelFilterRegex = /model:(\S+)/;
  const modelFilterMatch = debouncedQuery.match(modelFilterRegex);
  const modelNameFilter = modelFilterMatch ? modelFilterMatch[1] : undefined;

  const propertyFilterRegex = /(\w+):$/;
  const propertyFilterMatch = debouncedQuery.trim().match(propertyFilterRegex);
  const propertyNameForSuggestions = propertyFilterMatch ? propertyFilterMatch[1] : null;

  const showModelSuggestions = modelSuggestionMatch;
  const showPropertyValueSuggestions = !!propertyNameForSuggestions;
  // --- End Search State Logic ---


  const { data: results, isLoading: isLoadingSearchResults } = useQuery<SearchResult[]>({
    queryKey: ['globalSearch', debouncedQuery],
    queryFn: () => fetchSearchResults(debouncedQuery),
    enabled: !!debouncedQuery.trim() && !showModelSuggestions && !showPropertyValueSuggestions,
  });

  const { data: propertyValueSuggestions, isLoading: isLoadingPropertyValues } = useQuery<string[]>({
    queryKey: ['propertyValues', propertyNameForSuggestions, modelNameFilter],
    queryFn: () => fetchPropertyValues(propertyNameForSuggestions!, modelNameFilter),
    enabled: showPropertyValueSuggestions,
  });

  const allNavItems = React.useMemo(() => {
    return [...staticNavItemsBase, ...adminNavItems].filter(item => {
      if (item.permission === 'any') return true;
      return hasPermission(item.permission);
    });
  }, [hasPermission]);

  const filteredNavItems = React.useMemo(() => {
    if (!debouncedQuery.trim()) return [];
    const lowercasedQuery = debouncedQuery.trim().toLowerCase();
    // Exclude special filter queries like 'model:' from nav search
    if (lowercasedQuery.includes(':')) return [];
    return allNavItems.filter(item => 
      item.label.toLowerCase().includes(lowercasedQuery)
    );
  }, [debouncedQuery, allNavItems]);

  const filteredWizards = React.useMemo(() => {
    if (!debouncedQuery.trim() || debouncedQuery.includes(':')) return [];
    const lowercasedQuery = debouncedQuery.trim().toLowerCase();
    return wizards.filter(wizard =>
        wizard.name.toLowerCase().includes(lowercasedQuery) ||
        (wizard.description && wizard.description.toLowerCase().includes(lowercasedQuery))
    );
  }, [debouncedQuery, wizards]);


  React.useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  const runCommand = React.useCallback((command: () => unknown) => {
    setOpen(false);
    command();
  }, [setOpen]);

  const groupedResults = React.useMemo(() => {
    if (!results) return {};
    return results.reduce((acc, result) => {
      const modelName = result.model.name;
      if (!acc[modelName]) {
        acc[modelName] = [];
      }
      acc[modelName].push(result);
      return acc;
    }, {} as Record<string, SearchResult[]>);
  }, [results]);


  const renderContent = () => {
    // State 1: Loading main search results
    if (isLoadingSearchResults) return <CommandEmpty>Searching...</CommandEmpty>;

    // State 2: Show model suggestions for 'model:' query
    if (showModelSuggestions) {
      return (
        <CommandGroup heading="Select a model to filter by">
          {models.map(model => (
            <CommandItem key={model.id} value={model.name} onSelect={() => { setQuery(`model:${model.name} `); }}>
              <DatabaseZap className="mr-2 h-4 w-4" />
              <span>{model.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      );
    }

    // State 3: Show property value suggestions for 'prop:' query
    if (showPropertyValueSuggestions) {
      if (isLoadingPropertyValues) return <CommandEmpty>Loading suggestions...</CommandEmpty>;
      if (propertyValueSuggestions && propertyValueSuggestions.length > 0) {
        return (
          <CommandGroup heading={`Suggestions for '${propertyNameForSuggestions}'`}>
            {propertyValueSuggestions.map(value => (
              <CommandItem key={value} value={value} onSelect={() => { setQuery(`${query}${value} `); }}>
                 <MessageSquareQuote className="mr-2 h-4 w-4" />
                 <span>{value}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        );
      }
      return <CommandEmpty>No suggestions found. Continue typing a value.</CommandEmpty>;
    }
    
    // State 4: Display actual search results
    const hasObjectResults = results && results.length > 0;
    const hasNavResults = filteredNavItems.length > 0;
    const hasWizardResults = filteredWizards.length > 0;
    if (hasObjectResults || hasNavResults || hasWizardResults) {
      return (
        <>
          {hasNavResults && (
            <CommandGroup heading="Navigation">
              {filteredNavItems.map((item) => (
                <CommandItem
                  key={item.href}
                  value={item.label}
                  onSelect={() => { runCommand(() => router.push(item.href)); }}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  <span>{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {hasWizardResults && (
            <CommandGroup heading="Wizards">
              {filteredWizards.map((wizard) => (
                <CommandItem
                  key={wizard.id}
                  value={wizard.name}
                  onSelect={() => { runCommand(() => router.push(`/wizards/run/${wizard.id}`)); }}
                >
                  <Wand2 className="mr-2 h-4 w-4" />
                  <span>Run: {wizard.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {hasObjectResults && Object.entries(groupedResults).map(([modelName, items]) => (
            <CommandGroup key={modelName} heading={`Data: ${modelName}`}>
              {items.map((result) => (
                <CommandItem
                  key={result.object.id}
                  value={result.displayValue}
                  onSelect={() => { runCommand(() => router.push(`/data/${result.model.id}/view/${result.object.id}`)); }}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  <span>{result.displayValue}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </>
      )
    }
    
    // State 5: Initial state (no query)
    if (!debouncedQuery.trim()) {
      return (
        <>
          <CommandGroup heading="Suggestions">
            <CommandItem onSelect={() => setQuery('model:')}>
              <DatabaseZap className="mr-2 h-4 w-4" />
              <span>Filter by model...</span>
            </CommandItem>
            {allSearchableProperties.slice(0, 3).map(propName => (
              <CommandItem key={propName} onSelect={() => setQuery(`${propName}:`)}>
                <ListFilter className="mr-2 h-4 w-4" />
                <span>Filter by property: {propName}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          {dataIsReady && models.length > 0 && (
            <CommandGroup heading="Models">
              {models.slice(0, 5).map(model => (
                <CommandItem key={model.id} value={model.name} onSelect={() => { runCommand(() => router.push(`/data/${model.id}`)); }}>
                  <DatabaseZap className="mr-2 h-4 w-4" />
                  <span>{model.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </>
      );
    }
    
    // Final State: No results found for the query
    return <CommandEmpty>No results found for "{debouncedQuery}".</CommandEmpty>;
  };


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 shadow-lg">
         <DialogHeader className="sr-only">
             <DialogTitle>Global Search</DialogTitle>
          </DialogHeader>
        <Command
          shouldFilter={false} // We do all filtering/suggestion logic ourselves
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
        >
          <CommandInput
            placeholder="Search... (e.g., 'Task' or 'model:Project status:done')"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {renderContent()}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
