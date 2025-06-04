
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
import { UserCircle, LogOut, LogIn, UserPlus, Loader2 } from 'lucide-react'; // Added Loader2
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, logout, isLoading: authIsLoading } = useAuth();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // This loader is for the very brief moment before the client has mounted.
  // It helps ensure child components that rely on client-side info (like useIsMobile in Sidebar)
  // are not rendered prematurely causing hydration issues or flickers.
  if (!isClient) {
    // Render a minimal structural placeholder during SSR and initial client render before hydration
    return (
      <div className="flex min-h-screen">
        <div className="hidden md:block border-r bg-sidebar-background" style={{ width: 'var(--sidebar-width, 16rem)' }} />
        <div className="flex-1 flex flex-col">
          <header className="sticky top-0 z-10 flex items-center justify-end h-14 px-4 border-b bg-background/80 backdrop-blur-sm" />
          <main className="flex-1 p-6 overflow-auto">
            <div className="flex justify-center items-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          </main>
        </div>
      </div>
    );
  }
  
  // Once isClient is true, render the full layout.
  // The Sidebar component itself handles its collapsed/expanded state and mobile view (Sheet).
  return (
    <SidebarProvider defaultOpen> {/* defaultOpen true means sidebar is initially expanded on desktop */}
      <div className="flex min-h-screen">
        <Sidebar collapsible="icon" className="border-r"> {/* Sidebar rendered by client */}
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
        
        <SidebarInset>
          <header className="sticky top-0 z-10 flex items-center h-14 px-4 border-b bg-background/80 backdrop-blur-sm justify-between">
            <SidebarTrigger className="md:hidden" /> {/* Trigger for mobile */}
            <div className="flex-1 text-center text-lg font-medium text-foreground">
              {/* Current Page Title could go here */}
            </div>
            {user && (
              <Button variant="ghost" size="sm" onClick={logout} className="text-destructive hover:text-destructive hover:bg-destructive/10 md:hidden">
                <LogOut size={18} className="mr-1" /> Logout
              </Button>
            )}
            {/* Avoid window.location in render path for SSR compatibility */}
            {!user && (
              <div className="md:hidden h-9"></div> 
            )}
          </header>
          <main className="flex-1 p-6 overflow-auto">
            {authIsLoading && !user ? ( // Show loader if auth is genuinely loading (not just initial client mount)
                 <div className="flex justify-center items-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                 </div>
            ) : (
                children
            )}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
    