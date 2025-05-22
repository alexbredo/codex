
"use client";

import * as React from "react";
import { Check, X, ChevronsUpDown } from "lucide-react"; // Removed PlusCircle as it's not used

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  // CommandSeparator, // Removed as it's not used
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "./scroll-area";

export type MultiSelectOption = {
  value: string;
  label: string;
};

interface MultiSelectAutocompleteProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
  emptyIndicator?: string | React.ReactNode;
}

export function MultiSelectAutocomplete({
  options,
  selected,
  onChange,
  placeholder = "Select items...",
  className,
  emptyIndicator = "No items found.",
}: MultiSelectAutocompleteProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");

  const handleSelect = (value: string) => {
    if (!selected.includes(value)) {
      onChange([...selected, value]);
    }
  };

  const handleDeselect = (value: string) => {
    onChange(selected.filter((s) => s !== value));
  };

  const selectedObjects = selected
    .map(value => options.find(option => option.value === value))
    .filter(Boolean) as MultiSelectOption[];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild className={cn("w-full", className)}>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-auto min-h-10"
          onClick={() => setOpen(!open)}
        >
          <div className="flex gap-1 flex-wrap">
            {selectedObjects.length > 0 ? (
              selectedObjects.map((item) => (
                <Badge
                  variant="secondary"
                  key={item.value}
                  className="mr-1 mb-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeselect(item.value);
                  }}
                >
                  {item.label}
                  <X className="ml-1 h-3 w-3 cursor-pointer" />
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput
            placeholder="Search items..."
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandList>
            <CommandEmpty>{emptyIndicator}</CommandEmpty>
            <ScrollArea className="max-h-60">
              <CommandGroup>
                {options.map((option) => {
                  const isSelected = selected.includes(option.value);
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.value} // Changed from option.label to option.value
                      onSelect={() => {
                        if (isSelected) {
                          handleDeselect(option.value);
                        } else {
                          handleSelect(option.value);
                        }
                        setInputValue("");
                      }}
                      className="flex items-center justify-between"
                    >
                      {option.label}
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
