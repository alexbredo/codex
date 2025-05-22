
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { createObjectFormSchema } from '@/components/objects/object-form-schema';
import ObjectForm from '@/components/objects/object-form';
import { PlusCircle, Edit, Trash2, Search, ArrowLeft, ListChecks } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import Link from 'next/link';
import { z } from 'zod'; 

const ITEMS_PER_PAGE = 10;
const MAX_DIRECT_PROPERTIES_IN_TABLE = 3; 

const getObjectDisplayValue = (obj: DataObject | undefined, model: Model | undefined, allModels: Model[], allObjects: Record<string, DataObject[]>): string => {
  if (!obj || !model) return obj?.id ? `ID: ...${obj.id.slice(-6)}` : 'N/A';

  // 1. Use defined displayPropertyNames
  if (model.displayPropertyNames && model.displayPropertyNames.length > 0) {
    const displayValues = model.displayPropertyNames
      .map(propName => {
        const propValue = obj[propName];
        if (propValue === null || typeof propValue === 'undefined' || String(propValue).trim() === '') {
          return null; 
        }
        // If this display property is itself a relationship, recursively get its display value
        const propertyDefinition = model.properties.find(p => p.name === propName);
        if (propertyDefinition?.type === 'relationship' && propertyDefinition.relatedModelId) {
            const relatedModelForProp = allModels.find(m => m.id === propertyDefinition.relatedModelId);
            const relatedObjForProp = (allObjects[propertyDefinition.relatedModelId] || []).find(o => o.id === propValue);
            return getObjectDisplayValue(relatedObjForProp, relatedModelForProp, allModels, allObjects);
        }
        return String(propValue);
      })
      .filter(value => value !== null && value.trim() !== ''); // Filter out empty or null values

    if (displayValues.length > 0) {
      return displayValues.join(' - ');
    }
  }

  // 2. Fallback: 'Name' property
  const nameProp = model.properties.find(p => p.name.toLowerCase() === 'name');
  if (nameProp && obj[nameProp.name] !== null && typeof obj[nameProp.name] !== 'undefined' && String(obj[nameProp.name]).trim() !== '') {
    return String(obj[nameProp.name]);
  }

  // 3. Fallback: 'Title' property
  const titleProp = model.properties.find(p => p.name.toLowerCase() === 'title');
  if (titleProp && obj[titleProp.name] !== null && typeof obj[titleProp.name] !== 'undefined' && String(obj[titleProp.name]).trim() !== '') {
    return String(obj[titleProp.name]);
  }
  
  // 4. Fallback: First string property
  const firstStringProp = model.properties.find(p => p.type === 'string');
  if (firstStringProp && obj[firstStringProp.name] !== null && typeof obj[firstStringProp.name] !== 'undefined' && String(obj[firstStringProp.name]).trim() !== '') {
    return String(obj[firstStringProp.name]);
  }

  // 5. Final fallback: ID
  return obj.id ? `ID: ...${obj.id.slice(-6)}` : 'N/A';
};


interface IncomingRelationColumn {
  id: string; 
  headerLabel: string; 
  referencingModel: Model;
  referencingProperty: Property;
}


