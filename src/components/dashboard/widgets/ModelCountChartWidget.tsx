
'use client';

import { useData } from '@/contexts/data-context';
import type { ModelCountChartWidgetConfig } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from 'recharts';
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig
} from "@/components/ui/chart";
import { BarChart3, ListChecks, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface ModelCountChartWidgetProps {
  config: ModelCountChartWidgetConfig;
}

export default function ModelCountChartWidget({ config }: ModelCountChartWidgetProps) {
  const { models, objects, isReady } = useData();

  if (!isReady) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            <CardTitle className="text-xl">{config.title || 'Object Distribution'}</CardTitle>
          </div>
           <CardDescription>Number of data objects per model.</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center items-center min-h-[250px]">
          <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
           <p className="ml-2 text-muted-foreground">Loading chart data...</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = models.map(model => ({
    name: model.name,
    count: objects[model.id]?.length || 0,
  })).sort((a,b) => b.count - a.count); // Sort by count descending for better viz

  const chartConfig = {
    count: {
      label: "Objects",
      color: "hsl(var(--primary))",
    },
  } satisfies ChartConfig;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          <CardTitle className="text-xl">{config.title || 'Object Distribution by Model'}</CardTitle>
        </div>
        <CardDescription>Number of data objects currently stored in each model.</CardDescription>
      </CardHeader>
      <CardContent>
        {models.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            No models defined yet. Create models to see their object distribution.
          </div>
        ) : chartData.every(d => d.count === 0) ? (
          <div className="text-center py-10">
            <ListChecks size={32} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              No data objects found in any model yet.
              <Link href="/models" className="text-primary hover:underline ml-1">Create some data</Link> to see it visualized.
            </p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="min-h-[250px] w-full">
            <RechartsBarChart
              accessibilityLayer
              data={chartData}
              margin={{ top: 5, right: 5, left: -20, bottom: 5 }} // Adjusted left margin for YAxis labels
              barGap={8}
              barCategoryGap="20%"
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                interval={0}
                height={60} // Increased height for angled labels
                angle={-35} // Angle labels
                textAnchor="end" // Anchor angled labels at the end
                className="text-xs fill-muted-foreground"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                allowDecimals={false}
                className="text-xs fill-muted-foreground"
              />
              <RechartsTooltip
                cursor={{ fill: "hsl(var(--muted))" }}
                content={<ChartTooltipContent indicator="dot" />}
              />
              <Bar
                dataKey="count"
                fill="var(--color-count)"
                radius={[4, 4, 0, 0]}
              />
            </RechartsBarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
