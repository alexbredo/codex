
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useData } from '@/contexts/data-context';
import { useAuth, withAuth } from '@/contexts/auth-context';
import type { Model, ValidationRuleset } from '@/lib/types';
import { PlusCircle, Eye, DatabaseZap, ListChecks, Search, Info, Code2, StickyNote, FolderOpen, Loader2, RefreshCw, ShieldCheck, DownloadCloud, UploadCloud, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from "@/hooks/use-toast";
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Label } from '@/components/ui/label';

function ModelsPageInternal() {
  const { models, modelGroups, deleteModel, validationRulesets, isReady: dataContextIsReady, fetchData, formatApiError } = useData();
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [openAccordionItems, setOpenAccordionItems] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileStringContent, setFileStringContent] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);


  useEffect(() => {
    fetchData('Navigated to Model Admin');
  }, [fetchData]);


  const filteredModels = useMemo(() => {
    if (!searchTerm) return models;
    const lowercasedTerm = searchTerm.toLowerCase();
    return models.filter(model => {
      const group = modelGroups.find(g => g.id === model.modelGroupId);
      return model.name.toLowerCase().includes(lowercasedTerm) ||
        (model.description && model.description.toLowerCase().includes(lowercasedTerm)) ||
        (group && group.name.toLowerCase().includes(lowercasedTerm));
    });
  }, [models, searchTerm, modelGroups]);

  const groupedModels = useMemo(() => {
    return filteredModels.reduce((acc, model) => {
      const group = modelGroups.find(g => g.id === model.modelGroupId) || { name: 'Default', id: 'default' };
      if (!acc[group.name]) {
        acc[group.name] = [];
      }
      acc[group.name].push(model);
      return acc;
    }, {} as Record<string, Model[]>);
  }, [filteredModels, modelGroups]);

  const sortedNamespaces = useMemo(() => {
    return Object.keys(groupedModels).sort((a, b) => {
      if (a === 'Default') return -1;
      if (b === 'Default') return 1;
      return a.localeCompare(b);
    });
  }, [groupedModels]);

  useEffect(() => {
    if (dataContextIsReady && sortedNamespaces.length > 0 && openAccordionItems.length === 0) {
      setOpenAccordionItems(sortedNamespaces);
    }
  }, [dataContextIsReady, sortedNamespaces, openAccordionItems.length]);


  const handleCreateNew = () => {
    router.push('/models/new');
  };

  const handleRefreshData = async () => {
    setIsRefreshing(true);
    try {
      await fetchData('Manual Refresh Model Admin');
      toast({ title: "Models Refreshed", description: "The latest model data has been loaded." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Refresh Failed", description: error.message || "Could not refresh model data." });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFileStringContent(null); 
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setFileStringContent(e.target?.result as string);
      };
      reader.onerror = () => {
        toast({ variant: "destructive", title: "File Read Error", description: "Could not read the selected file for preview." });
        setFileStringContent("Error: Could not read file content.");
      };
      reader.readAsText(file);
    } else {
      setSelectedFile(null);
    }
  };

  const handleImportSubmit = async () => {
    if (!selectedFile || !fileStringContent) { 
      toast({ variant: "destructive", title: "No File Selected", description: "Please select a JSON file to import." });
      return;
    }
    setIsImporting(true);
    try {
      const response = await fetch('/api/codex-structure/import/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileContent: fileStringContent }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        const errorMsg = await formatApiError(response, responseData.error || 'Import failed');
        throw new Error(errorMsg);
      }

      toast({ title: "Import Submitted", description: responseData.message || "File received by server. Further processing to be implemented." });
      setIsImportDialogOpen(false);
      setSelectedFile(null);
      setFileStringContent(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await fetchData('After Model Import Attempt');
    } catch (error: any) {
      console.error("Import Error:", error);
      toast({ variant: "destructive", title: "Import Error", description: error.message || "Failed to import model." });
    } finally {
      setIsImporting(false);
    }
  };


  if (!dataContextIsReady) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading model admin...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="text-center md:text-left">
          <h1 className="text-3xl font-bold text-primary">Model Admin</h1>
          <p className="text-muted-foreground">Define and manage your dynamic data structures.</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto justify-center md:justify-end">
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
             <Button onClick={handleRefreshData} variant="outline" disabled={isRefreshing}>
              {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
            {hasPermission('models:import_export') && (
                <Dialog open={isImportDialogOpen} onOpenChange={(open) => {
                    setIsImportDialogOpen(open);
                    if (!open) {
                        setSelectedFile(null);
                        setFileStringContent(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                    }
                }}>
                    <DialogTrigger asChild>
                        <Button variant="outline">
                            <UploadCloud className="mr-2 h-4 w-4" /> Import Model
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-xl">
                        <DialogHeader>
                            <DialogTitle>Import Model from JSON</DialogTitle>
                            <DialogDescription>
                                Select a JSON file previously exported from CodexStructure. This will attempt to import the model structure and its data.
                                Ensure the file format is correct. The file preview below should look like valid JSON.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="model-json-file" className="text-right col-span-1">
                                    JSON File
                                </Label>
                                <Input
                                    id="model-json-file"
                                    type="file"
                                    accept=".json"
                                    onChange={handleFileSelect}
                                    ref={fileInputRef}
                                    className="col-span-3"
                                />
                            </div>
                            {selectedFile && (
                                <p className="text-xs text-muted-foreground col-span-4 text-center">Selected: {selectedFile.name}</p>
                            )}
                            {fileStringContent && (
                                <div className="mt-4 col-span-4">
                                    <Label className="text-sm font-medium">File Preview:</Label>
                                    <ScrollArea className="h-48 mt-1 rounded-md border p-2 bg-muted/50">
                                        <pre className="text-xs whitespace-pre-wrap break-all">
                                            {fileStringContent}
                                        </pre>
                                    </ScrollArea>
                                </div>
                            )}
                        </div>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button type="button" variant="outline" disabled={isImporting}>Cancel</Button>
                            </DialogClose>
                            <Button type="button" onClick={handleImportSubmit} disabled={!selectedFile || isImporting}>
                                {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                                {isImporting ? "Importing..." : "Import"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
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
              <AlertDescription className="pt-2 px-4 pb-4">
                You can programmatically access your models and data objects using an internal API. Here are some example endpoints:
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li><code>GET /api/codex-structure/models</code> - Retrieves a list of all defined models.</li>
                  <li><code>GET /api/codex-structure/models/{'{modelId}'}</code> - Retrieves details for a specific model.</li>
                  <li><code>GET /api/codex-structure/models/{'{modelId}'}/objects</code> - Retrieves all data objects for a specific model.</li>
                  <li><code>GET /api/codex-structure/models/{'{modelId}'}/objects/{'{objectId}'}</code> - Retrieves a specific data object.</li>
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                  <Info size={14} className="inline mr-1 relative -top-px" />
                  <strong>Important Note:</strong> The application uses an SQLite database for persistence.
                </p>
              </AlertDescription>
            </Alert>
          </AccordionContent>
        </AccordionItem>
      </Accordion>


      {sortedNamespaces.length === 0 && models.length === 0 ? (
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
        <TooltipProvider>
          <Accordion
            type="multiple"
            value={openAccordionItems}
            onValueChange={setOpenAccordionItems}
            className="w-full space-y-4"
          >
            {sortedNamespaces.map((groupName) => (
              <AccordionItem key={groupName} value={groupName} className="border rounded-lg">
                <AccordionTrigger className="p-4 hover:no-underline data-[state=open]:border-b">
                  <div className="flex items-center text-xl">
                    <FolderOpen className="h-6 w-6 mr-3 text-primary" />
                    <span className="font-semibold">{groupName}</span>
                    <Badge variant="secondary" className="ml-3">{groupedModels[groupName].length} model(s)</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {groupedModels[groupName].sort((a,b) => a.name.localeCompare(b.name)).map((model) => (
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
                              <StickyNote size={12} className="mr-1.5 text-primary/70" /> Display As: <span className="font-medium text-primary/90 ml-1 truncate">{model.displayPropertyNames.join(' ')}</span>
                            </div>
                          )}
                        </CardHeader>
                        <CardContent className="flex-grow">
                           {model.properties.length > 0 ? (
                             <ScrollArea className="h-24">
                               <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                {model.properties.sort((a,b) => a.orderIndex - b.orderIndex).slice(0, 5).map((prop) => {
                                  let validationRuleName: string | undefined;
                                  if (prop.type === 'string' && prop.validationRulesetId) {
                                    const rule = validationRulesets.find(rs => rs.id === prop.validationRulesetId);
                                    validationRuleName = rule?.name;
                                  }
                                  return (
                                    <li key={prop.id} className="truncate flex items-center">
                                      {prop.name}
                                      <span className="text-xs opacity-70 ml-1">({prop.type}{prop.type === 'relationship' ? ` - ${prop.relationshipType}` : ''})</span>
                                      {validationRuleName && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <ShieldCheck className="h-3.5 w-3.5 ml-1.5 text-blue-500 shrink-0" />
                                          </TooltipTrigger>
                                          <TooltipContent side="top" className="text-xs">
                                            <p>Rule: {validationRuleName}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                    </li>
                                  );
                                })}
                                {model.properties.length > 5 && <li className="text-xs opacity-70">...and {model.properties.length - 5} more</li>}
                              </ul>
                            </ScrollArea>
                          ) : (
                            <p className="text-sm text-muted-foreground">No properties defined.</p>
                          )}
                        </CardContent>
                        <CardFooter className="grid grid-cols-2 gap-2 pt-4">
                          <Button asChild variant="default" size="sm" className="w-full">
                            <Link href={`/data/${model.id}`}>
                              <Eye className="mr-1 h-3 w-3" /> View Data
                            </Link>
                          </Button>
                          <Button asChild variant="outline" size="sm" className="w-full">
                            <Link href={`/models/view/${model.id}`}>
                              <Settings2 className="mr-1 h-3 w-3" /> Manage Structure
                            </Link>
                          </Button>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </TooltipProvider>
      )}
    </div>
  );
}

export default withAuth(ModelsPageInternal, 'models:manage');
