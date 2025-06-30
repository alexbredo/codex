 'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import type { Dashboard, WidgetInstance } from '@/lib/types';
import DashboardDisplay from '@/components/dashboard/DashboardDisplay';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AddWidgetDialog from '@/components/dashboard/AddWidgetDialog';
import { v4 as uuidv4 } from 'uuid';

// Define a default dashboard structure if none is found for the user
const getDefaultDashboardLayout = (): WidgetInstance[] => [
  {
    id: uuidv4(),
    type: 'dataSummary',
    config: { title: 'Total Models Defined', summaryType: 'totalModels' },
    gridConfig: { colSpan: 1, rowSpan: 1, order: 1 },
  },
  {
    id: uuidv4(),
    type: 'dataSummary',
    config: { title: 'Total Data Objects', summaryType: 'totalObjects' },
    gridConfig: { colSpan: 1, rowSpan: 1, order: 2 },
  },
  {
    id: uuidv4(),
    type: 'quickStart',
    config: { title: 'Getting Started' },
    gridConfig: { colSpan: 1, rowSpan: 1, order: 3 },
  },
  {
    id: uuidv4(),
    type: 'recentActivity',
    config: { title: 'Recent Activity', limit: 5 },
    gridConfig: { colSpan: 3, rowSpan: 2, order: 4 },
  },
  {
    id: uuidv4(),
    type: 'modelCountChart',
    config: { title: 'Object Distribution by Model' },
    gridConfig: { colSpan: 3, rowSpan: 2, order: 5 },
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

async function saveUserDashboard(dashboard: Dashboard): Promise<Dashboard> {
  const response = await fetch('/api/codex-structure/dashboards/user-dashboard', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(dashboard),
  });
  if (!response.ok) {
    throw new Error('Failed to save user dashboard');
  }
  const data = await response.json();
  return data as Dashboard;
}

export default function HomePage() {
  const { user, isLoading: authIsLoading } = useAuth();
  const [dashboardConfig, setDashboardConfig] = React.useState<Dashboard | null>(null);
  const [isEditMode, setIsEditMode] = React.useState(false);
  const [localDashboardConfig, setLocalDashboardConfig] = React.useState<Dashboard | null>(null);

  const queryClient = useQueryClient();

  const { data: fetchedDashboard, isLoading: dashboardIsLoading, error: dashboardError, refetch } = useQuery<Dashboard | null>({
    queryKey: ['userDashboard', user?.id],
    queryFn: fetchUserDashboard,
    enabled: !!user && !authIsLoading, // Only fetch if user is loaded
    retry: 1,
  });

  const saveDashboardMutation = useMutation({
    mutationFn: saveUserDashboard,
    onSuccess: () => {
      // Invalidate the query to refetch the dashboard
      queryClient.invalidateQueries({ queryKey: ['userDashboard', user?.id] });
      setIsEditMode(false);
      if (localDashboardConfig) {
        setDashboardConfig(localDashboardConfig);
      }
    },
  });

  React.useEffect(() => {
    if (fetchedDashboard) {
      setDashboardConfig(fetchedDashboard);
    } else if (!dashboardIsLoading && !dashboardError && user) {
      // No dashboard found for user, use default
      const defaultDashboard: Dashboard = {
        id: 'default-dashboard',
        userId: user.id,
        name: 'My Dashboard',
        isDefault: true,
        widgets: getDefaultDashboardLayout(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setDashboardConfig(defaultDashboard);
    }
  }, [fetchedDashboard, dashboardIsLoading, dashboardError, user]);

  React.useEffect(() => {
    // When dashboardConfig changes, update localDashboardConfig
    setLocalDashboardConfig(dashboardConfig ? { ...dashboardConfig } : null);
  }, [dashboardConfig]);

  const handleEditDashboard = () => {
    setIsEditMode(true);
  };

  const handleSaveDashboard = () => {
    if (localDashboardConfig) {
      setDashboardConfig(localDashboardConfig);
      saveDashboardMutation.mutate(localDashboardConfig);
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    // Revert local changes by setting it back to the current dashboardConfig
    setLocalDashboardConfig(dashboardConfig ? { ...dashboardConfig } : null);
  };

  const handleRemoveWidget = (widgetId: string) => {
    if (localDashboardConfig) {
      const updatedWidgets = localDashboardConfig.widgets.filter(widget => widget.id !== widgetId);
      setLocalDashboardConfig({ ...localDashboardConfig, widgets: updatedWidgets });
    }
  };

  const handleWidgetsChange = (newWidgets: WidgetInstance[]) => {
    if (localDashboardConfig) {
      setLocalDashboardConfig({ ...localDashboardConfig, widgets: newWidgets });
    }
  };

  const handleAddWidget = (widgetType: string) => {
    if (localDashboardConfig) {
      let newWidget: WidgetInstance;
      switch (widgetType) {
        case 'dataSummary':
          newWidget = {
            id: uuidv4(),
            type: widgetType,
            config: { title: 'New Data Summary Widget', summaryType: 'totalModels' }, // Default config
            gridConfig: { colSpan: 1, rowSpan: 1, order: localDashboardConfig.widgets.length + 1 }, // Place at the end
          };
          break;
        case 'modelCountChart':
          newWidget = {
            id: uuidv4(),
            type: widgetType,
            config: { title: 'New Model Count Chart Widget' }, // Default config
            gridConfig: { colSpan: 1, rowSpan: 1, order: localDashboardConfig.widgets.length + 1 }, // Place at the end
          };
          break;
        case 'quickStart':
          newWidget = {
            id: uuidv4(),
            type: widgetType,
            config: { title: 'New Quick Start Widget' }, // Default config
            gridConfig: { colSpan: 1, rowSpan: 1, order: localDashboardConfig.widgets.length + 1 }, // Place at the end
          };
          break;
        case 'numericSummary':
          newWidget = {
            id: uuidv4(),
            type: widgetType,
            config: { title: 'New Numeric Summary Widget', modelId: '', propertyId: '', calculationType: 'sum' }, // Default config
            gridConfig: { colSpan: 1, rowSpan: 1, order: localDashboardConfig.widgets.length + 1 }, // Place at the end
          };
          break;
        case 'recentActivity':
          newWidget = {
            id: uuidv4(),
            type: widgetType,
            config: { title: 'New Recent Activity Widget' }, // Default config
            gridConfig: { colSpan: 3, rowSpan: 2, order: localDashboardConfig.widgets.length + 1 }, // Place at the end
          };
          break;
        default:
          console.warn('Unknown widget type:', widgetType);
          return;
      }

      const updatedWidgets = [...localDashboardConfig.widgets, newWidget];
      setLocalDashboardConfig({ ...localDashboardConfig, widgets: updatedWidgets });
    }
  };

  const handleColSpanChange = (widgetId: string, colSpan: number) => {
    if (localDashboardConfig) {
      const newWidgets = localDashboardConfig.widgets.map(widget => {
        if (widget.id === widgetId) {
          return {
            ...widget,
            gridConfig: { ...widget.gridConfig, colSpan: colSpan },
          };
        } else {
          return widget;
        }
      });
      setLocalDashboardConfig({ ...localDashboardConfig, widgets: newWidgets });
    }
  };

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
        <div className="mt-4 flex justify-center items-center gap-4">
          {isEditMode ? (
            <div>
              <Button variant="secondary" onClick={handleSaveDashboard} disabled={saveDashboardMutation.isPending}>
                {saveDashboardMutation.isPending ? (
                  <>
                    Saving...
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
              <Button variant="ghost" onClick={handleCancelEdit}>
                Cancel
              </Button>
              <AddWidgetDialog onAddWidget={handleAddWidget} />
            </div>
          ) : (
            <Button onClick={handleEditDashboard}>Edit Dashboard</Button>
          )}
        </div>
      </header>
      {localDashboardConfig && (
        <DashboardDisplay
          widgets={localDashboardConfig.widgets}
          isEditMode={isEditMode}
          onRemoveWidget={handleRemoveWidget}
          onWidgetsChange={handleWidgetsChange}
        />
      )}
    </div>
  );
}
