
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation'; 
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useData } from '@/contexts/data-context';
import type { Model, DataObject, Property } from '@/lib/types';
import { PlusCircle, Edit, Trash2, Search, ArrowLeft, ListChecks, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format as formatDateFns } from 'date-fns';
import Link from 'next/link';
import { z } from 'zod'; // Added z import

const ITEMS_PER_PAGE = 10;
const MAX_DIRECT_PROPERTIES_IN_TABLE = 3;

type SortDirection = 'asc' | 'desc';
interface SortConfig {
  key: string; // property.id for direct properties, or col.id for virtual columns
  direction: SortDirection;
}

const getObjectDisplayValue = (
    obj: DataObject | undefined, 
    model: Model | undefined, 
    allModels: Model[], 
    allObjects: Record<string, DataObject[]>
): string => {
  if (!obj || !model) return obj?.id ? `ID: ...${obj.id.slice(-6)}` : 'N/A';

  if (model.displayPropertyNames && model.displayPropertyNames.length > 0) {
    const displayValues = model.displayPropertyNames
      .map(propName => {
        const propValue = obj[propName];
        if (propValue === null || typeof propValue === 'undefined' || String(propValue).trim() === '') {
          return null;
        }
        const propertyDefinition = model.properties.find(p => p.name === propName);
        if (propertyDefinition?.type === 'relationship' && propertyDefinition.relatedModelId) {
            const relatedModelForProp = allModels.find(m => m.id === propertyDefinition.relatedModelId);
            const relatedObjForProp = (allObjects[propertyDefinition.relatedModelId] || []).find(o => o.id === propValue);
            return getObjectDisplayValue(relatedObjForProp, relatedModelForProp, allModels, allObjects);
        }
        return String(propValue);
      })
      .filter(value => value !== null && value.trim() !== '');

    if (displayValues.length > 0) {
      return displayValues.join(' - ');
    }
  }

  const nameProp = model.properties.find(p => p.name.toLowerCase() === 'name');
  if (nameProp && obj[nameProp.name] !== null && typeof obj[nameProp.name] !== 'undefined' && String(obj[nameProp.name]).trim() !== '') {
    return String(obj[nameProp.name]);
  }

  const titleProp = model.properties.find(p => p.name.toLowerCase() === 'title');
  if (titleProp && obj[titleProp.name] !== null && typeof obj[titleProp.name] !== 'undefined' && String(obj[titleProp.name]).trim() !== '') {
    return String(obj[titleProp.name]);
  }
  
  const firstStringProp = model.properties.find(p => p.type === 'string');
  if (firstStringProp && obj[firstStringProp.name] !== null && typeof obj[firstStringProp.name] !== 'undefined' && String(obj[firstStringProp.name]).trim() !== '') {
    return String(obj[firstStringProp.name]);
  }

  return obj.id ? `ID: ...${obj.id.slice(-6)}` : 'N/A';
};


interface IncomingRelationColumn {
  id: string; // Unique ID for this virtual column, e.g., otherModel.id + '-' + referencingProperty.name
  headerLabel: string;
  referencingModel: Model;
  referencingProperty: Property;
}


