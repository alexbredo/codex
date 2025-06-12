
'use client';

import type { QuickStartWidgetConfig } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, PlusCircle, Settings } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';

interface QuickStartWidgetProps {
  config: QuickStartWidgetConfig;
}

export default function QuickStartWidget({ config }: QuickStartWidgetProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'administrator';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{config.title || 'Quick Start'}</CardTitle>
        <Users className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          {isAdmin 
            ? "Manage your data structures or create new entries." 
            : "Start by viewing or creating data for available models."}
        </p>
        <div className="space-y-2">
          {isAdmin && (
            <Link href="/models/new" passHref className="block">
              <Button variant="default" size="sm" className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                <PlusCircle className="mr-2 h-4 w-4" /> Create a Model
              </Button>
            </Link>
          )}
          <Link href="/models" passHref className="block">
            <Button variant="outline" size="sm" className="w-full">
              <Settings className="mr-2 h-4 w-4" /> View All Models
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
