
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { DataObject, Model } from '@/lib/types';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { format as formatDateFns, isValid as isDateValidFn, startOfDay, isSameMonth } from 'date-fns';
import { getObjectDisplayValue } from '@/lib/utils';
import { useData } from '@/contexts/data-context';
import { cn } from '@/lib/utils';
import { type Modifiers } from 'react-day-picker';

interface CalendarViewProps {
  model: Model;
  objects: DataObject[];
}

export default function CalendarView({ model, objects }: CalendarViewProps) {
  const router = useRouter();
  const { allModels, getAllObjects } = useData();
  const [month, setMonth] = React.useState<Date>(new Date());
  
  const allDbObjects = React.useMemo(() => getAllObjects(), [getAllObjects]);

  const dateProperty = React.useMemo(() => {
    return model.properties.find(p => p.type === 'date' || p.type === 'datetime');
  }, [model.properties]);

  const eventsByDate = React.useMemo(() => {
    if (!dateProperty) return new Map();

    const map = new Map<string, DataObject[]>();
    objects.forEach(obj => {
      const dateValue = obj[dateProperty.name];
      if (dateValue && isDateValidFn(new Date(dateValue))) {
        const dayString = formatDateFns(startOfDay(new Date(dateValue)), 'yyyy-MM-dd');
        if (!map.has(dayString)) {
          map.set(dayString, []);
        }
        map.get(dayString)!.push(obj);
      }
    });
    return map;
  }, [objects, dateProperty]);

  if (!dateProperty) {
    return (
      <Card>
        <CardHeader><CardTitle>Calendar View Unavailable</CardTitle></CardHeader>
        <CardContent><p>This model does not have a 'date' or 'datetime' property to display on the calendar.</p></CardContent>
      </Card>
    );
  }

  // Custom Day component to render events
  function CustomDay({ date, displayMonth, modifiers }: { date: Date; displayMonth: Date; modifiers: Modifiers }) {
    const dayKey = formatDateFns(startOfDay(date), 'yyyy-MM-dd');
    const eventsForDay = eventsByDate.get(dayKey) || [];

    const isOutside = !isSameMonth(date, displayMonth);
    const dayNumber = formatDateFns(date, 'd');

    return (
      <div className={cn(
        "h-full flex flex-col p-1.5", 
        isOutside && "opacity-50",
        (modifiers?.saturday || modifiers?.sunday) && "bg-muted/50"
      )}>
        <div className={cn(
          "text-right text-xs mb-1",
          modifiers?.sunday && "text-red-600 font-semibold"
        )}>
          {dayNumber}
        </div>
        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {eventsForDay.length > 0 && (
            <div className="space-y-1">
              {eventsForDay.slice(0, 3).map(event => (
                <Popover key={event.id}>
                  <PopoverTrigger asChild>
                    <div className="text-xs bg-primary text-primary-foreground p-1 rounded-sm cursor-pointer hover:bg-primary/90 truncate">
                      {getObjectDisplayValue(event, model, allModels, allDbObjects)}
                    </div>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2" side="bottom" align="start">
                    <div className="font-bold text-sm mb-2">{getObjectDisplayValue(event, model, allModels, allDbObjects)}</div>
                    <p className="text-xs text-muted-foreground">{dateProperty?.name}: {formatDateFns(new Date(event[dateProperty!.name]), 'PP')}</p>
                    <Button
                        size="xs"
                        variant="outline"
                        className="w-full mt-3"
                        onClick={() => router.push(`/data/${model.id}/view/${event.id}`)}
                    >
                        View Details
                    </Button>
                  </PopoverContent>
                </Popover>
              ))}
              {eventsForDay.length > 3 && (
                <div className="text-xs text-muted-foreground mt-1">+ {eventsForDay.length - 3} more</div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <Calendar
        mode="single" // 'single' mode is required but we'll control the visual selection
        selected={undefined} // No day is "selected" in the traditional sense
        month={month}
        onMonthChange={setMonth}
        weekStartsOn={1} // Start week on Monday
        modifiers={{ saturday: { dayOfWeek: [6] }, sunday: { dayOfWeek: [0] } }}
        className="p-0"
        classNames={{
          months: "w-full",
          month: "w-full space-y-0",
          caption: "flex justify-center pt-4 pb-2 relative items-center text-lg font-medium",
          table: "w-full border-collapse",
          head_row: "flex border-b",
          head_cell: "text-muted-foreground w-full py-2 text-sm font-normal",
          row: 'flex w-full border-b last:border-b-0',
          cell: "h-32 text-center text-sm p-0 relative focus-within:relative focus-within:z-20 w-full [&:not(:last-child)]:border-r",
          day: "h-full w-full p-0 font-normal focus:outline-none focus:ring-1 focus:ring-ring rounded-none",
        }}
        components={{
          Day: CustomDay,
        }}
      />
    </Card>
  );
}
