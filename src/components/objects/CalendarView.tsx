
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { DataObject, Model } from '@/lib/types';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format as formatDateFns, isValid as isDateValidFn, startOfDay } from 'date-fns';
import { getObjectDisplayValue } from '@/lib/utils';
import { useData } from '@/contexts/data-context';
import { Calendar as CalendarIcon, FileText } from 'lucide-react';

interface CalendarViewProps {
  model: Model;
  objects: DataObject[];
}

export default function CalendarView({ model, objects }: CalendarViewProps) {
  const router = useRouter();
  const { allModels, getAllObjects } = useData();
  const [date, setDate] = React.useState<Date | undefined>(new Date());
  
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

  const eventDays = React.useMemo(() => Array.from(eventsByDate.keys()).map(dayStr => new Date(dayStr)), [eventsByDate]);
  
  const selectedDayEvents = date ? eventsByDate.get(formatDateFns(startOfDay(date), 'yyyy-MM-dd')) || [] : [];
  
  const modifiers = {
    events: eventDays,
  };
  
  const modifiersClassNames = {
    events: 'text-primary bg-primary/10 rounded-full',
  };

  if (!dateProperty) {
    return (
      <Card>
        <CardHeader><CardTitle>Calendar View Unavailable</CardTitle></CardHeader>
        <CardContent><p>This model does not have a 'date' or 'datetime' property to display on the calendar.</p></CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="md:col-span-2">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          className="p-0"
          classNames={{
            root: 'w-full',
            months: 'w-full',
            month: 'w-full space-y-4',
            table: 'w-full border-collapse space-y-1',
            head_row: 'flex justify-around',
            row: 'flex w-full mt-2 justify-around',
          }}
          modifiers={modifiers}
          modifiersClassNames={modifiersClassNames}
        />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Events for {date ? formatDateFns(date, 'PPP') : 'N/A'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-96">
            {selectedDayEvents.length > 0 ? (
              <ul className="space-y-2">
                {selectedDayEvents.map(obj => (
                  <li key={obj.id}>
                    <button
                      onClick={() => router.push(`/data/${model.id}/view/${obj.id}`)}
                      className="w-full text-left p-2 rounded-md hover:bg-accent"
                    >
                      <p className="font-semibold text-primary truncate">{getObjectDisplayValue(obj, model, allModels, allDbObjects)}</p>
                      <p className="text-xs text-muted-foreground">
                        {obj.createdAt ? `Created: ${formatDateFns(new Date(obj.createdAt), 'Pp')}` : ''}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                <CalendarIcon className="h-12 w-12 mx-auto mb-3" />
                <p>No events for the selected date.</p>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
