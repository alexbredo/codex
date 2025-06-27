
'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { DatabaseZap, FileText, Loader2, ListFilter } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Model, DataObject } from '@/lib/types';
import { useData } from '@/contexts/data-context';
import { useDebounce } from '@/hooks/use-debounce';

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

async function fetchSearchResults(query: string): Promise<SearchResult[]> {
  if (!query) return [];
  const response = await fetch(`/api/codex-structure/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) {
    console.error("Search request failed");
    return [];
  }
  return response.json();
}

export function GlobalSearch({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const debouncedQuery = useDebounce(query, 300);

  const { data: results, isLoading } = useQuery<SearchResult[]>({
    queryKey: ['globalSearch', debouncedQuery],
    queryFn: () => fetchSearchResults(debouncedQuery),
    enabled: !!debouncedQuery,
  });

  const { models, isReady: dataIsReady } = useData();

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

  const allSearchableProperties = React.useMemo(() => {
    if (!dataIsReady) return [];
    const propertySet = new Set<string>();
    models.forEach(model => {
      model.properties.forEach(prop => {
        if (prop.type === 'string' || prop.type === 'number') {
          propertySet.add(prop.name);
        }
      });
    });
    return Array.from(propertySet).sort();
  }, [models, dataIsReady]);


  const handleSuggestionSelect = (suggestion: string) => {
    setQuery(prev => `${prev.trim()} ${suggestion}`);
  };


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 shadow-lg">
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
        >
          <DialogHeader className="sr-only">
             <DialogTitle>Global Search</DialogTitle>
          </DialogHeader>
          <CommandInput
            placeholder="Search... (e.g., 'Task' or 'model:Project status:done')"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {isLoading ? 'Searching...' : (debouncedQuery ? `No results found for "${debouncedQuery}".` : "Start typing to search.")}
            </CommandEmpty>

            {!isLoading && results && results.length > 0 && (
              Object.entries(groupedResults).map(([modelName, items]) => (
                <CommandGroup key={modelName} heading={modelName}>
                  {items.map((result) => (
                    <CommandItem
                      key={result.object.id}
                      value={result.displayValue}
                      onSelect={() => {
                        runCommand(() => router.push(`/data/${result.model.id}/view/${result.object.id}`));
                      }}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      <span>{result.displayValue}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            )}

            {!isLoading && !debouncedQuery && (
              <CommandGroup heading="Suggestions">
                <CommandItem onSelect={() => handleSuggestionSelect('model:')}>
                  <DatabaseZap className="mr-2 h-4 w-4" />
                  <span>Filter by model...</span>
                </CommandItem>
                {allSearchableProperties.slice(0, 5).map(propName => (
                  <CommandItem key={propName} onSelect={() => handleSuggestionSelect(`${propName}:`)}>
                    <ListFilter className="mr-2 h-4 w-4" />
                    <span>Filter by property: {propName}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
