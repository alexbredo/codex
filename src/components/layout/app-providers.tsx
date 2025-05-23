'use client';

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthProvider } from '@/contexts/auth-context';
import { DataProvider } from '@/contexts/data-context';
import AppLayout from '@/components/layout/app-layout';

interface AppProvidersProps {
  children: ReactNode;
}

export default function AppProviders({ children }: AppProvidersProps) {
  // Instantiate QueryClient inside the component, ensuring it's client-side
  // Using useState to ensure it's only created once per component instance
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DataProvider>
          <AppLayout>
            {children}
          </AppLayout>
        </DataProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