export default function DataObjectsPage() {
  const router = useRouter();
  const params = useParams();
  const modelId = params.modelId as string;
  
  const {
    models: allModels,
    getModelById,
    getObjectsByModelId,
    deleteObject,
    getAllObjects,
    isReady
  } = useData();
  const { toast } = useToast();

  const [currentModel, setCurrentModel] = useState<Model | null>(null);
  const [objects, setObjects] = useState<DataObject[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  
  const allDbObjects = useMemo(() => getAllObjects(), [getAllObjects, isReady]);
  
  useEffect(() => {
    if (isReady && modelId) {
      const foundModel = getModelById(modelId);
      if (foundModel) {
        setCurrentModel(foundModel);
        const modelObjects = getObjectsByModelId(modelId);
        setObjects(modelObjects);
      } else {
        toast({ variant: "destructive", title: "Error", description: "Model not found." });
        router.push('/models');
      }
    }
  }, [modelId, getModelById, getObjectsByModelId, isReady, toast, router]);


  const handleCreateNew = () => {
    if (!currentModel) return;
    router.push(`/data/${currentModel.id}/new`);
  };

  const handleEdit = (obj: DataObject) => {
    if (!currentModel) return;
    router.push(`/data/${currentModel.id}/edit/${obj.id}`);
  };
  
  const handleDelete = (objectId: string) => {
    if (!currentModel) return;
    deleteObject(currentModel.id, objectId);
    setObjects(getObjectsByModelId(currentModel.id)); 
    toast({ title: `${currentModel.name} Deleted`, description: `The ${currentModel.name.toLowerCase()} has been deleted.` });
  };

  const requestSort = (key: string) => {
    let direction: SortDirection = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1); // Reset to first page on sort
  };

  const getSortIcon = (columnKey: string) => {
    if (!sortConfig || sortConfig.key !== columnKey) {
      return <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />;
    }
    return sortConfig.direction === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
  };

  const filteredObjects = useMemo(() => {
    if (!currentModel) return [];
    let searchableObjects = objects;

    if (searchTerm) {
      searchableObjects = objects.filter(obj =>
        currentModel.properties.some(prop => {
          const value = obj[prop.name];
          if ((prop.type === 'string' || prop.type === 'number') && value !== null && value !== undefined) {
            return String(value).toLowerCase().includes(searchTerm.toLowerCase());
          }
          if (prop.type === 'relationship' && prop.relatedModelId) {
              const relatedModel = getModelById(prop.relatedModelId);
              if (Array.isArray(value)) { // 'many' relationship
                  return value.some(itemId => {
                      const relatedObj = (allDbObjects[prop.relatedModelId!] || []).find(o => o.id === itemId);
                      const displayVal = getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects);
                      return displayVal.toLowerCase().includes(searchTerm.toLowerCase());
                  });
              } else if (value) { // 'one' relationship
                  const relatedObj = (allDbObjects[prop.relatedModelId!] || []).find(o => o.id === value);
                  const displayVal = getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects);
                  return displayVal.toLowerCase().includes(searchTerm.toLowerCase());
              }
          }
          return false;
        })
      );
    }
    return searchableObjects;
  }, [objects, searchTerm, currentModel, getModelById, allDbObjects, allModels]);

  const virtualIncomingRelationColumns = useMemo(() => {
    if (!currentModel || !isReady) return [];
    const columns: IncomingRelationColumn[] = [];
    allModels.forEach(otherModel => {
      if (otherModel.id === currentModel.id) return;
      otherModel.properties.forEach(prop => {
        if (prop.type === 'relationship' && prop.relatedModelId === currentModel.id) {
          columns.push({
            id: `${otherModel.id}-${prop.name}`, // Unique ID for sort key
            headerLabel: `Ref. by ${otherModel.name} (via ${prop.name})`,
            referencingModel: otherModel,
            referencingProperty: prop,
          });
        }
      });
    });
    return columns;
  }, [currentModel, allModels, isReady]);

  const sortedObjects = useMemo(() => {
    if (!sortConfig || !currentModel) {
      return filteredObjects;
    }

    return [...filteredObjects].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      const directPropertyToSort = currentModel.properties.find(p => p.id === sortConfig.key);
      const virtualColumnToSort = virtualIncomingRelationColumns.find(vc => vc.id === sortConfig.key);

      if (directPropertyToSort) {
        aValue = a[directPropertyToSort.name];
        bValue = b[directPropertyToSort.name];

        switch (directPropertyToSort.type) {
          case 'string':
            aValue = String(aValue ?? '').toLowerCase();
            bValue = String(bValue ?? '').toLowerCase();
            break;
          case 'number':
            aValue = Number(aValue ?? Number.NEGATIVE_INFINITY);
            bValue = Number(bValue ?? Number.NEGATIVE_INFINITY);
            break;
          case 'boolean':
            aValue = aValue ? 1 : 0;
            bValue = bValue ? 1 : 0;
            break;
          case 'date':
            aValue = aValue ? new Date(aValue).getTime() : 0;
            bValue = bValue ? new Date(bValue).getTime() : 0;
            break;
          case 'relationship':
            const relatedModel = getModelById(directPropertyToSort.relatedModelId!);
            if (directPropertyToSort.relationshipType === 'many') {
              aValue = Array.isArray(aValue) ? aValue.length : 0;
              bValue = Array.isArray(bValue) ? bValue.length : 0;
            } else { // 'one'
              const aRelatedObj = (allDbObjects[directPropertyToSort.relatedModelId!] || []).find(o => o.id === aValue);
              const bRelatedObj = (allDbObjects[directPropertyToSort.relatedModelId!] || []).find(o => o.id === bValue);
              aValue = getObjectDisplayValue(aRelatedObj, relatedModel, allModels, allDbObjects).toLowerCase();
              bValue = getObjectDisplayValue(bRelatedObj, relatedModel, allModels, allDbObjects).toLowerCase();
            }
            break;
          default:
            aValue = String(aValue ?? '').toLowerCase();
            bValue = String(bValue ?? '').toLowerCase();
        }
      } else if (virtualColumnToSort) {
        // Sort by count of referencing items for virtual columns
        const aReferencingData = allDbObjects[virtualColumnToSort.referencingModel.id] || [];
        aValue = aReferencingData.filter(refObj => {
          const linkedValue = refObj[virtualColumnToSort.referencingProperty.name];
          return virtualColumnToSort.referencingProperty.relationshipType === 'many' ? (Array.isArray(linkedValue) && linkedValue.includes(a.id)) : linkedValue === a.id;
        }).length;

        const bReferencingData = allDbObjects[virtualColumnToSort.referencingModel.id] || [];
        bValue = bReferencingData.filter(refObj => {
          const linkedValue = refObj[virtualColumnToSort.referencingProperty.name];
          return virtualColumnToSort.referencingProperty.relationshipType === 'many' ? (Array.isArray(linkedValue) && linkedValue.includes(b.id)) : linkedValue === b.id;
        }).length;
      } else {
        return 0; // Should not happen if keys are managed correctly
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [filteredObjects, sortConfig, currentModel, getModelById, allDbObjects, allModels, virtualIncomingRelationColumns]);


  const paginatedObjects = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedObjects.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [sortedObjects, currentPage]);

  const totalPages = Math.ceil(sortedObjects.length / ITEMS_PER_PAGE);

  const displayCellContent = (obj: DataObject, property: Property) => {
    const value = obj[property.name];
    if (value === null || typeof value === 'undefined' || (Array.isArray(value) && value.length === 0)) {
      if (property.type === 'number' && property.unit) {
        return <span className="text-muted-foreground">N/A ({property.unit})</span>;
      }
      return <span className="text-muted-foreground">N/A</span>;
    }

    switch (property.type) {
      case 'boolean':
        return value ? <Badge variant="default" className="bg-green-500 hover:bg-green-600">Yes</Badge> : <Badge variant="secondary">No</Badge>;
      case 'date':
        try {
          return formatDateFns(new Date(value), 'PP');
        } catch {
          return String(value);
        }
      case 'number':
        const precision = property.precision === undefined ? 2 : property.precision;
        const unitText = property.unit || '';
        const parsedValue = parseFloat(value);

        if (isNaN(parsedValue)) {
          const displayUnit = unitText ? ` (${unitText})` : '';
          return <span className="text-muted-foreground">N/A{displayUnit}</span>;
        }
        return `${parsedValue.toFixed(precision)}${unitText ? ` ${unitText}` : ''}`;
      case 'relationship':
        if (!property.relatedModelId) return <span className="text-destructive">Config Err</span>;
        const relatedModel = getModelById(property.relatedModelId);
        if (!relatedModel) return <span className="text-destructive">Model N/A</span>;

        if (property.relationshipType === 'many') {
          if (!Array.isArray(value) || value.length === 0) return <span className="text-muted-foreground">N/A</span>;
          const relatedItems = value.map(itemId => {
            const relatedObj = (allDbObjects[property.relatedModelId!] || []).find(o => o.id === itemId);
            return {
                id: itemId,
                name: getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects),
                obj: relatedObj
            };
          });
          if (relatedItems.length > 2) {
            return <Badge variant="outline" title={relatedItems.map(i=>i.name).join(', ')}>{relatedItems.length} {relatedModel.name}(s)</Badge>;
          }
          return relatedItems.map(item => item.obj ? (
            <Link key={item.id} href={`/data/${relatedModel.id}/edit/${item.obj.id}`} passHref legacyBehavior>
              <a className="inline-block"><Badge variant="outline" className="mr-1 mb-1 hover:bg-secondary">{item.name}</Badge></a>
            </Link>
          ) : (
            <Badge key={item.id} variant="outline" className="mr-1 mb-1">{item.name}</Badge>
          ));
        } else {
          const relatedObj = (allDbObjects[property.relatedModelId] || []).find(o => o.id === value);
          const displayVal = getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects);
          return relatedObj ? (
             <Link href={`/data/${relatedModel.id}/edit/${relatedObj.id}`} passHref legacyBehavior>
                <a className="inline-block"><Badge variant="outline" className="hover:bg-secondary">{displayVal}</Badge></a>
            </Link>
          ) : <span className="text-xs font-mono" title={String(value)}>{displayVal}</span>;
        }
      default:
        const strValue = String(value);
        return strValue.length > 50 ? <span title={strValue}>{strValue.substring(0, 47) + '...'}</span> : strValue;
    }
  };
  

  if (!isReady || !currentModel) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-lg text-muted-foreground">Loading data objects...</p>
      </div>
    );
  }
  
  const directPropertiesToShow = currentModel.properties.slice(0, MAX_DIRECT_PROPERTIES_IN_TABLE);

  return (
    <div className="container mx-auto py-8">
      <Button variant="outline" onClick={() => router.push('/models')} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Models
      </Button>

      <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="text-center md:text-left">
          <h1 className="text-3xl font-bold text-primary">Data for: {currentModel.name}</h1>
          <p className="text-muted-foreground">{currentModel.description || 'Manage data entries for this model.'}</p>
        </div>
         <div className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-grow md:flex-grow-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder={`Search ${currentModel.name.toLowerCase()}s...`}
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1);}}
                    className="pl-10 w-full md:w-64"
                />
            </div>
            <Button onClick={handleCreateNew} className="bg-accent text-accent-foreground hover:bg-accent/90">
                <PlusCircle className="mr-2 h-4 w-4" /> Create New
            </Button>
        </div>
      </header>

      {filteredObjects.length === 0 && !searchTerm ? (
        <Card className="text-center py-12">
          <CardContent>
            <ListChecks size={48} className="mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold">No Data Objects Found</h3>
            <p className="text-muted-foreground mb-4">
              There are no data objects for the model "{currentModel.name}" yet.
            </p>
             <Button onClick={handleCreateNew} variant="default">
                <PlusCircle className="mr-2 h-4 w-4" /> Create First Object
            </Button>
          </CardContent>
        </Card>
      ) : sortedObjects.length === 0 && searchTerm ? (
         <Card className="text-center py-12">
          <CardContent>
            <Search size={48} className="mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold">No Results Found</h3>
            <p className="text-muted-foreground mb-4">
              Your search for "{searchTerm}" did not match any {currentModel.name.toLowerCase()}s.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-lg">
          <Table>
            <TableHeader>
              <TableRow>
                {directPropertiesToShow.map((prop) => (
                  <TableHead key={prop.id}>
                    <Button variant="ghost" onClick={() => requestSort(prop.id)} className="px-1">
                      {prop.name}
                      {getSortIcon(prop.id)}
                    </Button>
                  </TableHead>
                ))}
                {virtualIncomingRelationColumns.map((col) => (
                  <TableHead key={col.id} className="text-xs">
                     <Button variant="ghost" onClick={() => requestSort(col.id)} className="px-1 text-xs">
                      {col.headerLabel}
                      {getSortIcon(col.id)}
                    </Button>
                  </TableHead>
                ))}
                <TableHead className="text-right w-[150px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedObjects.map((obj) => (
                <TableRow key={obj.id}>
                  {directPropertiesToShow.map((prop) => (
                    <TableCell key={`${obj.id}-${prop.id}`}>
                      {displayCellContent(obj, prop)}
                    </TableCell>
                  ))}
                  {virtualIncomingRelationColumns.map((colDef) => {
                    const referencingData = allDbObjects[colDef.referencingModel.id] || [];
                    const linkedItems = referencingData.filter(refObj => {
                      const linkedValue = refObj[colDef.referencingProperty.name];
                      if (colDef.referencingProperty.relationshipType === 'many') {
                        return Array.isArray(linkedValue) && linkedValue.includes(obj.id);
                      }
                      return linkedValue === obj.id;
                    });

                    if (linkedItems.length === 0) {
                      return <TableCell key={colDef.id}><span className="text-muted-foreground">N/A</span></TableCell>;
                    }
                    
                    return (
                      <TableCell key={colDef.id} className="space-x-1 space-y-1">
                        {linkedItems.map(item => (
                          <Link key={item.id} href={`/data/${colDef.referencingModel.id}/edit/${item.id}`} passHref legacyBehavior>
                            <a className="inline-block">
                              <Badge variant="secondary" className="hover:bg-muted cursor-pointer">
                                {getObjectDisplayValue(item, colDef.referencingModel, allModels, allDbObjects)}
                              </Badge>
                            </a>
                          </Link>
                        ))}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(obj)} className="mr-2 hover:text-primary">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete this {currentModel.name.toLowerCase()} object.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(obj.id)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center items-center space-x-2 mt-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

    
