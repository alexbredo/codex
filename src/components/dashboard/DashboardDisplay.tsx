 'use client';

import type { WidgetInstance, SpecificWidgetConfig } from '@/lib/types';
import DataSummaryWidget from './widgets/DataSummaryWidget';
import ModelCountChartWidget from './widgets/ModelCountChartWidget';
import QuickStartWidget from './widgets/QuickStartWidget';
import NumericSummaryWidget from './widgets/NumericSummaryWidget';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, arrayMove } from '@dnd-kit/sortable';
import { SortableWidgetWrapper } from './SortableWidgetWrapper';

interface DashboardDisplayProps {
  widgets: WidgetInstance[];
  isEditMode: boolean;
  onRemoveWidget: (id: string) => void;
  onWidgetsChange: (widgets: WidgetInstance[]) => void;
}

// Helper to get column span class
const getColSpanClass = (colSpan?: number): string => {
  switch (colSpan) {
    case 1: return 'md:col-span-1';
    case 2: return 'md:col-span-2';
    case 3: return 'md:col-span-3';
    default: return 'md:col-span-1'; // Default to 1 if not specified or invalid
  }
};

// Helper to get row span class (simplified for now)
const getRowSpanClass = (rowSpan?: number): string => {
  switch (rowSpan) {
    case 1: return 'md:row-span-1';
    case 2: return 'md:row-span-2';
    // Add more cases if needed
    default: return 'md:row-span-1';
  }
};


export default function DashboardDisplay({ widgets, isEditMode, onRemoveWidget, onWidgetsChange }: DashboardDisplayProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  if (!widgets || widgets.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-10">
        <p>This dashboard is empty.</p>
        {/* TODO: Add a button or link to configure the dashboard */}
      </div>
    );
  }

  // Sort widgets by order, then by ID for stable sort
  const sortedWidgets = [...widgets].sort((a, b) => {
    const orderA = a.gridConfig.order ?? Infinity;
    const orderB = b.gridConfig.order ?? Infinity;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.id.localeCompare(b.id);
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over) {
      const oldIndex = widgets.findIndex(widget => widget.id === active.id);
      const newIndex = widgets.findIndex(widget => widget.id === over.id);

      if (oldIndex !== newIndex) {
        const newWidgets = arrayMove(widgets, oldIndex, newIndex).map((widget, index) => ({
          ...widget,
          gridConfig: { ...widget.gridConfig, order: index },
        }));
        onWidgetsChange(newWidgets);
      }
    }
  };

  const handleColSpanChange = (widgetId: string, colSpan: number) => {
    const newWidgets = widgets.map(widget => {
      if (widget.id === widgetId) {
        return {
          ...widget,
          gridConfig: { ...widget.gridConfig, colSpan: colSpan },
        };
      } else {
        return widget;
      }
    });
    onWidgetsChange(newWidgets);
  };

  const handleConfigChange = (widgetId: string, newConfig: SpecificWidgetConfig) => {
    const newWidgets = widgets.map(widget => {
      if (widget.id === widgetId) {
        return {
          ...widget,
          config: newConfig,
        };
      } else {
        return widget;
      }
    });
    onWidgetsChange(newWidgets);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sortedWidgets.map(widget => widget.id)}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {sortedWidgets.map((widget) => {
            const colSpanClass = getColSpanClass(widget.gridConfig.colSpan);
            const rowSpanClass = getRowSpanClass(widget.gridConfig.rowSpan);
            const widgetWrapperClass = `rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-300 ${rowSpanClass}`;

            let content;
            switch (widget.type) {
              case 'dataSummary':
                content = <DataSummaryWidget config={widget.config} />;
                break;
              case 'modelCountChart':
                content = <ModelCountChartWidget config={widget.config} />;
                break;
              case 'quickStart':
                content = <QuickStartWidget config={widget.config} />;
                break;
              case 'numericSummary':
                content = <NumericSummaryWidget config={widget.config} isEditMode={isEditMode} onConfigChange={(newConfig) => handleConfigChange(widget.id, newConfig)} />;
                break;
              default:
                content = (
                  <Card className={widgetWrapperClass}>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium text-destructive">Unknown Widget Type</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">Widget type "{widget.type}" is not recognized.</p>
                    </CardContent>
                  </Card>
                );
                return (
                  <SortableWidgetWrapper
                    key={widget.id}
                    id={widget.id}
                    onRemove={onRemoveWidget}
                    isEditMode={isEditMode}
                    colSpan={widget.gridConfig.colSpan ?? 1}
                    onColSpanChange={handleColSpanChange}
                    className={colSpanClass}
                    config={widget.config}
                    onConfigChange={handleConfigChange}
                  >
                    {content}
                  </SortableWidgetWrapper>
                );
            }
            // For known widget types, their components should handle their own Card structure if needed.
            // Or, we can wrap them in a generic Card here if they don't.
            return (
              <SortableWidgetWrapper
                key={widget.id}
                id={widget.id}
                onRemove={onRemoveWidget}
                isEditMode={isEditMode}
                colSpan={widget.gridConfig.colSpan ?? 1}
                onColSpanChange={handleColSpanChange}
                    className={colSpanClass}
                config={widget.config}
                onConfigChange={handleConfigChange}
              >
                {content}
              </SortableWidgetWrapper>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
