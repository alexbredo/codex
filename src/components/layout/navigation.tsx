
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
  SidebarMenuSkeleton,
} from '@/components/ui/sidebar';
import { LayoutDashboard, DatabaseZap, ListChecks, FolderOpen, FolderKanban, Users, Workflow as WorkflowIcon, ShieldCheck, History, KeyRound, Wand2, PlayCircle, NotebookText, Store } from 'lucide-react';
import { useData } from '@/contexts/data-context';
import { useAuth } from '@/contexts/auth-context';
import type { Model } from '@/lib/types';

const staticNavItemsBase = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'any' },
];

const adminNavItems = [
  { href: '/models', label: 'Model Admin', icon: DatabaseZap, permission: 'models:manage' },
  { href: '/model-groups', label: 'Group Admin', icon: FolderKanban, permission: 'admin:manage_model_groups' },
  { href: '/admin/marketplace', label: 'Marketplace', icon: Store, permission: 'marketplace:install' },
  { href: '/admin/wizards', label: 'Wizard Admin', icon: Wand2, permission: 'admin:manage_wizards' },
  { href: '/admin/workflows', label: 'Workflow Admin', icon: WorkflowIcon, permission: 'admin:manage_workflows' },
  { href: '/admin/validation-rules', label: 'Validation Rules', icon: ShieldCheck, permission: 'admin:manage_validation_rules' },
  { href: '/admin/users', label: 'User Admin', icon: Users, permission: 'users:view' },
  { href: '/admin/roles', label: 'Role Admin', icon: KeyRound, permission: 'roles:manage' },
  { href: '/admin/structural-changelog', label: 'Activity Log', icon: History, permission: 'admin:view_activity_log' },
];

export default function Navigation() {
  const pathname = usePathname();
  const { models, modelGroups, wizards, isReady: dataIsReady } = useData();
  const { user, isLoading: authIsLoading, hasPermission } = useAuth();
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const visibleStaticNavItems = React.useMemo(() => {
    if (!user) return staticNavItemsBase.filter(item => item.permission === 'any');
    
    const combinedAdminItems = [...adminNavItems].sort((a, b) => a.label.localeCompare(b.label));
    const allItems = [...staticNavItemsBase, ...combinedAdminItems];
    
    return allItems.filter(item => {
      if (item.permission === 'any') return true;
      return hasPermission(item.permission);
    });
  }, [user, hasPermission]);


  const groupedModels = React.useMemo(() => {
    if (!dataIsReady || !user) return {};

    const permittedModels = models.filter(model => hasPermission(`model:view:${model.id}`));

    const groups: Record<string, Model[]> = {};
    permittedModels.forEach(model => {
      const group = modelGroups.find(g => g.id === model.modelGroupId);
      const groupName = group ? group.name : 'Default';
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(model);
    });

    for (const groupName in groups) {
      groups[groupName].sort((a, b) => a.name.localeCompare(b.name));
    }
    return groups;
  }, [models, modelGroups, dataIsReady, user, hasPermission]);

  const sortedGroupNames = React.useMemo(() => {
    return Object.keys(groupedModels).sort((a, b) => {
        if (a === 'Default') return -1;
        if (b === 'Default') return 1;
        return a.localeCompare(b);
    });
  }, [groupedModels]);

  if (!isMounted || authIsLoading) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuSkeleton showIcon />
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuSkeleton showIcon />
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuSkeleton showIcon />
        </SidebarMenuItem>
        <SidebarMenuItem>
           <SidebarMenuSkeleton showIcon />
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      {visibleStaticNavItems.map((item) => (
        <SidebarMenuItem key={item.label}>
          <SidebarMenuButton
            asChild
            isActive={pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))}
            tooltip={{ children: item.label, side: 'right', align: 'center' }}
            aria-label={item.label}
          >
            <Link href={item.href}>
              <item.icon size={20} />
              <span className="truncate">{item.label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}

      {dataIsReady && user && sortedGroupNames.length > 0 && (
        <>
          <SidebarSeparator className="my-2 mx-2 !w-auto" />
          <SidebarGroupLabel className="px-2 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:justify-center">
            <ListChecks size={16} className="mr-2 group-data-[collapsible=icon]:mr-0" />
             <span className="group-data-[collapsible=icon]:hidden">Data Objects</span>
          </SidebarGroupLabel>
          {sortedGroupNames.map(groupName => (
            <SidebarGroup key={groupName} className="p-0 pt-1">
              <SidebarGroupLabel className="px-2 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:justify-center">
                <FolderOpen size={16} className="mr-2 group-data-[collapsible=icon]:mr-0" />
                <span className="group-data-[collapsible=icon]:hidden">{groupName}</span>
              </SidebarGroupLabel>
              {groupedModels[groupName].map((model: Model) => (
                <SidebarMenuItem key={model.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(`/data/${model.id}`)}
                    tooltip={{ children: `View ${model.name} Data (${groupName})`, side: 'right', align: 'center' }}
                    aria-label={`${model.name} (${groupName})`}
                    className="ml-2"
                  >
                    <Link href={`/data/${model.id}`}>
                      <ListChecks size={18} />
                      <span className="truncate">{model.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarGroup>
          ))}
        </>
      )}
    </SidebarMenu>
  );
}
