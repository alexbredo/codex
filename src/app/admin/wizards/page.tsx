

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useData } from '@/contexts/data-context';
import { withAuth } from '@/contexts/auth-context';
import type { Wizard } from '@/lib/types';
import { PlusCircle, Edit, Trash2, Search, Loader2, Wand2, StepForward } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Badge } from '@/components/ui/badge';


function WizardsAdminPageInternal() {
  const { wizards, deleteWizard, isReady: dataIsReady, fetchData } = useData();
  const { toast } = useToast();
  const router = useRouter();
  
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData('Navigated to Wizard Admin');
  }, [fetchData]);

  const filteredWizards = useMemo(() => {
    return wizards.filter(w =>
      w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (w.description && w.description.toLowerCase().includes(searchTerm.toLowerCase()))
    ).sort((a,b) => a.name.localeCompare(b.name));
  }, [wizards, searchTerm]);

  const handleCreateNew = () => {
    router.push('/admin/wizards/new');
  };

  const handleEdit = (wizardId: string) => {
    router.push(`/admin/wizards/edit/${wizardId}`);
  };

  const handleDelete = async (wizardId: string, wizardName: string) => {
    try {
      await deleteWizard(wizardId);
      toast({ title: "Wizard Deleted", description: `Wizard "${wizardName}" has been successfully deleted.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error Deleting Wizard", description: error.message });
    }
  };
  
  if (!dataIsReady) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading wizard admin...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="text-center md:text-left">
          <h1 className="text-3xl font-bold text-primary flex items-center">
            <Wand2 className="mr-3 h-8 w-8" /> Wizard Administration
          </h1>
          <p className="text-muted-foreground">Define and manage guided data entry flows.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-grow md:flex-grow-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search wizards..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full md:w-64"
            />
          </div>
          <Button onClick={handleCreateNew} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <PlusCircle className="mr-2 h-4 w-4" /> Create Wizard
          </Button>
        </div>
      </header>

      {filteredWizards.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Wand2 size={48} className="mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold">No Wizards Found</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm ? `No wizards match your search for "${searchTerm}".` : "You haven't created any wizards yet."}
            </p>
            {!searchTerm && (
              <Button onClick={handleCreateNew} variant="default">
                <PlusCircle className="mr-2 h-4 w-4" /> Create First Wizard
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
                <TableHead>Steps</TableHead>
                <TableHead className="text-right w-[150px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredWizards.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium">{w.name}</TableCell>
                  <TableCell className="text-muted-foreground truncate max-w-xs">{w.description || 'N/A'}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="flex items-center gap-1.5 w-16 justify-center">
                        <StepForward className="h-3 w-3" />
                        {w.steps.length}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(w.id)} className="mr-2 hover:text-primary">
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
                            This action cannot be undone. This will permanently delete the wizard "{w.name}".
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(w.id, w.name)}>Delete</AlertDialogAction>
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

export default withAuth(WizardsAdminPageInternal, 'admin:manage_wizards');
