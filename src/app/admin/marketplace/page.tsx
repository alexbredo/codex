
'use client';

import * as React from 'react';
import { withAuth } from '@/contexts/auth-context';

function MarketplacePageInternal() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold">Marketplace</h1>
      <p className="text-muted-foreground">This feature is under construction.</p>
    </div>
  );
}

export default withAuth(MarketplacePageInternal, 'marketplace:install');
