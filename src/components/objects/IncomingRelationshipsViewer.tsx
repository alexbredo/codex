
'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useData } from '@/contexts/data-context';
import type { Model, DataObject, Property } from '@/lib/types';
import type { DependencyCheckResult, RelationInfo } from '@/app/api/codex-structure/objects/[objectId]/dependencies/route';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, Link2, Paperclip, ExternalLink } from 'lucide-react';
import { getObjectDisplayValue, cn } from '@/lib/utils';
import Link from 'next/link';
import { StarDisplay } from '@/components/ui/star-display';
import { format as formatDateFns, isValid as isDateValid } from 'date-fns';

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

function DisplayCellContent({ obj, property }: { obj: DataObject, property: Property }) {
    const { allModels, getAllObjects } = useData();
    const allDbObjects = getAllObjects();
    const value = obj[property.name];

    if (value === null || typeof value === 'undefined' || String(value).trim() === '') {
        return <span className="text-muted-foreground text-xs italic">N/A</span>;
    }

    switch (property.type) {
        case 'boolean': return value ? <Badge variant="default" className="text-xs bg-green-500 hover:bg-green-600">Yes</Badge> : <Badge variant="secondary" className="text-xs">No</Badge>;
        case 'date': return <span className="text-xs">{isDateValid(new Date(value)) ? formatDateFns(new Date(value), 'PP') : String(value)}</span>;
        case 'rating': return <StarDisplay rating={value as number} size="sm" />;
        case 'number': return <span className="text-xs">{String(value)}</span>;
        case 'relationship': {
            if (!property.relatedModelId) return <span className="text-destructive text-xs">Config Err</span>;
            const relatedModel = allModels.find(m => m.id === property.relatedModelId);
            if (!relatedModel) return <span className="text-destructive text-xs">Model N/A</span>;

            if (property.relationshipType === 'many' && Array.isArray(value)) {
                 if (value.length === 0) return <span className="text-muted-foreground text-xs italic">None</span>;
                 const firstItem = getObjectDisplayValue((allDbObjects[property.relatedModelId] || []).find(o => o.id === value[0]), relatedModel, allModels, allDbObjects);
                 return <Badge variant="outline" className="text-xs">{firstItem}{value.length > 1 ? ` +${value.length - 1}` : ''}</Badge>;
            } else {
                 const relatedObj = (allDbObjects[property.relatedModelId] || []).find(o => o.id === value);
                 return <Badge variant="outline" className="text-xs">{getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects)}</Badge>;
            }
        }
        default:
            const strValue = String(value);
            return <span className="text-xs truncate" title={strValue}>{strValue.length > 40 ? strValue.substring(0, 37) + '...' : strValue}</span>;
    }
}


export default function IncomingRelationshipsViewer({ objectId, modelId }: IncomingRelationshipsViewerProps) {
  const { models: allModels, getAllObjects } = useData();

  const { data: dependencies, isLoading, error } = useQuery<DependencyCheckResult>({
    queryKey: ['objectDependencies', objectId],
    queryFn: () => fetchDependencies(objectId),
    enabled: !!objectId,
  });

  const allDbObjects = React.useMemo(() => getAllObjects(true), [getAllObjects]);

  const incomingRelationsGrouped = React.useMemo(() => {
    if (!dependencies?.incoming) return {};

    return dependencies.incoming.reduce((acc, relation) => {
      const model = allModels.find(m => m.id === relation.modelId);
      if (!model) return acc;
      
      const groupKey = `${relation.modelName} (via: ${relation.viaPropertyName})`;
      if (!acc[groupKey]) {
        acc[groupKey] = {
            model: model,
            viaPropertyName: relation.viaPropertyName,
            relations: []
        };
      }
      acc[groupKey].relations.push(relation);
      return acc;
    }, {} as Record<string, { model: Model; viaPropertyName: string; relations: RelationInfo[] }>);
  }, [dependencies, allModels]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <CardContent className="flex justify-center items-center py-8">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span>Loading relationships...</span>
        </CardContent>
      );
    }
    if (error) {
      return (
        <Card className="border-destructive bg-destructive/5">
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
        <CardContent>
          <p className="text-muted-foreground text-center py-4">This object is not referenced by any other objects.</p>
        </CardContent>
      );
    }

    return (
        <CardContent className="space-y-6">
        {Object.entries(incomingRelationsGrouped).sort(([a], [b]) => a.localeCompare(b)).map(([groupTitle, groupData]) => {
          const propertiesToDisplay = groupData.model.properties
            .filter(p => p.name !== groupData.viaPropertyName)
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .slice(0, 3); // Display up to 3 properties for brevity

          return (
            <div key={groupTitle}>
              <h3 className="font-semibold text-lg mb-2">{groupTitle}</h3>
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Referencing Object</TableHead>
                      {propertiesToDisplay.map(prop => (
                        <TableHead key={prop.id}>{prop.name}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupData.relations.map(rel => {
                      const sourceObject = allDbObjects[rel.modelId]?.find(o => o.id === rel.objectId);
                      if (!sourceObject) return null;
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
                          {propertiesToDisplay.map(prop => (
                            <TableCell key={prop.id}>
                                <DisplayCellContent obj={sourceObject} property={prop} />
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          );
        })}
      </CardContent>
    );
  };
  
  return (
    <Card className="max-w-4xl mx-auto shadow-lg mt-8">
      <CardHeader>
        <CardTitle className="text-2xl text-primary flex items-center"><Link2 className="mr-2 h-6 w-6" /> Incoming Relationships</CardTitle>
      </CardHeader>
      {renderContent()}
    </Card>
  );
}
