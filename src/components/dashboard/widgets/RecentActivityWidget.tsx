
'use client';

import { useQuery } from '@tanstack/react-query';
import type { RecentActivityWidgetConfig, PaginatedActivityLogResponse, ActivityLogEntry } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { History, Loader2, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';

interface RecentActivityWidgetProps {
  config: RecentActivityWidgetConfig;
}

async function fetchRecentActivity(limit: number): Promise<PaginatedActivityLogResponse> {
  const response = await fetch(`/api/structural-changelog?limit=${limit}`);
  if (!response.ok) {
    throw new Error('Failed to fetch recent activity');
  }
  return response.json();
}

export default function RecentActivityWidget({ config }: RecentActivityWidgetProps) {
  const limit = config.limit || 5;

  const { data, isLoading, error } = useQuery<PaginatedActivityLogResponse>({
    queryKey: ['recentActivity', limit],
    queryFn: () => fetchRecentActivity(limit),
  });

  const renderActivityItem = (entry: ActivityLogEntry) => {
    let linkHref: string | null = null;
    if (entry.entity.type === 'Model' && entry.entity.id) {
        linkHref = `/models/view/${entry.entity.id}`;
    } else if (entry.entity.type === 'User' && entry.entity.id) {
        linkHref = `/admin/users`;
    }

    const content = (
      <div className="flex justify-between items-start">
        <div className="text-sm">
          <p className="font-medium text-foreground truncate">
            {entry.summary}
          </p>
          <p className="text-xs text-muted-foreground">
            by <span className="font-semibold">{entry.user.name}</span> &bull; {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
          </p>
        </div>
        <Badge variant={entry.category === 'Security' ? 'destructive' : 'secondary'} className="text-xs shrink-0">{entry.category}</Badge>
      </div>
    );

    if (linkHref) {
      return <Link href={linkHref} key={entry.id} className="block hover:bg-muted/50 p-3 rounded-md transition-colors -mx-3">{content}</Link>
    }
    return <div key={entry.id} className="p-3">{content}</div>;
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-sm font-medium">{config.title || 'Recent Activity'}</CardTitle>
          <CardDescription className="text-xs">A log of recent changes in the system.</CardDescription>
        </div>
        <History className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent className="flex-grow">
        {isLoading && (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
          </div>
        )}
        {error && (
          <div className="text-center text-destructive py-4">
            <ShieldAlert className="mx-auto h-8 w-8 mb-2"/>
            <p className="text-sm">Error loading activity.</p>
          </div>
        )}
        {data && data.entries.length > 0 && (
          <div className="space-y-1">
            {data.entries.map(renderActivityItem)}
          </div>
        )}
        {data && data.entries.length === 0 && (
          <div className="text-center text-muted-foreground py-10">
            <p>No recent activity found.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
