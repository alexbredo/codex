'use client';

import * as React from 'react';
import ReactJson from 'react18-json-view';
import { FileText, MinusCircle, PlusCircle, ArrowRight } from 'lucide-react';

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

const DiffValue = ({ value }: { value: any }) => {
  if (value === null) {
    return <span className="text-muted-foreground italic">null</span>;
  }
  if (typeof value === 'undefined') {
    return <span className="text-muted-foreground italic">undefined</span>;
  }
  const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (stringValue.trim() === '') {
    return <span className="text-muted-foreground italic">(empty)</span>;
  }
  return <span className="truncate" title={stringValue}>{stringValue.length > 100 ? `${stringValue.substring(0, 97)}...` : stringValue}</span>;
};

// A specialized diff viewer for arrays of objects, keyed by a property (e.g., 'name' or 'id')
const ArrayDiffView = ({ oldArray, newArray, keyProp = 'name' }: { oldArray: any[], newArray: any[], keyProp?: string }) => {
  const oldMap = new Map(oldArray.map(item => [item[keyProp] || JSON.stringify(item), item]));
  const newMap = new Map(newArray.map(item => [item[keyProp] || JSON.stringify(item), item]));
  const allKeys = Array.from(new Set([...oldArray.map(i => i[keyProp] || JSON.stringify(i)), ...newArray.map(i => i[keyProp] || JSON.stringify(i))]));

  return (
    <div className="font-mono text-xs p-2 bg-muted/40 rounded-md space-y-1">
      {allKeys.map(key => {
        const oldItem = oldMap.get(key);
        const newItem = newMap.get(key);
        
        // Use a stable key for React's list rendering
        const reactKey = typeof key === 'string' ? key : JSON.stringify(key);

        if (oldItem && !newItem) { // Removed
          return (
            <div key={reactKey} className="flex items-start gap-2 text-red-900 dark:text-red-300 bg-red-500/10 p-1.5 rounded-sm">
              <MinusCircle className="h-4 w-4 shrink-0 mt-px text-red-500" />
              <div className="truncate" title={JSON.stringify(oldItem)}>{JSON.stringify(oldItem)}</div>
            </div>
          );
        }
        if (!oldItem && newItem) { // Added
          return (
            <div key={reactKey} className="flex items-start gap-2 text-green-900 dark:text-green-400 bg-green-500/10 p-1.5 rounded-sm">
              <PlusCircle className="h-4 w-4 shrink-0 mt-px text-green-500" />
              <div className="truncate" title={JSON.stringify(newItem)}>{JSON.stringify(newItem)}</div>
            </div>
          );
        }
        if (oldItem && newItem && JSON.stringify(oldItem) !== JSON.stringify(newItem)) { // Modified
          return (
            <div key={reactKey} className="bg-yellow-500/10 p-1.5 rounded-sm space-y-1">
              <div className="flex items-start gap-2 text-red-900 dark:text-red-300">
                <MinusCircle className="h-4 w-4 shrink-0 mt-px text-red-500" />
                <div className="truncate" title={JSON.stringify(oldItem)}>{JSON.stringify(oldItem)}</div>
              </div>
              <div className="flex items-start gap-2 text-green-900 dark:text-green-400">
                <PlusCircle className="h-4 w-4 shrink-0 mt-px text-green-500" />
                <div className="truncate" title={JSON.stringify(newItem)}>{JSON.stringify(newItem)}</div>
              </div>
            </div>
          );
        }
        // Unchanged
        return (
          <div key={reactKey} className="flex items-start gap-2 text-muted-foreground p-1.5">
            <span className="w-4 shrink-0" /> {/* Spacer */}
            <div className="truncate" title={JSON.stringify(newItem)}>{JSON.stringify(newItem)}</div>
          </div>
        );
      })}
    </div>
  );
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
        const isArrayOfObjectsDiff = 
            Array.isArray(change.oldValue) && 
            Array.isArray(change.newValue) && 
            change.oldValue.every(item => typeof item === 'object' && item !== null) &&
            change.newValue.every(item => typeof item === 'object' && item !== null);

        return (
          <div key={index} className="space-y-1">
            <h4 className="text-sm font-semibold tracking-tight">{fieldName}</h4>
            {isArrayOfObjectsDiff ? (
              <ArrayDiffView oldArray={change.oldValue} newArray={change.newValue} />
            ) : (
              // Simple primitive diff
              <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md text-sm">
                <div className="text-red-900 dark:text-red-300 line-through">
                  <DiffValue value={change.oldLabel ?? change.oldValue} />
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="text-green-900 dark:text-green-400 font-medium">
                  <DiffValue value={change.newLabel ?? change.newValue} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
