
'use client';

import { useState, useEffect, useMemo } from 'react'; // Added useMemo
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
// ModelForm is no longer rendered directly here, but on its own pages
// import ModelForm from '@/components/models/model-form'; 
// import type { ModelFormValues } from '@/components/models/model-form-schema';
// import { modelFormSchema } from '@/components/models/model-form-schema';
import { useData } from '@/contexts/data-context';
import type { Model } from '@/lib/types';
import { PlusCircle, Edit, Trash2, Eye, DatabaseZap, ListChecks, Search, Info, Code2, StickyNote, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation'; // For navigation
import { useToast } from "@/hooks/use-toast";
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function ModelsPage() {
  const { models, deleteModel, isReady } = useData(); // Removed addModel, updateModel, getModelByName as they are handled on new/edit pages
  const { toast } = useToast();
  const router = useRouter(); // For navigation
  const [searchTerm, setSearchTerm] = useState('');

  // Form state and logic are moved to dedicated new/edit pages
  // const [isFormOpen, setIsFormOpen] = useState(false);
  // const [editingModel, setEditingModel] = useState<Model | null>(null);
  // const form = useForm<ModelFormValues>({ ... });

  const handleCreateNew = () => {
    router.push('/models/new');
  };

  const handleEdit = (model: Model) => {
    router.push(`/models/edit/${model.id}`);
  };
  
  const handleDelete = (modelId: string, modelName: string) => {
    deleteModel(modelId);
    toast({ title: "Model Deleted", description: `Model "${modelName}" and its associated data have been successfully deleted.` });
  };

  const sortedModels = useMemo(() => {
    return [...models].sort((a, b) => a.name.localeCompare(b.name));
  }, [models]);

  const filteredModels = useMemo(() => {
    if (!searchTerm) {
      return sortedModels;
    }
    return sortedModels.filter(model =>
      model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (model.description && model.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [sortedModels, searchTerm]);


  if (!isReady) {
    return (
      <div className="flex justify-center items-center h-screen">
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

      <Accordion type="single" collapsible className="mb-8 w-full">
        <AccordionItem value="api-help" className="border rounded-lg">
          <AccordionTrigger className="p-4 hover:no-underline data-[state=open]:border-b">
            <div className="flex items-center text-lg">
              <Code2 className="h-5 w-5 mr-2 text-primary" />
              <span className="font-semibold">Accessing Data via API (Examples)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="p-0">
            <Alert variant="default" className="border-0 rounded-t-none">
              {/* AlertTitle is now part of AccordionTrigger */}
              <AlertDescription className="pt-2 px-4 pb-4"> {/* Added padding for content */}
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
          </AccordionContent>
        </AccordionItem>
      </Accordion>


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
                 {model.displayPropertyNames && model.displayPropertyNames.length > 0 && (
                  <div className="text-xs text-muted-foreground pt-1 flex items-center">
                    <StickyNote size={12} className="mr-1.5 text-primary/70" /> Display As: <span className="font-medium text-primary/90 ml-1 truncate">{model.displayPropertyNames.join(', ')}</span>
                  </div>
                )}
              </CardHeader>
              <CardContent className="flex-grow">
                <h4 className="font-semibold mb-2 text-sm">Properties ({model.properties.length}):</h4>
                {model.properties.length > 0 ? (
                  <ScrollArea className="h-24">
                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                      {model.properties.slice(0, 5).map((prop) => (
                        <li key={prop.id} className="truncate">
                          {prop.name} <span className="text-xs opacity-70">({prop.type}{prop.type === 'relationship' ? ` - ${prop.relationshipType}` : ''})</span>
                        </li>
                      ))}
                      {model.properties.length > 5 && <li className="text-xs opacity-70">...and {model.properties.length - 5} more</li>}
                    </ul>
                  </ScrollArea>
                ) : (
                  <p className="text-sm text-muted-foreground">No properties defined.</p>
                )}
              </CardContent>
              <CardFooter className="grid grid-cols-3 gap-2 pt-4"> {/* Added pt-4 for spacing */}
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
                      <AlertDialogAction onClick={() => handleDelete(model.id, model.name)}>
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
      {/* Dialog for ModelForm removed */}
    </div>
  );
}

    