export default function DataObjectsPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const modelId = params.modelId as string;
  const editObjectId = searchParams.get('edit');
  
  const { 
    models: allModels, 
    getModelById, 
    getObjectsByModelId, 
    addObject, 
    updateObject, 
    deleteObject,
    getAllObjects,
    isReady 
  } = useData();
  const { toast } = useToast();

  const [currentModel, setCurrentModel] = useState<Model | null>(null); 
  const [objects, setObjects] = useState<DataObject[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingObject, setEditingObject] = useState<DataObject | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  const allDbObjects = useMemo(() => getAllObjects(), [getAllObjects, isReady]);


  const dynamicSchema = useMemo(() => currentModel ? createObjectFormSchema(currentModel) : z.object({}), [currentModel]);

  const form = useForm<Record<string, any>>({
    resolver: zodResolver(dynamicSchema),
    defaultValues: {},
  });
  
  useEffect(() => {
    if (isReady && modelId) {
      const foundModel = getModelById(modelId);
      if (foundModel) {
        setCurrentModel(foundModel);
        const modelObjects = getObjectsByModelId(modelId);
        setObjects(modelObjects);
        
        const defaultVals: Record<string, any> = {};
        foundModel.properties.forEach(prop => {
          defaultVals[prop.name] = prop.type === 'boolean' ? false : 
                                   prop.type === 'date' ? null :
                                   prop.relationshipType === 'many' ? [] :
                                   undefined;
        });
        form.reset(defaultVals);

        if (editObjectId) {
          const objectToEdit = modelObjects.find(obj => obj.id === editObjectId);
          if (objectToEdit) {
            handleEdit(objectToEdit);
          } else {
            // Clear invalid edit ID from URL and show toast
            router.replace(`/data/${modelId}`, undefined); // undefined for shallow
            toast({ variant: "destructive", title: "Error", description: `Object with ID ${editObjectId} not found.` });
          }
        }

      } else {
        toast({ variant: "destructive", title: "Error", description: "Model not found." });
        router.push('/models');
      }
    }
  }, [modelId, getModelById, getObjectsByModelId, isReady, toast, router, form, editObjectId]); // editObjectId in dep array


  const handleCreateNew = () => {
    if (!currentModel) return;
    setEditingObject(null);
    const defaultValues: Record<string, any> = {};
    currentModel.properties.forEach(prop => {
      defaultValues[prop.name] = prop.type === 'boolean' ? false : 
                                 prop.type === 'date' ? null :
                                 prop.relationshipType === 'many' ? [] :
                                 undefined;
    });
    form.reset(defaultValues);
    setIsFormOpen(true);
  };

  const handleEdit = (obj: DataObject) => {
    if (!currentModel) return;
    setEditingObject(obj);
    const formValues: Record<string, any> = {};
     currentModel.properties.forEach(prop => {
      formValues[prop.name] = obj[prop.name] ?? (prop.relationshipType === 'many' ? [] : prop.type === 'boolean' ? false : undefined);
    });
    form.reset(formValues);
    setIsFormOpen(true);
  };

  const onSubmit = (values: Record<string, any>) => {
    if (!currentModel) return;
    try {
      if (editingObject) {
        updateObject(currentModel.id, editingObject.id, values);
        toast({ title: `${currentModel.name} Updated`, description: `The ${currentModel.name.toLowerCase()} has been updated.` });
      } else {
        addObject(currentModel.id, values);
        toast({ title: `${currentModel.name} Created`, description: `A new ${currentModel.name.toLowerCase()} has been created.` });
      }
      setObjects(getObjectsByModelId(currentModel.id)); 
      setIsFormOpen(false);
      form.reset();
      
      if (editObjectId) {
        router.replace(`/data/${modelId}`, undefined); 
      }
    } catch (error: any) {
      console.error(`Error saving ${currentModel.name}:`, error);
      if (error.errors) { // Assuming Zod-like error structure
        error.errors.forEach((err: any) => {
          form.setError(err.path[0], { type: 'manual', message: err.message });
        });
      }
      toast({ variant: "destructive", title: "Error", description: `Failed to save ${currentModel.name.toLowerCase()}.` });
    }
  };
  
  const handleDelete = (objectId: string) => {
    if (!currentModel) return;
    deleteObject(currentModel.id, objectId);
    setObjects(getObjectsByModelId(currentModel.id));
    toast({ title: `${currentModel.name} Deleted`, description: `The ${currentModel.name.toLowerCase()} has been deleted.` });
  };

  const filteredObjects = useMemo(() => {
    if (!searchTerm) return objects;
    return objects.filter(obj =>
      currentModel?.properties.some(prop => {
        const value = obj[prop.name];
        if ((prop.type === 'string' || prop.type === 'number') && value && (typeof value === 'string' || typeof value === 'number') ) {
          return String(value).toLowerCase().includes(searchTerm.toLowerCase());
        }
        // Basic search for related items display value
        if (prop.type === 'relationship' && prop.relatedModelId) {
            const relatedModel = getModelById(prop.relatedModelId);
            if (Array.isArray(value)) { // 'many' relationship
                return value.some(itemId => {
                    const relatedObj = getObjectsByModelId(prop.relatedModelId!).find(o => o.id === itemId);
                    const displayVal = getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects);
                    return displayVal.toLowerCase().includes(searchTerm.toLowerCase());
                });
            } else if (value) { // 'one' relationship
                const relatedObj = getObjectsByModelId(prop.relatedModelId).find(o => o.id === value);
                const displayVal = getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects);
                return displayVal.toLowerCase().includes(searchTerm.toLowerCase());
            }
        }
        return false;
      }) ?? false
    );
  }, [objects, searchTerm, currentModel, getModelById, getObjectsByModelId, allModels, allDbObjects]);

  const paginatedObjects = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredObjects.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredObjects, currentPage]);

  const totalPages = Math.ceil(filteredObjects.length / ITEMS_PER_PAGE);

  const displayCellContent = (obj: DataObject, property: Property) => {
    const value = obj[property.name];
    if (value === null || typeof value === 'undefined' || (Array.isArray(value) && value.length === 0)) {
      return <span className="text-muted-foreground">N/A</span>;
    }

    switch (property.type) {
      case 'boolean':
        return value ? <Badge variant="default" className="bg-green-500 hover:bg-green-600">Yes</Badge> : <Badge variant="secondary">No</Badge>;
      case 'date':
        try {
          return format(new Date(value), 'PP');
        } catch {
          return String(value);
        }
      case 'relationship':
        if (!property.relatedModelId) return <span className="text-destructive">Config Err</span>;
        const relatedModel = getModelById(property.relatedModelId);
        if (!relatedModel) return <span className="text-destructive">Model N/A</span>;

        if (property.relationshipType === 'many') {
          if (!Array.isArray(value) || value.length === 0) return <span className="text-muted-foreground">N/A</span>;
          const relatedItems = value.map(itemId => {
            const relatedObj = getObjectsByModelId(property.relatedModelId!).find(o => o.id === itemId);
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
            <Link key={item.id} href={`/data/${relatedModel.id}?edit=${item.obj.id}`} passHref legacyBehavior>
              <a className="inline-block"><Badge variant="outline" className="mr-1 mb-1 hover:bg-secondary">{item.name}</Badge></a>
            </Link>
          ) : (
            <Badge key={item.id} variant="outline" className="mr-1 mb-1">{item.name}</Badge>
          ));
        } else { // 'one'
          const relatedObj = getObjectsByModelId(property.relatedModelId).find(o => o.id === value);
          const displayVal = getObjectDisplayValue(relatedObj, relatedModel, allModels, allDbObjects);
          return relatedObj ? (
             <Link href={`/data/${relatedModel.id}?edit=${relatedObj.id}`} passHref legacyBehavior>
                <a className="inline-block"><Badge variant="outline" className="hover:bg-secondary">{displayVal}</Badge></a>
            </Link>
          ) : <span className="text-xs font-mono" title={String(value)}>{displayVal}</span>;
        }
      default:
        const strValue = String(value);
        return strValue.length > 50 ? <span title={strValue}>{strValue.substring(0, 47) + '...'}</span> : strValue;
    }
  };
  

  const virtualIncomingRelationColumns = useMemo(() => {
    if (!currentModel || !isReady) return [];
    const columns: IncomingRelationColumn[] = [];
    allModels.forEach(otherModel => {
      if (otherModel.id === currentModel.id) return;
      otherModel.properties.forEach(prop => {
        if (prop.type === 'relationship' && prop.relatedModelId === currentModel.id) {
          columns.push({
            id: `${otherModel.id}-${prop.name}`, 
            headerLabel: `Ref. by ${otherModel.name} (via ${prop.name})`,
            referencingModel: otherModel,
            referencingProperty: prop,
          });
        }
      });
    });
    return columns;
  }, [currentModel, allModels, isReady]);


  if (!isReady || !currentModel) {
    return (
      <div className="flex justify-center items-center h-full">
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

      {filteredObjects.length === 0 ? (
        <Card className="col-span-full text-center py-12">
          <CardContent>
            <ListChecks size={48} className="mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold">No Data Objects Found</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm ? `No objects match your search for "${searchTerm}".` : `There are no data objects for the model "${currentModel.name}" yet.`}
            </p>
             {!searchTerm && (
                <Button onClick={handleCreateNew} variant="default">
                    <PlusCircle className="mr-2 h-4 w-4" /> Create First Object
                </Button>
             )}
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-lg">
          <Table>
            <TableHeader>
              <TableRow>
                {directPropertiesToShow.map((prop) => ( 
                  <TableHead key={prop.id}>{prop.name}</TableHead>
                ))}
                {virtualIncomingRelationColumns.map((col) => (
                  <TableHead key={col.id} className="text-xs">{col.headerLabel}</TableHead>
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
                          <Link key={item.id} href={`/data/${colDef.referencingModel.id}?edit=${item.id}`} passHref legacyBehavior>
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

      <Dialog open={isFormOpen} onOpenChange={(isOpen) => {
          setIsFormOpen(isOpen);
          if (!isOpen && editObjectId) { 
            router.replace(`/data/${modelId}`, undefined);
          }
        }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingObject ? `Edit ${currentModel.name}` : `Create New ${currentModel.name}`}</DialogTitle>
            <DialogDescription>
              Fill in the details for the {currentModel.name.toLowerCase()} object.
            </DialogDescription>
          </DialogHeader>
          {isFormOpen && currentModel && (
             <ObjectForm
                form={form}
                model={currentModel}
                onSubmit={onSubmit}
                onCancel={() => setIsFormOpen(false)}
                existingObject={editingObject || undefined}
              />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
