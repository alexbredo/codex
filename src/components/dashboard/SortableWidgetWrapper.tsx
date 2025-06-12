import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Props {
  id: string;
  children: React.ReactNode;
  onRemove: (id: string) => void;
  isEditMode: boolean;
  colSpan: number;
  onColSpanChange: (id: string, colSpan: number) => void;
  className?: string;
  onConfigChange?: (id: string, newConfig: any) => void;
  config: any;
}

export const SortableWidgetWrapper: React.FC<Props> = ({ id, children, onRemove, isEditMode, colSpan, onColSpanChange, className, onConfigChange, config }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className={`relative ${className}`}>
      {isEditMode && (
        <div className="absolute top-2 right-2 z-10 flex flex-col">
          <Select value={colSpan.toString()} onValueChange={(value) => onColSpanChange(id, parseInt(value))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder={`${colSpan} Column${colSpan > 1 ? 's' : ''}`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 Column</SelectItem>
              <SelectItem value="2">2 Columns</SelectItem>
              <SelectItem value="3">3 Columns</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="destructive" size="icon" {...listeners} {...attributes}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide lucide-move"
            >
              <path d="M5 9l-3 3 3 3" />
              <path d="M9 5l3-3 3 3" />
              <path d="M15 19l-3 3-3-3" />
              <path d="M19 9l3 3-3 3" />
              <path d="M2 12h20" />
              <path d="M12 2v20" />
            </svg>
          </Button>
          <Button variant="destructive" size="icon" onClick={() => onRemove(id)}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide lucide-trash-2"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2V6" />
              <path d="M8 6V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2v2" />
              <line x1="10" x2="10" y1="11" y2="17" />
              <line x1="14" x2="14" y1="11" y2="17" />
            </svg>
          </Button>
        </div>
      )}
      {React.cloneElement(children as React.ReactElement, {isEditMode: isEditMode, onConfigChange: (newConfig: any) => onConfigChange(id, newConfig), config: config})}
    </div>
  );
};
