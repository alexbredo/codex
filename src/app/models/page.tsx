
'use client';

import { useState, useEffect } from 'react'; // Added useEffect
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'; // Removed DialogTrigger, Footer, Close
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import ModelForm from '@/components/models/model-form';
import type { ModelFormValues } from '@/components/models/model-form-schema';
import { modelFormSchema } from '@/components/models/model-form-schema';
import { useData } from '@/contexts/data-context';
import type { Model, Property } from '@/lib/types';
import { PlusCircle, Edit, Trash2, Eye, DatabaseZap, ListChecks, Search, Info, Code2 } from 'lucide-react';
import Link from 'next/link';
import { useToast } from "@/hooks/use-toast";
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function ModelsPage() {
  const { models, addModel, updateModel, deleteModel, isReady, getModelByName } = useData();
  const { toast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const form = useForm<ModelFormValues>({
    resolver: zodResolver(modelFormSchema),
    defaultValues: {
      name: '',
      description: '',
      properties: [{ id: crypto.randomUUID(), name: '', type: 'string', required: false, relationshipType: 'one' }],
    },
  });

  // Effect to update form when editingModel changes
  useEffect(() => {
    if (editingModel) {
      form.reset({
        name: editingModel.name,
        description: editingModel.description || '',
        properties: editingModel.properties.map(p => ({ 
            ...p, 
            id: p.id || crypto.randomUUID(),
            relationshipType: p.relationshipType || 'one' // Ensure default
        })),
      });
    } else {
      form.reset({
        name: '',
        description: '',
        properties: [{ id: crypto.randomUUID(), name: '', type: 'string', required: false, relationshipType: 'one' }],
      });
    }
  }, [editingModel, form, isFormOpen]); // Added isFormOpen dependency

  const handleCreateNew = () => {
    setEditingModel(null);
    // Reset is handled by useEffect now
    setIsFormOpen(true);
  };

  const handleEdit = (model: Model) => {
    setEditingModel(model);
     // Reset is handled by useEffect now
    setIsFormOpen(true);
  };

  const onSubmit = (values: ModelFormValues) => {
    const existingByName = getModelByName(values.name);
    if (existingByName && (!editingModel || existingByName.id !== editingModel.id)) {
        form.setError("name", { type: "manual", message: "A model with this name already exists." });
        return;
    }

    const modelData = {
      name: values.name,
      description: values.description,
      properties: values.properties.map(p => ({
        id: p.id || crypto.randomUUID(),
        name: p.name,
        type: p.type,
        relatedModelId: p.relatedModelId,
        required: p.required,
        relationshipType: p.type === 'relationship' ? p.relationshipType : undefined, // Only set for relationship
      } as Property)),
    };

    try {
      if (editingModel) {
        updateModel(editingModel.id, modelData);
        toast({ title: "Model Updated", description: `Model "${values.name}" has been updated.` });
      } else {
        addModel(modelData);
        toast({ title: "Model Created", description: `Model "${values.name}" has been created.` });
      }
      setIsFormOpen(false);
      // form.reset(); // Reset handled by useEffect or on dialog close
    } catch (error) {
      console.error("Error saving model:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to save model." });
    }
  };
  
  const handleDelete = (modelId: string) => {
    deleteModel(modelId);
    toast({ title: "Model Deleted", description: "The model has been successfully deleted." });
  };

  const filteredModels = models.filter(model =>
    model.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isReady) {
    return (
      <div className="flex justify-center items-center h-full">
        <p className="text-lg text-muted-foreground">Loading models...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="text-center md:text-left">
          <h1 className="text-3xl font-bold text-primary">Data Models</h1>
          <p className="text-muted-foreground">Define and manage your dynamic data structures.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-grow md:flex-grow-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="Search models..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-full md:w-64"
                />
            </div>
            <Button onClick={handleCreateNew} className="bg-accent text-accent-foreground hover:bg-accent/90">
                <PlusCircle className="mr-2 h-4 w-4" /> Create Model
            </Button>
        </div>
      </header>

      <Alert className="mb-8">
        <Code2 className="h-4 w-4" />
        <AlertTitle>Accessing Data via API (Examples)</AlertTitle>
        <AlertDescription>
          You can programmatically access your models and data objects using an internal API. Here are some example endpoints:
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><code>GET /api/data-weaver/models</code> - Retrieves a list of all defined models.</li>
            <li><code>GET /api/data-weaver/models/{'{modelId}'}</code> - Retrieves details for a specific model.</li>
            <li><code>GET /api/data-weaver/models/{'{modelId}'}/objects</code> - Retrieves all data objects for a specific model.</li>
            <li><code>GET /api/data-weaver/models/{'{modelId}'}/objects/{'{objectId}'}</code> - Retrieves a specific data object.</li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            <Info size={14} className="inline mr-1 relative -top-px" />
            <strong>Important Note:</strong> The current application prototype uses client-side browser storage (localStorage) for data persistence. The API endpoints listed above are illustrative examples. For these APIs to serve data dynamically from a persistent backend store (like a database), further backend development to connect to such a data source would be required.
          </p>
        </AlertDescription>
      </Alert>

      {filteredModels.length === 0 ? (
         <Card className="col-span-full text-center py-12">
          <CardContent>
            <DatabaseZap size={48} className="mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold">No Models Found</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm ? `No models match your search for "${searchTerm}".` : "You haven't defined any models yet."}
            </p>
            {!searchTerm && (
              <Button onClick={handleCreateNew} variant="default">
                <PlusCircle className="mr-2 h-4 w-4" /> Create Your First Model
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredModels.map((model) => (
            <Card key={model.id} className="flex flex-col shadow-lg hover:shadow-xl transition-shadow duration-300">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-xl text-primary">{model.name}</CardTitle>
                  <DatabaseZap className="h-6 w-6 text-muted-foreground" />
                </div>
                <CardDescription className="h-10 overflow-hidden text-ellipsis">
                  {model.description || 'No description provided.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-grow">
                <h4 className="font-semibold mb-2 text-sm">Properties ({model.properties.length}):</h4>
                <ScrollArea className="h-24">
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    {model.properties.slice(0, 5).map((prop) => (
                      <li key={prop.id} className="truncate">
                        {prop.name} <span className="text-xs opacity-70">({prop.type}{prop.type === 'relationship' ? ` - ${prop.relationshipType}` : ''})</span>
                      </li>
                    ))}
                    {model.properties.length > 5 && <li className="text-xs opacity-70">...and more</li>}
                  </ul>
                </ScrollArea>
              </CardContent>
              <CardFooter className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={() => handleEdit(model)} className="w-full">
                  <Edit className="mr-1 h-3 w-3" /> Edit
                </Button>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="w-full">
                      <Trash2 className="mr-1 h-3 w-3" /> Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the model
                        "{model.name}" and all its associated data objects.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(model.id)}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <Link href={`/data/${model.id}`} passHref legacyBehavior>
                  <a className="w-full col-span-3 mt-2 md:col-span-1 md:mt-0">
                    <Button variant="default" size="sm" className="w-full">
                      <Eye className="mr-1 h-3 w-3" /> View Data
                    </Button>
                  </a>
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isFormOpen} onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) { // When dialog closes
            setEditingModel(null); // Clear editing state
            form.reset({ // Reset form to pristine state for creation
                 name: '',
                 description: '',
                 properties: [{ id: crypto.randomUUID(), name: '', type: 'string', required: false, relationshipType: 'one' }],
            });
          }
        }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="p-6 pb-4 flex-shrink-0 border-b">
            <DialogTitle>{editingModel ? 'Edit Model' : 'Create New Model'}</DialogTitle>
            <DialogDescription>
              {editingModel ? `Update the details for the "${editingModel.name}" model.` : 'Define a new data model structure for your application.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-grow min-h-0 overflow-hidden">
            {/* Render ModelForm only when isFormOpen is true to ensure it re-initializes with fresh data or default values */}
            {isFormOpen && (
              <ModelForm
                form={form}
                onSubmit={onSubmit}
                onCancel={() => setIsFormOpen(false)}
                existingModel={editingModel || undefined}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
