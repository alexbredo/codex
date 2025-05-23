
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
import { LayoutDashboard, DatabaseZap, ListChecks, FolderOpen } from 'lucide-react';
import { useData } from '@/contexts/data-context'; 
import type { Model } from '@/lib/types';

const staticNavItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/models', label: 'Model Admin', icon: DatabaseZap },
];

export default function Navigation() {
  const pathname = usePathname();
  const { models, isReady } = useData(); 

  const groupedModels = React.useMemo(() => {
    if (!isReady) return {};
    const groups: Record<string, Model[]> = {};
    models.forEach(model => {
      const namespace = model.namespace || 'Default';
      if (!groups[namespace]) {
        groups[namespace] = [];
      }
      groups[namespace].push(model);
    });
    // Sort models within each namespace
    for (const namespace in groups) {
      groups[namespace].sort((a, b) => a.name.localeCompare(b.name));
    }
    return groups;
  }, [models, isReady]);

  const sortedNamespaces = React.useMemo(() => {
    return Object.keys(groupedModels).sort((a, b) => a.localeCompare(b));
  }, [groupedModels]);

  return (
    <SidebarMenu>
      {staticNavItems.map((item) => (
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

      {isReady && sortedNamespaces.length > 0 && (
        <>
          <SidebarSeparator className="my-2 mx-2 !w-auto" />
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
                      className="ml-2" // Indent model items
                    >
                      <ListChecks size={18} /> {/* Slightly smaller icon */}
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
