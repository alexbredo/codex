
'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
  SidebarGroup, 
  SidebarGroupLabel,
} from '@/components/ui/sidebar';
import { LayoutDashboard, DatabaseZap, ListChecks, FolderOpen, FolderKanban, Users } from 'lucide-react'; // Added Users icon
import { useData } from '@/contexts/data-context'; 
import { useAuth } from '@/contexts/auth-context';
import type { Model } from '@/lib/types';

const staticNavItemsBase = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['user', 'administrator'] },
];

const adminNavItems = [
  { href: '/models', label: 'Model Admin', icon: DatabaseZap, roles: ['administrator'] },
  { href: '/model-groups', label: 'Group Admin', icon: FolderKanban, roles: ['administrator'] },
  { href: '/admin/users', label: 'User Admin', icon: Users, roles: ['administrator'] }, // Added User Admin
];

export default function Navigation() {
  const pathname = usePathname();
  const { models, isReady: dataIsReady } = useData(); 
  const { user, isLoading: authIsLoading } = useAuth();

  const visibleStaticNavItems = React.useMemo(() => {
    if (authIsLoading || !user) return staticNavItemsBase.filter(item => !item.roles || item.roles.length === 0); 
    return [...staticNavItemsBase, ...adminNavItems].filter(item => item.roles.includes(user.role));
  }, [user, authIsLoading]);


  const groupedModels = React.useMemo(() => {
    if (!dataIsReady) return {};
    const groups: Record<string, Model[]> = {};
    models.forEach(model => {
      const namespace = model.namespace || 'Default';
      if (!groups[namespace]) {
        groups[namespace] = [];
      }
      groups[namespace].push(model);
    });
    
    for (const namespace in groups) {
      groups[namespace].sort((a, b) => a.name.localeCompare(b.name));
    }
    return groups;
  }, [models, dataIsReady]);

  const sortedNamespaces = React.useMemo(() => {
    return Object.keys(groupedModels).sort((a, b) => {
        if (a === 'Default') return -1; 
        if (b === 'Default') return 1;
        return a.localeCompare(b);
    });
  }, [groupedModels]);

  if (authIsLoading) {
    return <div className="p-4 text-sm text-sidebar-foreground/70">Loading navigation...</div>;
  }

  return (
    <SidebarMenu>
      {visibleStaticNavItems.map((item) => (
        <SidebarMenuItem key={item.label}>
          <Link href={item.href} passHref legacyBehavior>
            <SidebarMenuButton
              isActive={pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))}
              tooltip={{ children: item.label, side: 'right', align: 'center' }}
              aria-label={item.label}
            >
              <item.icon size={20} />
              <span className="truncate">{item.label}</span>
            </SidebarMenuButton>
          </Link>
        </SidebarMenuItem>
      ))}

      {dataIsReady && user && sortedNamespaces.length > 0 && (
        <>
          <SidebarSeparator className="my-2 mx-2 !w-auto" />
          <SidebarGroupLabel className="px-2 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:justify-center">
            <ListChecks size={16} className="mr-2 group-data-[collapsible=icon]:mr-0" />
             <span className="group-data-[collapsible=icon]:hidden">Data Objects</span>
          </SidebarGroupLabel>
          {sortedNamespaces.map(namespace => (
            <SidebarGroup key={namespace} className="p-0 pt-1">
              <SidebarGroupLabel className="px-2 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:justify-center">
                <FolderOpen size={16} className="mr-2 group-data-[collapsible=icon]:mr-0" />
                <span className="group-data-[collapsible=icon]:hidden">{namespace}</span>
              </SidebarGroupLabel>
              {groupedModels[namespace].map((model: Model) => (
                <SidebarMenuItem key={model.id}>
                  <Link href={`/data/${model.id}`} passHref legacyBehavior>
                    <SidebarMenuButton
                      isActive={pathname.startsWith(`/data/${model.id}`)}
                      tooltip={{ children: `View ${model.name} Data (${namespace})`, side: 'right', align: 'center' }}
                      aria-label={`${model.name} (${namespace})`}
                      className="ml-2" 
                    >
                      <ListChecks size={18} /> 
                      <span className="truncate">{model.name}</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              ))}
            </SidebarGroup>
          ))}
        </>
      )}
    </SidebarMenu>
  );
}
