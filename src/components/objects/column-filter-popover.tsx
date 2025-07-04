
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel as UiSelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { StarRatingInput } from '@/components/ui/star-rating-input';
import { Filter, XCircle, CalendarIcon as CalendarIconLucide, Check, ChevronsUpDown } from 'lucide-react';
import type { Property, WorkflowWithDetails, Model, DataObject } from '@/lib/types';
import { cn, getObjectDisplayValue } from '@/lib/utils';
import { format as formatDateFns, isValid as isDateValidFn, startOfDay, isEqual as isEqualDate } from 'date-fns';
import { useData } from '@/contexts/data-context';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useDebounce } from '@/hooks/use-debounce';
import { useQuery } from '@tanstack/react-query';


export interface ColumnFilterValue {
  value: any;
  operator?: 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'date_eq' | 'includes' | 'specific_incoming_reference';
}

interface ColumnFilterPopoverProps {
  columnKey: string;
  columnName: string;
  property?: Property;
  currentWorkflow?: WorkflowWithDetails | null;
  currentFilter?: ColumnFilterValue | null;
  onFilterChange: (columnKey: string, filter: ColumnFilterValue | null) => void;
  filterTypeOverride?: 'incomingRelationshipCount' | 'specificIncomingReference'; // Updated
  referencingModel?: Model; // New prop
  referencingProperty?: Property; // New prop
}

const INTERNAL_ANY_BOOLEAN_VALUE = "__ANY_BOOLEAN__";
const INTERNAL_ANY_WORKFLOW_STATE_VALUE = "__ANY_WORKFLOW_STATE__";
const INTERNAL_ANY_RELATIONSHIP_VALUE = "__ANY_RELATIONSHIP__";
const INTERNAL_NO_REFERENCES_VALUE = "__NO_REFERENCES__"; // New constant

const NUMBER_OPERATORS = [
  { value: 'eq', label: 'Equals' },
  { value: 'gte', label: '>=' },
  { value: 'lte', label: '<=' },
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
];


