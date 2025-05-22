
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { PlusCircle, Edit, Trash2, Search, ArrowLeft, ListChecks, Users, Link2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import Link from 'next/link';

const ITEMS_PER_PAGE = 10;

const getDisplayPropertyName = (model?: Model): string => {
  if (!model) return 'id'; // Fallback for no model
  if (model.displayPropertyName) return model.displayPropertyName;
  
  const nameProp = model.properties.find(p => p.name.toLowerCase() === 'name');
  if (nameProp) return nameProp.name;
  
  const titleProp = model.properties.find(p => p.name.toLowerCase() === 'title');
  if (titleProp) return titleProp.name;
  
  const firstStringProp = model.properties.find(p => p.type === 'string');
  return firstStringProp ? firstStringProp.name : 'id'; // Final fallback to 'id'
};

const getObjectDisplayValue = (obj: DataObject | undefined, model: Model | undefined, defaultId?: string): string => {
    if (!obj || !model) return defaultId || 'N/A';
    const displayPropName = getDisplayPropertyName(model);
    const value = obj[displayPropName];
    if (value !== null && typeof value !== 'undefined' && String(value).trim() !== '') {
        return String(value);
    }
    return defaultId || obj.id.slice(-6); // Fallback to ID if displayProp value is empty/null
};


export default function DataObjectsPage() {
  const router = useRouter();
  const params = useParams();
  const modelId = params.modelId as string;
  
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
        setObjects(getObjectsByModelId(modelId));
        const defaultVals: Record<string, any> = {};
        foundModel.properties.forEach(prop => {
          defaultVals[prop.name] = prop.type === 'boolean' ? false : 
                                   prop.type === 'date' ? null :
                                   prop.relationshipType === 'many' ? [] :
                                   undefined;
        });
        form.reset(defaultVals);
      } else {
        toast({ variant: "destructive", title: "Error", description: "Model not found." });
        router.push('/models');
      }
    }
  }, [modelId, getModelById, getObjectsByModelId, isReady, toast, router, form]);


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
    } catch (error: any) {
      console.error(`Error saving ${currentModel.name}:`, error);
      if (error.errors) {
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
        if (prop.type === 'string' && value && typeof value === 'string') {
          return value.toLowerCase().includes(searchTerm.toLowerCase());
        }
        // TODO: Add search for other types, including relationships
        return false;
      }) ?? false
    );
  }, [objects, searchTerm, currentModel]);

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
          const relatedItemNames = value.map(itemId => {
            const relatedObj = getObjectsByModelId(property.relatedModelId!).find(o => o.id === itemId);
            return getObjectDisplayValue(relatedObj, relatedModel, `ID: ...${itemId.slice(-6)}`);
          });
          if (relatedItemNames.length > 2) {
            return <Badge variant="outline" title={relatedItemNames.join(', ')}>{relatedItemNames.length} {relatedModel.name}s</Badge>;
          }
          return relatedItemNames.map(name => <Badge key={name} variant="outline" className="mr-1 mb-1">{name}</Badge>);
        } else { // 'one'
          const relatedObj = getObjectsByModelId(property.relatedModelId).find(o => o.id === value);
          const displayVal = getObjectDisplayValue(relatedObj, relatedModel, String(value).slice(-6));
          return relatedObj ? <Badge variant="outline">{displayVal}</Badge> : <span className="text-xs font-mono text-blue-600" title={String(value)}>ID: ...{String(value).slice(-6)}</span>;
        }
      default:
        const strValue = String(value);
        return strValue.length > 50 ? <span title={strValue}>{strValue.substring(0, 47) + '...'}</span> : strValue;
    }
  };
  
  const incomingRelations = useMemo(() => {
    if (!currentModel || !isReady) return [];
    const allDbObjects = getAllObjects();
    const relations: Array<{
      referencingModel: Model;
      referencingProperty: Property;
      referencingObject: DataObject;
      referencedTargetObject: DataObject;
    }> = [];

    allModels.forEach(otherModel => {
      if (otherModel.id === currentModel.id) return; 

      otherModel.properties.forEach(prop => {
        if (prop.type === 'relationship' && prop.relatedModelId === currentModel.id) {
          const objectsOfOtherModel = allDbObjects[otherModel.id] || [];
          objectsOfOtherModel.forEach(otherObj => {
            const linkedValue = otherObj[prop.name];
            if (prop.relationshipType === 'many' && Array.isArray(linkedValue)) {
              linkedValue.forEach(linkedId => {
                const target = objects.find(o => o.id === linkedId);
                if (target) {
                  relations.push({
                    referencingModel: otherModel,
                    referencingProperty: prop,
                    referencingObject: otherObj,
                    referencedTargetObject: target,
                  });
                }
              });
            } else if (prop.relationshipType === 'one' && typeof linkedValue === 'string' && linkedValue) {
              const target = objects.find(o => o.id === linkedValue);
               if (target) {
                  relations.push({
                    referencingModel: otherModel,
                    referencingProperty: prop,
                    referencingObject: otherObj,
                    referencedTargetObject: target,
                  });
                }
            }
          });
        }
      });
    });
    return relations;
  }, [currentModel, allModels, objects, getAllObjects, isReady]);


  if (!isReady || !currentModel) {
    return (
      <div className="flex justify-center items-center h-full">
        <p className="text-lg text-muted-foreground">Loading data objects...</p>
      </div>
    );
  }

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
                {currentModel.properties.slice(0,5).map((prop) => ( 
                  <TableHead key={prop.id}>{prop.name}</TableHead>
                ))}
                <TableHead className="text-right w-[150px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedObjects.map((obj) => (
                <TableRow key={obj.id}>
                  {currentModel.properties.slice(0,5).map((prop) => (
                    <TableCell key={`${obj.id}-${prop.id}`}>
                      {displayCellContent(obj, prop)}
                    </TableCell>
                  ))}
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

      {/* Incoming Relations Section */}
      {currentModel && incomingRelations.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-semibold mb-4 text-primary flex items-center">
            <Link2 className="mr-3 h-6 w-6" />
            {currentModel.name} Objects Referenced By Others
          </h2>
          <Accordion type="multiple" className="w-full space-y-2">
            {objects.filter(obj => incomingRelations.some(ir => ir.referencedTargetObject.id === obj.id)) 
              .map(currentObj => {
              const relationsForThisObject = incomingRelations.filter(ir => ir.referencedTargetObject.id === currentObj.id);
              if (relationsForThisObject.length === 0) return null;

              const currentObjDisplay = getObjectDisplayValue(currentObj, currentModel);

              return (
                <Card key={currentObj.id} className="bg-card/50">
                  <AccordionItem value={currentObj.id} className="border-b-0">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <div className="flex items-center">
                        <Users className="h-5 w-5 mr-2 text-muted-foreground" />
                        <span>Object: <strong className="text-primary">{currentObjDisplay}</strong> is referenced by:</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <ul className="space-y-3">
                        {relationsForThisObject.reduce<Array<{ model: Model; items: Array<{ prop: Property; obj: DataObject }> }>>((acc, rel) => {
                          let group = acc.find(g => g.model.id === rel.referencingModel.id);
                          if (!group) {
                            group = { model: rel.referencingModel, items: [] };
                            acc.push(group);
                          }
                          group.items.push({ prop: rel.referencingProperty, obj: rel.referencingObject });
                          return acc;
                        }, []).map(group => (
                          <li key={group.model.id} className="border p-3 rounded-md bg-background">
                            <h4 className="font-semibold text-sm mb-1">
                              <Link href={`/data/${group.model.id}`} className="hover:underline text-primary">
                                {group.model.name}
                              </Link>
                              :
                            </h4>
                            <ul className="list-disc list-inside pl-2 text-xs space-y-1">
                              {group.items.map(item => {
                                const referencingObjDisplay = getObjectDisplayValue(item.obj, group.model);
                                return (
                                  <li key={item.obj.id}>
                                     <Link href={`/data/${group.model.id}?edit=${item.obj.id}`} className="hover:underline">
                                        "{referencingObjDisplay}"
                                     </Link>
                                     <span className="text-muted-foreground"> (via property: {item.prop.name})</span>
                                  </li>
                                );
                              })}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                </Card>
              );
            })}
          </Accordion>
        </section>
      )}


      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
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
