
'use client';

import * as React from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/use-debounce';
import { useRouter } from 'next/navigation';
import { DatabaseZap, FileText, Loader2, ListFilter } from 'lucide-react';
import type { Model, DataObject } from '@/lib/types';
import { useData } from '@/contexts/data-context';

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
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search... (e.g., 'Task' or 'model:Project status:done')"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {isLoading && (
          <div className="p-4 flex justify-center items-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span>Searching...</span>
          </div>
        )}

        {!isLoading && debouncedQuery && (!results || results.length === 0) && (
          <CommandEmpty>No results found for "{debouncedQuery}".</CommandEmpty>
        )}
        
        {Object.entries(groupedResults).map(([modelName, items]) => (
            <CommandGroup key={modelName} heading={modelName}>
                {items.map((result) => (
                    <CommandItem
                        key={result.object.id}
                        value={`${result.object.id}-${result.displayValue}`}
                        onSelect={() => {
                            runCommand(() => router.push(`/data/${result.model.id}/view/${result.object.id}`));
                        }}
                    >
                        <FileText className="mr-2 h-4 w-4" />
                        <span>{result.displayValue}</span>
                    </CommandItem>
                ))}
            </CommandGroup>
        ))}

        {!debouncedQuery && (
          <>
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
          </>
        )}

      </CommandList>
    </CommandDialog>
  );
}
