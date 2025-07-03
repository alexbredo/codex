
'use client';

import type { ReactNode } from 'react';
import * as React from 'react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarInset,
  SidebarTrigger,
  SidebarMenuSkeleton,
} from '@/components/ui/sidebar';
import Navigation from './navigation';
import { Button } from '@/components/ui/button';
import { UserCircle, LogOut, LogIn, UserPlus, Loader2, Search } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';
import { GlobalSearch } from '@/components/dashboard/GlobalSearch';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, logout, isLoading: authIsLoading } = useAuth();
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const [isClient, setIsClient] = React.useState(false);

  // Version info from environment variables
  const commitSha = process.env.NEXT_PUBLIC_GIT_COMMIT_SHA;
  const commitDate = process.env.NEXT_PUBLIC_GIT_COMMIT_DATE;
  const formattedDate = commitDate ? format(new Date(commitDate), 'yyyy-MM-dd HH:mm') : 'N/A';


  React.useEffect(() => {
    setIsClient(true);
  }, []);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setIsSearchOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  if (!isClient) {
    return (
      <div className="flex min-h-screen w-full">
        {/* Skeleton for the sidebar */}
        <div className="hidden md:flex flex-col border-r w-[16rem] p-2 bg-muted/30" />
        {/* Skeleton for the main content area (must match SidebarInset) */}
        <main className="flex-1 flex flex-col">
          <header className="sticky top-0 z-10 flex items-center h-14 px-4 border-b bg-background/80 backdrop-blur-sm">
            <div className="flex flex-1 items-center" />
            <div className="flex flex-1 items-center justify-center">
              <Skeleton className="w-40 sm:w-64 md:w-80 h-9" />
            </div>
            <div className="flex flex-1 items-center justify-end gap-2">
              <Skeleton className="h-8 w-24" />
            </div>
          </header>
          {/* This inner wrapper must be a div to match the client-side one */}
          <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    );
  }

  const userRoleDisplay = user?.roles.map(r => r.name).join(', ') || 'No Role';

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full">
        <GlobalSearch open={isSearchOpen} setOpen={setIsSearchOpen} />
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
          <SidebarFooter className="group-data-[collapsible=icon]:hidden text-xs text-sidebar-foreground/60 p-2 space-y-1">
            <p className="font-semibold text-sidebar-foreground/80">Version</p>
            <div className="font-mono">
              <p title={commitSha}>SHA: {commitSha?.substring(0, 7)}</p>
              <p title={commitDate}>Date: {formattedDate}</p>
            </div>
          </SidebarFooter>
        </Sidebar>
        
        <SidebarInset>
          <header className="sticky top-0 z-10 flex items-center h-14 px-4 border-b bg-background/80 backdrop-blur-sm">
            {/* Left Section */}
            <div className="flex flex-1 items-center">
              {isClient && <SidebarTrigger className="md:hidden" />}
            </div>

            {/* Center Section */}
            <div className="flex flex-1 items-center justify-center">
              <Button
                variant="outline"
                onClick={() => setIsSearchOpen(true)}
                className="w-40 sm:w-64 md:w-80 justify-start text-muted-foreground"
              >
                <Search className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Search...</span>
                <kbd className="pointer-events-none ml-auto hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </Button>
            </div>
            
            {/* Right Section */}
            <div className="flex flex-1 items-center justify-end gap-2">
              {user ? (
                <div className="flex items-center gap-2">
                  <UserCircle size={24} className="text-muted-foreground" />
                  <div className="hidden sm:flex flex-col items-start leading-tight">
                    <span className="text-sm font-medium">{user.username}</span>
                    <span className="text-xs text-muted-foreground">{userRoleDisplay}</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={logout} className="text-muted-foreground hover:text-destructive h-8 w-8">
                    <LogOut size={18} />
                  </Button>
                </div>
              ) : !authIsLoading && (
                <div className="hidden md:flex items-center gap-2">
                  <Link href="/login" passHref legacyBehavior><Button variant="outline" size="sm">Login</Button></Link>
                  <Link href="/register" passHref legacyBehavior><Button variant="default" size="sm">Register</Button></Link>
                </div>
              )}
            </div>
          </header>
          {/* This is the main content area for pages */}
          <div className="flex-1 p-6 overflow-auto">
            {authIsLoading && !user ? (
                 <div className="flex justify-center items-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                 </div>
            ) : (
                children
            )}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
