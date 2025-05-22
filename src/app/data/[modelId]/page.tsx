
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod'; // Added import
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
import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';

const ITEMS_PER_PAGE = 10;

export default function DataObjectsPage() {
  const router = useRouter();
  const params = useParams();
  const modelId = params.modelId as string;
  
  const { 
    getModelById, 
    getObjectsByModelId, 
    addObject, 
    updateObject, 
    deleteObject,
    isReady 
  } = useData();
  const { toast } = useToast();

  const [model, setModel] = useState<Model | null>(null);
  const [objects, setObjects] = useState<DataObject[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingObject, setEditingObject] = useState<DataObject | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const dynamicSchema = useMemo(() => model ? createObjectFormSchema(model) : z.object({}), [model]);

  const form = useForm<Record<string, any>>({
    resolver: zodResolver(dynamicSchema),
    defaultValues: {},
  });
  
  useEffect(() => {
    if (isReady && modelId) {
      const currentModel = getModelById(modelId);
      if (currentModel) {
        setModel(currentModel);
        setObjects(getObjectsByModelId(modelId));
        // Initialize form with default values based on model properties
        const defaultVals: Record<string, any> = {};
        currentModel.properties.forEach(prop => {
          defaultVals[prop.name] = prop.type === 'boolean' ? false : undefined;
        });
        form.reset(defaultVals);
      } else {
        // Handle model not found, e.g., redirect or show error
        toast({ variant: "destructive", title: "Error", description: "Model not found." });
        router.push('/models');
      }
    }
  }, [modelId, getModelById, getObjectsByModelId, isReady, toast, router, form]);


  const handleCreateNew = () => {
    if (!model) return;
    setEditingObject(null);
    const defaultValues: Record<string, any> = {};
    model.properties.forEach(prop => {
      defaultValues[prop.name] = prop.type === 'boolean' ? false : 
                                 prop.type === 'date' ? null :
                                 undefined;
    });
    form.reset(defaultValues);
    setIsFormOpen(true);
  };

  const handleEdit = (obj: DataObject) => {
    if (!model) return;
    setEditingObject(obj);
    const formValues: Record<string, any> = {};
     model.properties.forEach(prop => {
      formValues[prop.name] = obj[prop.name];
    });
    form.reset(formValues);
    setIsFormOpen(true);
  };

  const onSubmit = (values: Record<string, any>) => {
    if (!model) return;
    try {
      if (editingObject) {
        updateObject(model.id, editingObject.id, values);
        toast({ title: `${model.name} Updated`, description: `The ${model.name.toLowerCase()} has been updated.` });
      } else {
        addObject(model.id, values);
        toast({ title: `${model.name} Created`, description: `A new ${model.name.toLowerCase()} has been created.` });
      }
      setObjects(getObjectsByModelId(model.id)); // Refresh local list
      setIsFormOpen(false);
      form.reset();
    } catch (error: any) {
      console.error(`Error saving ${model.name}:`, error);
      // Check for ZodErrors to display specific field errors
      if (error.errors) {
        error.errors.forEach((err: any) => {
          form.setError(err.path[0], { type: 'manual', message: err.message });
        });
      }
      toast({ variant: "destructive", title: "Error", description: `Failed to save ${model.name.toLowerCase()}.` });
    }
  };
  
  const handleDelete = (objectId: string) => {
    if (!model) return;
    deleteObject(model.id, objectId);
    setObjects(getObjectsByModelId(model.id)); // Refresh local list
    toast({ title: `${model.name} Deleted`, description: `The ${model.name.toLowerCase()} has been deleted.` });
  };

  const filteredObjects = useMemo(() => {
    if (!searchTerm) return objects;
    return objects.filter(obj =>
      model?.properties.some(prop => {
        const value = obj[prop.name];
        if (prop.type === 'string' && value && typeof value === 'string') {
          return value.toLowerCase().includes(searchTerm.toLowerCase());
        }
        // Add more sophisticated search for other types if needed
        return false;
      }) ?? false
    );
  }, [objects, searchTerm, model]);

  const paginatedObjects = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredObjects.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredObjects, currentPage]);

  const totalPages = Math.ceil(filteredObjects.length / ITEMS_PER_PAGE);

  if (!isReady || !model) {
    return (
      <div className="flex justify-center items-center h-full">
        <p className="text-lg text-muted-foreground">Loading data objects...</p>
      </div>
    );
  }
  
  const displayCellContent = (obj: DataObject, property: Property) => {
    const value = obj[property.name];
    if (value === null || typeof value === 'undefined') return <span className="text-muted-foreground">N/A</span>;

    switch (property.type) {
      case 'boolean':
        return value ? <Badge variant="default" className="bg-green-500 hover:bg-green-600">Yes</Badge> : <Badge variant="secondary">No</Badge>;
      case 'date':
        try {
          return format(new Date(value), 'PP'); // Format as 'Sep 03, 2023'
        } catch {
          return String(value); // Fallback if date is invalid
        }
      case 'relationship':
        // TODO: Fetch and display related object's name
        return <span className="text-xs font-mono text-blue-600" title={String(value)}>ID: ...{String(value).slice(-6)}</span>;
      default:
        // Truncate long strings
        const strValue = String(value);
        return strValue.length > 50 ? <span title={strValue}>{strValue.substring(0, 47) + '...'}</span> : strValue;
    }
  };

  return (
    <div className="container mx-auto py-8">
      <Button variant="outline" onClick={() => router.push('/models')} className="mb-6">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Models
      </Button>

      <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="text-center md:text-left">
          <h1 className="text-3xl font-bold text-primary">Data for: {model.name}</h1>
          <p className="text-muted-foreground">{model.description || 'Manage data entries for this model.'}</p>
        </div>
         <div className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-grow md:flex-grow-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder={`Search ${model.name.toLowerCase()}s...`}
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
              {searchTerm ? `No objects match your search for "${searchTerm}".` : `There are no data objects for the model "${model.name}" yet.`}
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
                {model.properties.slice(0,5).map((prop) => ( // Limit initial columns for wider tables
                  <TableHead key={prop.id}>{prop.name}</TableHead>
                ))}
                <TableHead className="text-right w-[150px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedObjects.map((obj) => (
                <TableRow key={obj.id}>
                  {model.properties.slice(0,5).map((prop) => (
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
                            This action cannot be undone. This will permanently delete this {model.name.toLowerCase()} object.
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

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingObject ? `Edit ${model.name}` : `Create New ${model.name}`}</DialogTitle>
            <DialogDescription>
              Fill in the details for the {model.name.toLowerCase()} object.
            </DialogDescription>
          </DialogHeader>
          {/* Conditional rendering of form ensures it re-initializes with correct schema/defaults */}
          {isFormOpen && model && (
             <ObjectForm
                form={form}
                model={model}
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


    