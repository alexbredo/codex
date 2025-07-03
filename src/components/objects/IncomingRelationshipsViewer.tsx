'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useData } from '@/contexts/data-context';
import type { Model, DataObject } from '@/lib/types';
import type { DependencyCheckResult, RelationInfo } from '@/app/api/codex-structure/objects/[objectId]/dependencies/route';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, Link2 } from 'lucide-react';
import { getObjectDisplayValue, cn } from '@/lib/utils';
import Link from 'next/link';

interface IncomingRelationshipsViewerProps {
  modelId: string;
  objectId: string;
}

async function fetchDependencies(objectId: string): Promise<DependencyCheckResult> {
  const response = await fetch(`/api/codex-structure/objects/${objectId}/dependencies`);
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to fetch object dependencies');
  }
  return response.json();
}

export default function IncomingRelationshipsViewer({ objectId, modelId }: IncomingRelationshipsViewerProps) {
  const { models: allModels, getAllObjects } = useData();

  const { data: dependencies, isLoading, error } = useQuery<DependencyCheckResult>({
    queryKey: ['objectDependencies', objectId],
    queryFn: () => fetchDependencies(objectId),
    enabled: !!objectId,
  });

  const allDbObjects = React.useMemo(() => getAllObjects(true), [getAllObjects]);

  const incomingRelationsByModel = React.useMemo(() => {
    if (!dependencies?.incoming) return {};

    return dependencies.incoming.reduce((acc, relation) => {
      const groupName = relation.modelName;
      if (!acc[groupName]) {
        acc[groupName] = [];
      }
      acc[groupName].push(relation);
      return acc;
    }, {} as Record<string, RelationInfo[]>);
  }, [dependencies]);

  if (isLoading) {
    return (
      <Card className="max-w-4xl mx-auto shadow-lg mt-8">
        <CardHeader>
          <CardTitle className="text-2xl text-primary flex items-center"><Link2 className="mr-2 h-6 w-6" /> Incoming Relationships</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center items-center py-8">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span>Loading relationships...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="max-w-4xl mx-auto shadow-lg mt-8 border-destructive bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center"><AlertTriangle className="mr-2 h-6 w-6" /> Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Could not load incoming relationships: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  if (!dependencies || dependencies.incoming.length === 0) {
    return (
       <Card className="max-w-4xl mx-auto shadow-lg mt-8">
        <CardHeader>
          <CardTitle className="text-2xl text-primary flex items-center"><Link2 className="mr-2 h-6 w-6" /> Incoming Relationships</CardTitle>
        </CardHeader>
        <CardContent>
            <p className="text-muted-foreground text-center py-4">This object is not referenced by any other objects.</p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="max-w-4xl mx-auto shadow-lg mt-8">
      <CardHeader>
        <CardTitle className="text-2xl text-primary flex items-center"><Link2 className="mr-2 h-6 w-6" /> Incoming Relationships</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {Object.entries(incomingRelationsByModel).sort(([a], [b]) => a.localeCompare(b)).map(([modelName, relations]) => (
          <div key={modelName}>
            <h3 className="font-semibold text-lg mb-2">{modelName}</h3>
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referencing Object</TableHead>
                    <TableHead>Via Property</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {relations.map(rel => {
                    const sourceObject = allDbObjects[rel.modelId]?.find(o => o.id === rel.objectId);
                    const isDeleted = !!sourceObject?.isDeleted;

                    return (
                      <TableRow key={rel.objectId} className={cn(isDeleted && "bg-destructive/5 hover:bg-destructive/10")}>
                        <TableCell>
                          <Link href={`/data/${rel.modelId}/view/${rel.objectId}`} passHref legacyBehavior>
                            <a className={cn("text-primary hover:underline", isDeleted && "text-destructive line-through")}>
                                {rel.objectDisplayValue}
                            </a>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{rel.viaPropertyName}</Badge>
                        </TableCell>
                        <TableCell>
                           {isDeleted ? <Badge variant="destructive">Deleted</Badge> : <Badge variant="outline">Active</Badge>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
