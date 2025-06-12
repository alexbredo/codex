
'use client';

import { useData } from '@/contexts/data-context';
import type { DataSummaryWidgetConfig } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DatabaseZap, ListChecks, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface DataSummaryWidgetProps {
  config: DataSummaryWidgetConfig;
}

export default function DataSummaryWidget({ config }: DataSummaryWidgetProps) {
  const { models, objects, getModelById, isReady } = useData();

  if (!isReady) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{config.title || 'Data Summary'}</CardTitle>
          <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">Loading...</div>
          <p className="text-xs text-muted-foreground">Fetching data.</p>
        </CardContent>
      </Card>
    );
  }

  let count = 0;
  let description = '';
  let icon = <ListChecks className="h-5 w-5 text-muted-foreground" />;
  let link: string | null = null;
  let buttonText: string | null = null;

  if (config.summaryType === 'totalModels') {
    count = models.length;
    description = 'Custom data structures available.';
    icon = <DatabaseZap className="h-5 w-5 text-muted-foreground" />;
    link = "/models";
    buttonText = "Manage Models";
  } else if (config.summaryType === 'totalObjects') {
    count = Object.values(objects).reduce((sum, arr) => sum + arr.length, 0);
    description = 'Instances across all models.';
    link = "/models"; // Link to models page, where user can then navigate to specific data
    buttonText = "View Objects by Model";
  } else if (typeof config.summaryType === 'object' && config.summaryType.modelId) {
    const model = getModelById(config.summaryType.modelId);
    if (model) {
      count = objects[model.id]?.length || 0;
      description = `Objects in ${model.name}.`;
      link = `/data/${model.id}`;
      buttonText = `View ${model.name} Data`;
    } else {
      count = 0;
      description = `Model ID ${config.summaryType.modelId} not found.`;
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{config.title || 'Data Summary'}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-primary">{count}</div>
        <p className="text-xs text-muted-foreground mt-1">
          {description}
        </p>
        {link && buttonText && (
          <Link href={link} passHref className="mt-4 block">
            <Button variant="outline" size="sm" className="w-full text-xs">
              {buttonText}
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
