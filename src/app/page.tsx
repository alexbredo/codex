
'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import type { Dashboard, WidgetInstance } from '@/lib/types';
import DashboardDisplay from '@/components/dashboard/DashboardDisplay';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button'; // Assuming Button is for a potential "Create Dashboard" action

// Define a default dashboard structure if none is found for the user
const getDefaultDashboardLayout = (): WidgetInstance[] => [
  {
    id: 'summary-models',
    type: 'dataSummary',
    config: { title: 'Total Models Defined', summaryType: 'totalModels' },
    gridConfig: { colSpan: 1, rowSpan: 1, order: 1 },
  },
  {
    id: 'summary-objects',
    type: 'dataSummary',
    config: { title: 'Total Data Objects', summaryType: 'totalObjects' },
    gridConfig: { colSpan: 1, rowSpan: 1, order: 2 },
  },
  {
    id: 'quick-start',
    type: 'quickStart',
    config: { title: 'Getting Started' },
    gridConfig: { colSpan: 1, rowSpan: 1, order: 3 },
  },
  {
    id: 'model-object-chart',
    type: 'modelCountChart',
    config: { title: 'Object Distribution by Model' },
    gridConfig: { colSpan: 3, rowSpan: 2, order: 4 },
  },
];

async function fetchUserDashboard(): Promise<Dashboard | null> {
  const response = await fetch('/api/codex-structure/dashboards/user-dashboard');
  if (!response.ok) {
    if (response.status === 404) return null; // No dashboard found for user
    throw new Error('Failed to fetch user dashboard');
  }
  const data = await response.json();
  return data as Dashboard | null; // API might return null if no dashboard
}

export default function HomePage() {
  const { user, isLoading: authIsLoading } = useAuth();
  const [dashboardConfig, setDashboardConfig] = useState<Dashboard | null>(null);

  const { data: fetchedDashboard, isLoading: dashboardIsLoading, error: dashboardError, refetch } = useQuery<Dashboard | null>({
    queryKey: ['userDashboard', user?.id],
    queryFn: fetchUserDashboard,
    enabled: !!user && !authIsLoading, // Only fetch if user is loaded
    retry: 1,
  });

  useEffect(() => {
    if (fetchedDashboard) {
      setDashboardConfig(fetchedDashboard);
    } else if (!dashboardIsLoading && !dashboardError && user) {
      // No dashboard found for user, use default
      setDashboardConfig({
        id: 'default-dashboard',
        userId: user.id,
        name: 'My Dashboard',
        isDefault: true,
        widgets: getDefaultDashboardLayout(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }, [fetchedDashboard, dashboardIsLoading, dashboardError, user]);


  if (authIsLoading || (dashboardIsLoading && user)) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
        <p className="ml-4 text-lg text-muted-foreground">Loading dashboard...</p>
      </div>
    );
  }

  if (dashboardError) {
    return (
      <div className="container mx-auto py-8 text-center">
        <p className="text-destructive mb-4">Error loading dashboard: {dashboardError.message}</p>
        <Button onClick={() => refetch()}>Try Again</Button>
      </div>
    );
  }
  
  if (!user) {
    // This case should ideally be handled by withAuth redirecting to login,
    // but as a fallback or for public dashboards (if ever implemented):
    return (
       <div className="container mx-auto py-8 text-center">
        <p className="text-lg text-muted-foreground">Please log in to view your dashboard.</p>
        {/* Optionally, show a generic public dashboard or call to action */}
      </div>
    );
  }

  if (!dashboardConfig) {
    // Should ideally be covered by the loading state or default config logic
     return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
        <p className="ml-4 text-lg text-muted-foreground">Preparing your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-primary">{dashboardConfig.name}</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Your personalized overview of CodexStructure.
        </p>
      </header>
      <DashboardDisplay widgets={dashboardConfig.widgets} />
    </div>
  );
}
