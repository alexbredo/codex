
'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator, // Added SidebarSeparator
} from '@/components/ui/sidebar';
import { LayoutDashboard, DatabaseZap, ListChecks, Settings } from 'lucide-react';
import { useData } from '@/contexts/data-context'; // Added useData
import type { Model } from '@/lib/types';

const staticNavItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/models', label: 'Model Admin', icon: DatabaseZap },
  // { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Navigation() {
  const pathname = usePathname();
  const { models, isReady } = useData(); // Get models and readiness state

  const sortedModels = React.useMemo(() => {
    if (!isReady) return [];
    return [...models].sort((a, b) => a.name.localeCompare(b.name));
  }, [models, isReady]);

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

      {isReady && sortedModels.length > 0 && (
        <>
          <SidebarSeparator className="my-1 mx-2 !w-auto" />
          {sortedModels.map((model: Model) => (
            <SidebarMenuItem key={model.id}>
              <Link href={`/data/${model.id}`} passHref legacyBehavior>
                <SidebarMenuButton
                  isActive={pathname.startsWith(`/data/${model.id}`)} // Simpler active check for model data pages
                  tooltip={{ children: `View ${model.name} Data`, side: 'right', align: 'center' }}
                  aria-label={model.name}
                >
                  <ListChecks size={20} /> {/* Icon for viewing data objects */}
                  <span className="truncate">{model.name}</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </>
      )}
    </SidebarMenu>
  );
}
