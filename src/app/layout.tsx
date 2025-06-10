
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import AppProviders from '@/components/layout/app-providers';
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans', // Make variable available
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono', // Make variable available
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
  return (
    // Apply font variables to HTML for global CSS access
    <html lang="en" suppressHydrationWarning={true}>
      {/* Apply the primary font class and font variables directly to body */}
      <body className={`${geistSans.className} ${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AppProviders>
          {children}
        </AppProviders>
        <Toaster />
      </body>
    </html>
  );
}
