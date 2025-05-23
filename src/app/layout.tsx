
'use client'; // Keep this as RootLayout sets up client-side providers

import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import AppLayout from '@/components/layout/app-layout';
import { DataProvider } from '@/contexts/data-context';
import { AuthProvider } from '@/contexts/auth-context';
import { Toaster } from "@/components/ui/toaster";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react'; // Import useState

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'CodexStructure',
  description: 'A web application to dynamically define and manage data structures and objects.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Instantiate QueryClient inside the component, ensuring it's client-side
  // Using useState to ensure it's only created once per component instance
  const [queryClient] = useState(() => new QueryClient());

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <DataProvider>
              <AppLayout>
                {children}
              </AppLayout>
              <Toaster />
            </DataProvider>
          </AuthProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
