
'use client';

import type { ReactNode } from 'react';
import { useState, useEffect } from 'react'; // Added for isClient state
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
import { UserCircle, LogOut, LogIn, UserPlus } from 'lucide-react'; // Corrected icon name
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, logout, isLoading } = useAuth();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (isLoading) {
    return <div className="flex flex-col justify-center items-center h-screen"><p>Loading application...</p></div>;
  }
  
  // Defer isAuthPage check until client is mounted
  let isAuthPage = false;
  if (isClient) {
    isAuthPage = window.location.pathname === '/login' || window.location.pathname === '/register';
  }

  if (!user && isAuthPage) {
    return <>{children}</>; 
  }

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen">
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
                  <UserCircle size={16} className="inline mr-2" /> {/* Changed from User to UserCircle */}
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
          <header className="sticky top-0 z-10 flex items-center justify-between h-14 px-4 border-b bg-background/80 backdrop-blur-sm">
            <SidebarTrigger className="md:hidden" />
            <div className="flex-1 text-center text-lg font-medium text-foreground">
              {/* Current Page Title could go here, or leave empty for simplicity */}
            </div>
             {user && isClient && ( // Ensure isClient for mobile logout button too
              <Button variant="ghost" size="sm" onClick={logout} className="text-destructive hover:text-destructive hover:bg-destructive/10 md:hidden">
                <LogOut size={18} className="mr-1" /> Logout
              </Button>
            )}
             {!user && isClient && (isAuthPage && (window.location.pathname === '/login' || window.location.pathname === '/register')) && (
              <div className="md:hidden h-9"></div> // Placeholder to balance header if no user and on auth page (mobile)
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
