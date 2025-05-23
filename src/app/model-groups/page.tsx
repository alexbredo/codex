
'use client';

import { useState, useEffect, useMemo } from 'react';
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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useAuth, withAuth } from '@/contexts/auth-context'; // Import withAuth
import type { ModelGroup, ModelGroupFormValues } from '@/lib/types';
import { modelGroupFormSchema } from '@/components/model-groups/model-group-form-schema';
import ModelGroupForm from '@/components/model-groups/model-group-form';
import { PlusCircle, Edit, Trash2, Search, FolderKanban, Loader2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  // DialogTrigger, // No longer needed as button opens dialog programmatically
  // DialogClose // No longer needed if form handles close
} from "@/components/ui/dialog";


function ModelGroupsPageInternal() {
  const { modelGroups, addModelGroup, updateModelGroup, deleteModelGroup, getModelGroupByName, isReady, fetchData } = useData();
  const { toast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ModelGroup | null>(null);

  const form = useForm<ModelGroupFormValues>({
    resolver: zodResolver(modelGroupFormSchema),
    defaultValues: { name: '', description: '' },
  });

  useEffect(() => {
    if (editingGroup) {
      form.reset({
        name: editingGroup.name,
        description: editingGroup.description || '',
      });
    } else {
      form.reset({ name: '', description: '' });
    }
  }, [editingGroup, form, isFormOpen]); // Added isFormOpen to reset on dialog close too

  const filteredGroups = useMemo(() => {
    return modelGroups.filter(group =>
      group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (group.description && group.description.toLowerCase().includes(searchTerm.toLowerCase()))
    ).sort((a,b) => a.name.localeCompare(b.name));
  }, [modelGroups, searchTerm]);

  const handleCreateNew = () => {
    setEditingGroup(null);
    // form.reset is handled by useEffect based on editingGroup
    setIsFormOpen(true);
  };

  const handleEdit = (group: ModelGroup) => {
    setEditingGroup(group);
    setIsFormOpen(true);
  };

  const handleDelete = async (groupId: string, groupName: string) => {
    try {
      await deleteModelGroup(groupId);
      toast({ title: "Model Group Deleted", description: `Group "${groupName}" has been successfully deleted.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error Deleting Group", description: error.message });
    }
  };

  const onSubmit = async (values: ModelGroupFormValues) => {
    const existingByName = getModelGroupByName(values.name);
    if (existingByName && (!editingGroup || existingByName.id !== editingGroup.id)) {
        form.setError("name", { type: "manual", message: "A model group with this name already exists." });
        return;
    }

    try {
      if (editingGroup) {
        await updateModelGroup(editingGroup.id, values);
        toast({ title: "Model Group Updated", description: `Group "${values.name}" has been updated.` });
      } else {
        await addModelGroup(values);
        toast({ title: "Model Group Created", description: `Group "${values.name}" has been created.` });
      }
      setIsFormOpen(false);
      setEditingGroup(null); // Ensure editingGroup is cleared
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error Saving Group", description: error.message });
    }
  };

  if (!isReady) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading model groups admin...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="text-center md:text-left">
          <h1 className="text-3xl font-bold text-primary">Model Group Admin</h1>
          <p className="text-muted-foreground">Manage namespaces for organizing your models.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-grow md:flex-grow-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search groups..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full md:w-64"
            />
          </div>
          <Button onClick={handleCreateNew} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <PlusCircle className="mr-2 h-4 w-4" /> Create Group
          </Button>
        </div>
      </header>

      <Dialog open={isFormOpen} onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) setEditingGroup(null); // Clear editing state when dialog closes
      }}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>{editingGroup ? 'Edit Model Group' : 'Create New Model Group'}</DialogTitle>
            <DialogDescription>
              {editingGroup ? `Update the details for the "${editingGroup.name}" group.` : 'Define a new group to organize your models.'}
            </DialogDescription>
          </DialogHeader>
          <ModelGroupForm
            form={form}
            onSubmit={onSubmit}
            onCancel={() => { setIsFormOpen(false); setEditingGroup(null); }}
            existingGroup={editingGroup || undefined}
            isLoading={form.formState.isSubmitting}
          />
        </DialogContent>
      </Dialog>

      {filteredGroups.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <FolderKanban size={48} className="mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold">No Model Groups Found</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm ? `No groups match your search for "${searchTerm}".` : "You haven't created any model groups yet."}
            </p>
            {!searchTerm && (
              <Button onClick={handleCreateNew} variant="default">
                <PlusCircle className="mr-2 h-4 w-4" /> Create First Group
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
                <TableHead className="text-right w-[150px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGroups.map((group) => (
                <TableRow key={group.id}>
                  <TableCell className="font-medium">{group.name}</TableCell>
                  <TableCell className="text-muted-foreground truncate max-w-xs">{group.description || 'N/A'}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(group)} className="mr-2 hover:text-primary">
                      <Edit className="h-4 w-4" />
                    </Button>
                    {group.name !== 'Default' && ( 
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
                                This action cannot be undone. This will permanently delete the group "{group.name}".
                                Models in this group will need to be reassigned if this group is in use.
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(group.id, group.name)}>
                                Delete
                            </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                        </AlertDialog>
                    )}
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

export default withAuth(ModelGroupsPageInternal, ['administrator']);
