
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel as UiSelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { StarRatingInput } from '@/components/ui/star-rating-input';
import { Filter, XCircle, CalendarIcon as CalendarIconLucide } from 'lucide-react';
import type { Property, WorkflowWithDetails, Model, DataObject } from '@/lib/types';
import { cn, getObjectDisplayValue } from '@/lib/utils';
import { format as formatDateFns, isValid as isDateValid, startOfDay } from 'date-fns';
import { useData } from '@/contexts/data-context';


export interface ColumnFilterValue {
  value: any;
  operator?: 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'date_eq' | 'includes';
}

interface ColumnFilterPopoverProps {
  columnKey: string;
  columnName: string;
  property?: Property;
  currentWorkflow?: WorkflowWithDetails | null;
  currentFilter?: ColumnFilterValue | null;
  onFilterChange: (columnKey: string, filter: ColumnFilterValue | null) => void;
}

const INTERNAL_ANY_BOOLEAN_VALUE = "__ANY_BOOLEAN__";
const INTERNAL_ANY_WORKFLOW_STATE_VALUE = "__ANY_WORKFLOW_STATE__";
const INTERNAL_ANY_RELATIONSHIP_VALUE = "__ANY_RELATIONSHIP__";

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
}: ColumnFilterPopoverProps) {
  const { getModelById, getObjectsByModelId, models: allModels, getAllObjects } = useData();
  const [isOpen, setIsOpen] = useState(false);
  const [filterInput, setFilterInput] = useState<string | number | boolean | Date | null | undefined>(currentFilter?.value ?? '');
  const [numberOperator, setNumberOperator] = useState<'eq' | 'gt' | 'lt' | 'gte' | 'lte'>(
    (currentFilter?.operator as any) || 'eq'
  );

  const filterType = property?.type || (columnKey === 'workflowState' ? 'workflowState' : 'string');

  useEffect(() => {
    if (filterType === 'number') {
      setFilterInput(currentFilter?.value ?? '');
      setNumberOperator((currentFilter?.operator as any) || 'eq');
    } else if (filterType === 'date') {
      setFilterInput(currentFilter?.value ? new Date(currentFilter.value) : null);
    } else if (filterType === 'relationship') {
      setFilterInput(currentFilter?.value ?? INTERNAL_ANY_RELATIONSHIP_VALUE);
    }
    else {
      setFilterInput(currentFilter?.value ?? '');
    }
  }, [currentFilter, filterType]);

  const handleApplyFilter = () => {
    let finalFilterValue: any = filterInput;
    let operatorForFilter: ColumnFilterValue['operator'] | undefined = undefined;

    if (filterInput === '' || filterInput === null || filterInput === undefined) {
      if (filterType === 'boolean' && filterInput === INTERNAL_ANY_BOOLEAN_VALUE) {
        onFilterChange(columnKey, null);
      } else if (filterType === 'workflowState' && filterInput === INTERNAL_ANY_WORKFLOW_STATE_VALUE) {
        onFilterChange(columnKey, null);
      } else if (filterType === 'relationship' && filterInput === INTERNAL_ANY_RELATIONSHIP_VALUE) {
        onFilterChange(columnKey, null);
      }
      else {
        onFilterChange(columnKey, null);
      }
      setIsOpen(false);
      return;
    }
    
    switch (filterType) {
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
            if (filterInput === INTERNAL_ANY_BOOLEAN_VALUE) {
                onFilterChange(columnKey, null);
                setIsOpen(false);
                return;
            }
            finalFilterValue = filterInput === 'true';
            operatorForFilter = 'eq';
            break;
        case 'date':
            if (filterInput instanceof Date && isDateValid(filterInput)) {
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
            finalFilterValue = String(filterInput); // Selected related object ID
            operatorForFilter = property?.relationshipType === 'many' ? 'includes' : 'eq';
            break;
        default: // string, markdown, image
            operatorForFilter = 'contains';
            break;
    }

    onFilterChange(columnKey, { value: finalFilterValue, operator: operatorForFilter });
    setIsOpen(false);
  };

  const handleClearFilter = () => {
    if (filterType === 'workflowState') {
      setFilterInput(INTERNAL_ANY_WORKFLOW_STATE_VALUE);
    } else if (filterType === 'boolean') {
      setFilterInput(INTERNAL_ANY_BOOLEAN_VALUE);
    } else if (filterType === 'date') {
      setFilterInput(null);
    } else if (filterType === 'rating') {
      setFilterInput(0);
    } else if (filterType === 'relationship') {
      setFilterInput(INTERNAL_ANY_RELATIONSHIP_VALUE);
    }
     else {
      setFilterInput('');
    }
    if (filterType === 'number') setNumberOperator('eq');
    onFilterChange(columnKey, null);
    setIsOpen(false);
  };

  const renderFilterInput = () => {
    switch (filterType) {
      case 'string':
      case 'markdown':
      case 'image':
        return (
          <Input
            type="text"
            placeholder={`Filter ${columnName}...`}
            value={String(filterInput ?? '')}
            onChange={(e) => setFilterInput(e.target.value)}
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
              className="w-full"
            />
          </div>
        );
      case 'boolean':
        return (
          <Select
            value={filterInput === null || filterInput === undefined || filterInput === '' ? INTERNAL_ANY_BOOLEAN_VALUE : String(filterInput)}
            onValueChange={(val) => setFilterInput(val === INTERNAL_ANY_BOOLEAN_VALUE ? '' : val)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select True/False/Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={INTERNAL_ANY_BOOLEAN_VALUE}>Any</SelectItem>
              <SelectItem value="true">Yes</SelectItem>
              <SelectItem value="false">No</SelectItem>
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
                    {filterInput && isDateValid(new Date(filterInput as string | number | Date)) ? formatDateFns(new Date(filterInput as string | number | Date), "PPP") : <span>Pick a date</span>}
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
        if (!property?.relatedModelId) return <Input placeholder="Relationship misconfigured" disabled />;
        const relatedModel = getModelById(property.relatedModelId);
        if (!relatedModel) return <Input placeholder="Related model not found" disabled />;
        
        const relatedModelObjects = getObjectsByModelId(property.relatedModelId);
        const allDbObjects = getAllObjects();

        const options = relatedModelObjects
          .map(obj => ({
            value: obj.id,
            label: getObjectDisplayValue(obj, relatedModel, allModels, allDbObjects)
          }))
          .sort((a,b) => a.label.localeCompare(b.label));

        return (
          <Select
             value={String(filterInput ?? INTERNAL_ANY_RELATIONSHIP_VALUE)}
             onValueChange={(val) => setFilterInput(val)}
          >
            <SelectTrigger>
              <SelectValue placeholder={`Filter by ${relatedModel.name}...`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={INTERNAL_ANY_RELATIONSHIP_VALUE}>Any {relatedModel.name}</SelectItem>
              {options.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
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
