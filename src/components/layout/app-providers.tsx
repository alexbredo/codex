'use client';

import * as React from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/contexts/auth-context';
import { DataProvider } from '@/contexts/data-context';
import AppLayout from '@/components/layout/app-layout';
import { usePathname } from 'next/navigation';

interface AppProvidersProps {
  children: ReactNode;
}

// This component checks the route and applies the AppLayout only to non-public pages.
function ConditionalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  
  // Define public paths that should not have the main application layout
  const publicPaths = ['/login', '/register'];
  const isPublicPath = publicPaths.includes(pathname) || pathname.startsWith('/share');

  if (isPublicPath) {
    // For public paths, render children directly without the main AppLayout
    return <>{children}</>;
  }

  // For all other app paths, wrap children with the main AppLayout.
  // The skeleton logic is now handled inside AppLayout itself.
  return <AppLayout>{children}</AppLayout>;
}

export default function AppProviders({ children }: AppProvidersProps) {
  // Instantiate QueryClient inside the component, ensuring it's client-side
  // Using useState to ensure it's only created once per component instance
  const [queryClient] = React.useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DataProvider>
          <ConditionalLayout>
            {children}
          </ConditionalLayout>
        </DataProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
