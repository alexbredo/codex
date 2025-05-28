
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useData } from '@/contexts/data-context';
import { useAuth, withAuth } from '@/contexts/auth-context';
import type { WorkflowWithDetails } from '@/lib/types';
import type { WorkflowFormValues, WorkflowStateFormValues } from '@/components/workflows/workflow-form-schema';
import { workflowFormSchema } from '@/components/workflows/workflow-form-schema';
import WorkflowForm from '@/components/workflows/workflow-form';
import { PlusCircle, Edit, Trash2, Search, Workflow as WorkflowIconLucide, Loader2, Network } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

function mapWorkflowToFormValues(workflow?: WorkflowWithDetails): WorkflowFormValues {
  if (!workflow) {
    return {
      name: '',
      description: '',
      states: [{ id: crypto.randomUUID(), name: 'New', description: 'Initial state', isInitial: true, successorStateNames: [] }],
    };
  }
  return {
    name: workflow.name,
    description: workflow.description || '',
    states: workflow.states.map(state => {
      const successorNames = state.successorStateIds
        .map(id => workflow.states.find(s => s.id === id)?.name)
        .filter(name => !!name) as string[];
      return {
        id: state.id,
        name: state.name,
        description: state.description || '',
        isInitial: !!state.isInitial,
        successorStateNames: successorNames,
      };
    }),
  };
}


function WorkflowsAdminPageInternal() {
  const { workflows, addWorkflow, updateWorkflow, deleteWorkflow, isReady: dataIsReady, fetchData } = useData();
  const { toast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowWithDetails | null>(null);

  const form = useForm<WorkflowFormValues>({
    resolver: zodResolver(workflowFormSchema),
    defaultValues: mapWorkflowToFormValues(),
  });

  useEffect(() => {
    if (isFormOpen) {
      form.reset(mapWorkflowToFormValues(editingWorkflow ?? undefined));
    }
  }, [editingWorkflow, form, isFormOpen]);

  const filteredWorkflows = useMemo(() => {
    return workflows.filter(wf =>
      wf.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (wf.description && wf.description.toLowerCase().includes(searchTerm.toLowerCase()))
    ).sort((a,b) => a.name.localeCompare(b.name));
  }, [workflows, searchTerm]);

  const handleCreateNew = () => {
    setEditingWorkflow(null);
    setIsFormOpen(true);
  };

  const handleEdit = (workflow: WorkflowWithDetails) => {
    setEditingWorkflow(workflow);
    setIsFormOpen(true);
  };

  const handleDelete = async (workflowId: string, workflowName: string) => {
    try {
      await deleteWorkflow(workflowId);
      toast({ title: "Workflow Deleted", description: `Workflow "${workflowName}" has been successfully deleted.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error Deleting Workflow", description: error.message });
    }
  };

  const onSubmit = async (values: WorkflowFormValues) => {
    const payloadStates = values.states.map(s => ({
        id: s.id?.startsWith('temp-') ? undefined : s.id, // Clear temporary client-side IDs for new states
        name: s.name,
        description: s.description,
        isInitial: s.isInitial,
        successorStateNames: s.successorStateNames || [],
    }));
    
    const payload = {
        name: values.name,
        description: values.description,
        states: payloadStates,
    };

    try {
      if (editingWorkflow) {
        await updateWorkflow(editingWorkflow.id, payload);
        toast({ title: "Workflow Updated", description: `Workflow "${values.name}" has been updated.` });
      } else {
        await addWorkflow(payload);
        toast({ title: "Workflow Created", description: `Workflow "${values.name}" has been created.` });
      }
      setIsFormOpen(false);
      setEditingWorkflow(null);
      await fetchData(); // Re-fetch all data including workflows to get latest state
    } catch (error: any)      {
      let errorMessage = "Failed to save workflow.";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      toast({ variant: "destructive", title: "Error Saving Workflow", description: errorMessage });
    }
  };
  
  if (!dataIsReady) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading workflow admin...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="text-center md:text-left">
          <h1 className="text-3xl font-bold text-primary flex items-center">
            <WorkflowIconLucide className="mr-3 h-8 w-8" /> Workflow Administration
          </h1>
          <p className="text-muted-foreground">Define and manage custom workflows for your data models.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-grow md:flex-grow-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search workflows..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full md:w-64"
            />
          </div>
          <Button onClick={handleCreateNew} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <PlusCircle className="mr-2 h-4 w-4" /> Create Workflow
          </Button>
        </div>
      </header>

      <Dialog open={isFormOpen} onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) setEditingWorkflow(null);
      }}>
        <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-2xl">
              {editingWorkflow ? 'Edit Workflow' : 'Create New Workflow'}
            </DialogTitle>
            <DialogDescription>
              {editingWorkflow ? `Update details for "${editingWorkflow.name}".` : 'Define states and transitions for your new workflow.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-grow overflow-hidden"> {/* This div will handle the scrolling of the form */}
             <WorkflowForm
                form={form}
                onSubmit={onSubmit}
                onCancel={() => { setIsFormOpen(false); setEditingWorkflow(null); }}
                existingWorkflow={editingWorkflow || undefined}
                isLoading={form.formState.isSubmitting}
              />
          </div>
        </DialogContent>
      </Dialog>

      {filteredWorkflows.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Network size={48} className="mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold">No Workflows Found</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm ? `No workflows match your search for "${searchTerm}".` : "You haven't created any workflows yet."}
            </p>
            {!searchTerm && (
              <Button onClick={handleCreateNew} variant="default">
                <PlusCircle className="mr-2 h-4 w-4" /> Create First Workflow
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>States</TableHead>
                <TableHead className="text-right w-[150px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredWorkflows.map((wf) => (
                <TableRow key={wf.id}>
                  <TableCell className="font-medium">{wf.name}</TableCell>
                  <TableCell className="text-muted-foreground truncate max-w-xs">{wf.description || 'N/A'}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{wf.states.length}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(wf)} className="mr-2 hover:text-primary">
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
                            This action cannot be undone. This will permanently delete the workflow "{wf.name}".
                            It cannot be deleted if it's currently assigned to any models.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(wf.id, wf.name)}>Delete</AlertDialogAction>
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
    </div>
  );
}

export default withAuth(WorkflowsAdminPageInternal, ['administrator']);
