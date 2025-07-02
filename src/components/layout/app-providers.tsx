
'use client';

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { AuthProvider } from '@/contexts/auth-context';
import { DataProvider } from '@/contexts/data-context';
import AppLayout from '@/components/layout/app-layout';
import { usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { SidebarMenuSkeleton } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';


interface AppProvidersProps {
  children: ReactNode;
}

// This component checks the route and applies the AppLayout only to non-public pages.
function ConditionalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);
  
  // Define public paths that should not have the main application layout
  const publicPaths = ['/login', '/register'];
  const isPublicPath = publicPaths.includes(pathname) || pathname.startsWith('/share');

  if (isPublicPath) {
    // For public paths, render children directly without the main AppLayout
    return <>{children}</>;
  }

  // On the server, and for the initial client render, show a static skeleton
  // to prevent hydration errors from client-side hooks like useIsMobile.
  if (!isClient) {
    return (
       <div className="flex min-h-screen w-full">
        <div className="hidden md:flex flex-col border-r w-[16rem] p-2 bg-muted/30">
          <div className="flex flex-col gap-2">
            <SidebarMenuSkeleton showIcon />
            <SidebarMenuSkeleton showIcon />
            <SidebarMenuSkeleton showIcon />
          </div>
        </div>
        <main className="flex-1 flex flex-col">
          {/* This header structure MUST exactly mirror the one in app-layout.tsx */}
          <header className="sticky top-0 z-10 flex items-center h-14 px-4 border-b bg-background/80 backdrop-blur-sm">
            {/* Left Section (placeholder for SidebarTrigger) */}
            <div className="flex flex-1 items-center">
              {/* This is intentionally empty to match the server render of AppLayout which also renders nothing here */}
            </div>
            {/* Center Section (Search skeleton) */}
            <div className="flex flex-1 items-center justify-center">
              <Skeleton className="w-40 sm:w-64 md:w-80 h-9" />
            </div>
            {/* Right Section (User skeleton) */}
            <div className="flex flex-1 items-center justify-end gap-2">
              <Skeleton className="h-8 w-24" />
            </div>
          </header>
          <div className="flex-1 flex items-center justify-center">
             <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    );
  }

  // For all other app paths on the client, wrap children with the main AppLayout
  return <AppLayout>{children}</AppLayout>;
}

export default function AppProviders({ children }: AppProvidersProps) {
  // Instantiate QueryClient inside the component, ensuring it's client-side
  // Using useState to ensure it's only created once per component instance
  const [queryClient] = useState(() => new QueryClient());

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
