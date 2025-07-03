'use client';

import * as React from 'react';
import ReactJson from 'react18-json-view';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, MinusCircle, PlusCircle } from 'lucide-react';

interface ChangeDetail {
  field?: string;
  propertyName?: string;
  oldValue?: any;
  newValue?: any;
  oldLabel?: string;
  newLabel?: string;
}

interface LogDetailViewerProps {
  details: ChangeDetail[] | Record<string, any>;
}

const formatValueForDisplay = (value: any) => {
  if (value === null) return <span className="text-muted-foreground italic">null</span>;
  if (typeof value === 'undefined') return <span className="text-muted-foreground italic">undefined</span>;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object' && value !== null) {
    return <ReactJson src={value} collapsed={1} displayDataTypes={false} enableClipboard={false} theme="default" style={{ fontSize: '0.75rem', backgroundColor: 'transparent' }} />;
  }
  return String(value);
};

export default function LogDetailViewer({ details }: LogDetailViewerProps) {
  if (!details) {
    return <p className="text-muted-foreground italic">No details available for this log entry.</p>;
  }

  // Handle snapshot views for CREATE/DELETE actions
  if (!Array.isArray(details)) {
    return (
      <div className="bg-muted/50 p-4 rounded-md border">
        <h4 className="font-semibold text-sm mb-2 flex items-center"><FileText className="mr-2 h-4 w-4"/>Snapshot Data</h4>
        <ReactJson
          src={details}
          collapsed={1}
          displayObjectSize={false}
          displayDataTypes={false}
          enableClipboard={false}
          theme="default"
          style={{ fontSize: '0.8rem', backgroundColor: 'transparent' }}
        />
      </div>
    );
  }

  // Handle detailed diff view for UPDATE actions
  return (
    <div className="space-y-4">
      {details.map((change, index) => {
        const fieldName = change.field || change.propertyName || `Change ${index + 1}`;
        const hasDiff = 'oldValue' in change || 'newValue' in change;
        
        return (
          <div key={index} className="space-y-2">
            <h4 className="text-sm font-semibold tracking-tight">{fieldName}</h4>
            {hasDiff ? (
               <div className="space-y-1">
                 <div className="bg-red-500/10 p-2 rounded-md border border-red-500/20 text-red-900 dark:text-red-200">
                    <div className="flex items-center text-xs font-semibold gap-2">
                      <MinusCircle className="h-4 w-4"/>
                      <span>BEFORE</span>
                    </div>
                    <div className="font-mono text-xs break-words pl-6 mt-1">
                      {formatValueForDisplay(change.oldLabel ?? change.oldValue)}
                    </div>
                  </div>
                 <div className="bg-green-500/10 p-2 rounded-md border border-green-500/20 text-green-900 dark:text-green-200">
                    <div className="flex items-center text-xs font-semibold gap-2">
                      <PlusCircle className="h-4 w-4"/>
                      <span>AFTER</span>
                    </div>
                    <div className="font-mono text-xs break-words pl-6 mt-1">
                      {formatValueForDisplay(change.newLabel ?? change.newValue)}
                    </div>
                  </div>
              </div>
            ) : (
              // Handle cases without a direct diff
              <div className="bg-muted/80 p-2 rounded-md border">
                <div className="font-mono text-xs break-words">
                  {formatValueForDisplay(change.newValue)}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