export default function ColumnFilterPopover({
  columnKey,
  columnName,
  property,
  currentWorkflow,
  currentFilter,
  onFilterChange,
  filterTypeOverride,
  referencingModel, // New prop
  referencingProperty, // New prop
}: ColumnFilterPopoverProps) {
  const { getModelById, getObjectsByModelId, models: allModels, getAllObjects } = useData();
  const [isOpen, setIsOpen] = useState(false);
  const [filterInput, setFilterInput] = useState<string | number | boolean | Date | null | undefined>(currentFilter?.value ?? '');
  const [numberOperator, setNumberOperator] = useState<'eq' | 'gt' | 'lt' | 'gte' | 'lte'>(
    (currentFilter?.operator as any) || 'eq'
  );

  const [customSearchValue, setCustomSearchValue] = useState("");
  const debouncedSearch = useDebounce(customSearchValue, 300);

  const effectiveFilterType = filterTypeOverride || property?.type || (columnKey === 'workflowState' ? 'workflowState' : 'string');

  const { data: relationshipOptions, isLoading: isLoadingRelationshipOptions } = useQuery({
    queryKey: ['relationship-filter-search', property?.id, referencingProperty?.id, debouncedSearch],
    queryFn: async () => {
        const modelForSearch = property ? getModelById(property.relatedModelId || '') : referencingModel;
        const propNameForSearch = property ? property.name : referencingProperty?.name;

        if (!modelForSearch || !propNameForSearch) return [];

        const response = await fetch(`/api/codex-structure/properties/${propNameForSearch}/values?modelName=${encodeURIComponent(modelForSearch.name)}&searchTerm=${encodeURIComponent(debouncedSearch)}`);
        if (!response.ok) return [];
        const data = await response.json();
        return data.map((item: {id: string, displayValue: string}) => ({ value: item.id, label: item.displayValue }));
    },
    enabled: isOpen && (effectiveFilterType === 'relationship' || effectiveFilterType === 'specificIncomingReference'),
  });


  useEffect(() => {
    if (effectiveFilterType === 'number') {
      setFilterInput(currentFilter?.value ?? '');
      setNumberOperator((currentFilter?.operator as any) || 'eq');
    } else if (effectiveFilterType === 'date') {
      setFilterInput(currentFilter?.value ? new Date(currentFilter.value) : null);
    } else if (effectiveFilterType === 'relationship' || effectiveFilterType === 'specificIncomingReference') {
      setFilterInput(currentFilter?.value ?? INTERNAL_ANY_RELATIONSHIP_VALUE);
    } else if (effectiveFilterType === 'boolean' || effectiveFilterType === 'incomingRelationshipCount') {
      setFilterInput(currentFilter?.value === undefined || currentFilter?.value === null || currentFilter?.value === '' ? INTERNAL_ANY_BOOLEAN_VALUE : String(currentFilter.value));
    }
    else {
      setFilterInput(currentFilter?.value ?? '');
    }
  }, [currentFilter, effectiveFilterType]);

  const handleApplyFilter = () => {
    let finalFilterValue: any = filterInput;
    let operatorForFilter: ColumnFilterValue['operator'] | undefined = undefined;

    if (filterInput === '' || filterInput === null || filterInput === undefined) {
      if ((effectiveFilterType === 'boolean' || effectiveFilterType === 'incomingRelationshipCount') && filterInput === INTERNAL_ANY_BOOLEAN_VALUE) {
        onFilterChange(columnKey, null);
      } else if (effectiveFilterType === 'workflowState' && filterInput === INTERNAL_ANY_WORKFLOW_STATE_VALUE) {
        onFilterChange(columnKey, null);
      } else if ((effectiveFilterType === 'relationship' || effectiveFilterType === 'specificIncomingReference') && filterInput === INTERNAL_ANY_RELATIONSHIP_VALUE) {
        onFilterChange(columnKey, null);
      }
      else {
        onFilterChange(columnKey, null);
      }
      setIsOpen(false);
      return;
    }
    
    switch (effectiveFilterType) {
        case 'number':
            finalFilterValue = parseFloat(String(filterInput));
            if (isNaN(finalFilterValue)) {
                onFilterChange(columnKey, null);
                setIsOpen(false);
                return;
            }
            operatorForFilter = numberOperator;
            break;
        case 'boolean':
        case 'incomingRelationshipCount': 
            if (filterInput === INTERNAL_ANY_BOOLEAN_VALUE) {
                onFilterChange(columnKey, null);
                setIsOpen(false);
                return;
            }
            finalFilterValue = filterInput === 'true';
            operatorForFilter = 'eq'; // Or a specific operator for this type if needed
            break;
        case 'date':
            if (filterInput instanceof Date && isDateValidFn(filterInput)) {
              finalFilterValue = startOfDay(filterInput).toISOString();
              operatorForFilter = 'date_eq';
            } else {
              onFilterChange(columnKey, null);
              setIsOpen(false);
              return;
            }
            break;
        case 'rating':
            finalFilterValue = Number(filterInput);
            operatorForFilter = 'eq';
            break;
        case 'workflowState':
            if (filterInput === INTERNAL_ANY_WORKFLOW_STATE_VALUE) {
                onFilterChange(columnKey, null);
                setIsOpen(false);
                return;
            }
            finalFilterValue = String(filterInput);
            operatorForFilter = 'eq';
            break;
        case 'relationship':
            if (filterInput === INTERNAL_ANY_RELATIONSHIP_VALUE) {
                onFilterChange(columnKey, null);
                setIsOpen(false);
                return;
            }
            finalFilterValue = String(filterInput); 
            operatorForFilter = property?.relationshipType === 'many' ? 'includes' : 'eq';
            break;
        case 'specificIncomingReference':
            if (filterInput === INTERNAL_ANY_RELATIONSHIP_VALUE) {
                onFilterChange(columnKey, null);
            } else {
                finalFilterValue = String(filterInput); // This will be an object ID or INTERNAL_NO_REFERENCES_VALUE
                operatorForFilter = 'specific_incoming_reference';
                onFilterChange(columnKey, { value: finalFilterValue, operator: operatorForFilter });
            }
            setIsOpen(false);
            return; // Return early as onFilterChange is called within
        default: // string, markdown, image
            operatorForFilter = 'contains';
            break;
    }

    onFilterChange(columnKey, { value: finalFilterValue, operator: operatorForFilter });
    setIsOpen(false);
  };

  const handleClearFilter = () => {
    if (effectiveFilterType === 'workflowState') {
      setFilterInput(INTERNAL_ANY_WORKFLOW_STATE_VALUE);
    } else if (effectiveFilterType === 'boolean' || effectiveFilterType === 'incomingRelationshipCount') {
      setFilterInput(INTERNAL_ANY_BOOLEAN_VALUE);
    } else if (effectiveFilterType === 'date') {
      setFilterInput(null);
    } else if (effectiveFilterType === 'rating') {
      setFilterInput(0);
    } else if (effectiveFilterType === 'relationship' || effectiveFilterType === 'specificIncomingReference') {
      setFilterInput(INTERNAL_ANY_RELATIONSHIP_VALUE);
    }
     else {
      setFilterInput('');
    }
    if (effectiveFilterType === 'number') setNumberOperator('eq');
    onFilterChange(columnKey, null);
    setIsOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleApplyFilter();
    }
  };

  const renderFilterInput = () => {
    switch (effectiveFilterType) {
      case 'string':
      case 'markdown':
      case 'image':
        return (
          <Input
            type="text"
            placeholder={`Filter ${columnName}...`}
            value={String(filterInput ?? '')}
            onChange={(e) => setFilterInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full"
          />
        );
      case 'number':
        return (
          <div className="flex items-center space-x-2">
            <Select value={numberOperator} onValueChange={(val) => setNumberOperator(val as any)}>
              <SelectTrigger className="w-[100px]">
                <SelectValue placeholder="Op" />
              </SelectTrigger>
              <SelectContent>
                {NUMBER_OPERATORS.map(op => (
                  <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              step={property?.precision ? (1 / Math.pow(10, property.precision)) : "any"}
              placeholder="Value"
              value={String(filterInput ?? '')}
              onChange={(e) => setFilterInput(e.target.value === '' ? '' : parseFloat(e.target.value))}
              onKeyDown={handleKeyDown}
              className="w-full"
            />
          </div>
        );
      case 'boolean':
      // Fallthrough for incomingRelationshipCount as it uses the same Yes/No/Any logic initially
      case 'incomingRelationshipCount':
        return (
          <Select
            value={filterInput === null || filterInput === undefined || filterInput === '' ? INTERNAL_ANY_BOOLEAN_VALUE : String(filterInput)}
            onValueChange={(val) => setFilterInput(val === INTERNAL_ANY_BOOLEAN_VALUE ? '' : val)}
          >
            <SelectTrigger>
              <SelectValue placeholder={effectiveFilterType === 'boolean' ? "Select True/False/Any" : "Filter reference existence..."} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={INTERNAL_ANY_BOOLEAN_VALUE}>Any</SelectItem>
              <SelectItem value="true">{effectiveFilterType === 'boolean' ? 'Yes' : 'Has references'}</SelectItem>
              <SelectItem value="false">{effectiveFilterType === 'boolean' ? 'No' : 'No references'}</SelectItem>
            </SelectContent>
          </Select>
        );
      case 'date':
        return (
            <Popover>
                <PopoverTrigger asChild>
                <Button
                    variant={"outline"}
                    className={cn(
                    "w-full justify-start text-left font-normal",
                    !filterInput && "text-muted-foreground"
                    )}
                >
                    <CalendarIconLucide className="mr-2 h-4 w-4" />
                    {filterInput && isDateValidFn(new Date(filterInput as string | number | Date)) ? formatDateFns(new Date(filterInput as string | number | Date), "PPP") : <span>Pick a date</span>}
                </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                <Calendar
                    mode="single"
                    selected={filterInput instanceof Date ? filterInput : undefined}
                    onSelect={(date) => setFilterInput(date || null)}
                    initialFocus
                />
                </PopoverContent>
            </Popover>
        );
      case 'rating':
        return (
            <div className="flex flex-col items-center">
                <StarRatingInput
                    value={Number(filterInput) || 0}
                    onChange={(val) => setFilterInput(val)}
                />
                {Number(filterInput) > 0 && (
                    <Button variant="ghost" size="xs" className="mt-1 text-xs" onClick={() => setFilterInput(0)}>Clear Rating</Button>
                )}
            </div>
        );
      case 'workflowState':
        if (!currentWorkflow) return <Input placeholder="No workflow active" disabled />;
        return (
          <Select
            value={filterInput === null || filterInput === undefined || filterInput === '' ? INTERNAL_ANY_WORKFLOW_STATE_VALUE : String(filterInput)}
            onValueChange={(val) => setFilterInput(val === INTERNAL_ANY_WORKFLOW_STATE_VALUE ? '' : val)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select state..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={INTERNAL_ANY_WORKFLOW_STATE_VALUE}>Any State</SelectItem>
              {currentWorkflow.states.map((state) => (
                <SelectItem key={state.id} value={state.id}>
                  {state.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'relationship':
      case 'specificIncomingReference': {
        const modelForSearch = property ? getModelById(property.relatedModelId || '') : referencingModel;
        if (!modelForSearch) return <Input placeholder="Relationship misconfigured" disabled />;
        
        return (
          <Command>
            <CommandInput placeholder={`Filter by ${modelForSearch.name}...`} value={customSearchValue} onValueChange={setCustomSearchValue} />
            <CommandList>
              {isLoadingRelationshipOptions && <div className="text-center text-sm p-2">Loading...</div>}
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup>
                <CommandItem onSelect={() => setFilterInput(INTERNAL_ANY_RELATIONSHIP_VALUE)}>Any {modelForSearch.name}</CommandItem>
                {effectiveFilterType === 'specificIncomingReference' && (
                  <CommandItem onSelect={() => setFilterInput(INTERNAL_NO_REFERENCES_VALUE)}>No References</CommandItem>
                )}
                {(relationshipOptions || []).map(option => (
                  <CommandItem key={option.value} onSelect={() => setFilterInput(option.value)}>{option.label}</CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        );
      }
      default:
        return <Input placeholder="Unsupported filter type" disabled />;
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className={cn(
            "p-1 h-auto ml-1 text-muted-foreground hover:text-foreground",
            currentFilter && "text-primary hover:text-primary/90"
          )}
          title={`Filter by ${columnName}`}
        >
          <Filter className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-4 space-y-3" align="start">
        <p className="text-sm font-medium">Filter by {columnName}</p>
        {renderFilterInput()}
        <div className="flex justify-end space-x-2 pt-2">
          <Button variant="outline" size="sm" onClick={handleClearFilter}>
            Clear
          </Button>
          <Button size="sm" onClick={handleApplyFilter}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
