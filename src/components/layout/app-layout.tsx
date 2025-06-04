
'use client';

import type { ReactNode } from 'react';
import { useState, useEffect } from 'react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import Navigation from './navigation';
import { Button } from '@/components/ui/button';
import { UserCircle, LogOut, LogIn, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils'; // Import cn for conditional class names

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, logout, isLoading } = useAuth();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // If DEBUG_MODE is on, isLoading from useAuth is always false.
  // This check is primarily for non-debug scenarios or future changes.
  if (isLoading && !isClient) { // Show full page loader only if auth is loading AND client hasn't rendered yet
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <p>Loading application...</p>
      </div>
    );
  }

  let isAuthPage = false;
  if (isClient) {
    isAuthPage = window.location.pathname === '/login' || window.location.pathname === '/register';
  }

  if (!user && isAuthPage && isClient) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider defaultOpen> {/* Assuming defaultOpen true, can be cookie-driven later */}
      <div className="flex min-h-screen">
        {isClient ? (
          <Sidebar collapsible="icon" className="border-r">
            <SidebarHeader>
              <Link href="/" className="flex items-center gap-2 p-2 hover:bg-sidebar-accent rounded-md transition-colors">
                 <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-primary">
                  <path d="M50 10C27.9086 10 10 27.9086 10 50C10 72.0914 27.9086 90 50 90" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M50 10C72.0914 10 90 27.9086 90 50C90 72.0914 72.0914 90 50 90" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 15"/>
                  <path d="M30 30L70 70" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M30 70L70 30" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="50" cy="50" r="10" fill="currentColor"/>
                </svg>
                <h1 className="text-xl font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
                  CodexStructure
                </h1>
              </Link>
            </SidebarHeader>
            <SidebarContent>
              <Navigation />
            </SidebarContent>
            <SidebarFooter className="group-data-[collapsible=icon]:hidden">
              {user ? (
                <>
                  <div className="px-2 py-1 text-sm text-sidebar-foreground/80">
                    <UserCircle size={16} className="inline mr-2" />
                    {user.username} ({user.role})
                  </div>
                  <Button variant="ghost" className="justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={logout}>
                    <LogOut size={20} /> Logout
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/login" passHref legacyBehavior>
                    <Button variant="ghost" className="justify-start gap-2 w-full">
                      <LogIn size={20} /> Login
                    </Button>
                  </Link>
                  <Link href="/register" passHref legacyBehavior>
                    <Button variant="ghost" className="justify-start gap-2 w-full">
                      <UserPlus size={20} /> Register
                    </Button>
                  </Link>
                </>
              )}
            </SidebarFooter>
          </Sidebar>
        ) : (
          // Placeholder for SSR to match initial expected width of an expanded sidebar (since defaultOpen is true)
          // Hidden on mobile (md:block), visible on desktop.
          // Sidebar width is defined by --sidebar-width CSS variable.
          <div className="hidden md:block border-r bg-sidebar" style={{ width: 'var(--sidebar-width)' }} />
        )}
        <SidebarInset>
          <header className={cn(
            "sticky top-0 z-10 flex items-center h-14 px-4 border-b bg-background/80 backdrop-blur-sm",
            isClient ? "justify-between" : "justify-end" // Adjust justification based on client state for trigger
          )}>
            {isClient && <SidebarTrigger className="md:hidden" />} {/* Only render trigger on client */}
            <div className="flex-1 text-center text-lg font-medium text-foreground">
              {/* Current Page Title could go here */}
            </div>
            {isClient && user && (
              <Button variant="ghost" size="sm" onClick={logout} className="text-destructive hover:text-destructive hover:bg-destructive/10 md:hidden">
                <LogOut size={18} className="mr-1" /> Logout
              </Button>
            )}
            {isClient && !user && (isAuthPage && (window.location.pathname === '/login' || window.location.pathname === '/register')) && (
              <div className="md:hidden h-9"></div>
            )}
          </header>
          <main className="flex-1 p-6 overflow-auto">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
