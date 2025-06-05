
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
import { withAuth } from '@/contexts/auth-context';
import type { ValidationRuleset } from '@/lib/types';
import { validationRuleFormSchema, type ValidationRuleFormValues } from '@/components/admin/validation-rules/validation-rule-form-schema';
import ValidationRuleForm from '@/components/admin/validation-rules/validation-rule-form';
import { PlusCircle, Edit, Trash2, Search, ShieldCheck, Loader2, Regex } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription as FormDialogDescription, // Renamed to avoid conflict with AlertDialog
  DialogHeader as FormDialogHeader, // Renamed
  DialogTitle as FormDialogTitle, // Renamed
} from "@/components/ui/dialog";
import { Badge } from '@/components/ui/badge';


function ValidationRulesAdminPageInternal() {
  const { validationRulesets, addValidationRuleset, updateValidationRuleset, deleteValidationRuleset, isReady, fetchData } = useData();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ValidationRuleset | null>(null);

  const form = useForm<ValidationRuleFormValues>({
    resolver: zodResolver(validationRuleFormSchema),
    defaultValues: { name: '', description: '', regexPattern: '' },
  });

  useEffect(() => {
    fetchData('Navigated to Validation Rules Admin');
  }, [fetchData]);

  useEffect(() => {
    if (editingRule) {
      form.reset({
        name: editingRule.name,
        description: editingRule.description || '',
        regexPattern: editingRule.regexPattern,
      });
    } else {
      form.reset({ name: '', description: '', regexPattern: '' });
    }
  }, [editingRule, form, isFormOpen]);

  const filteredRulesets = useMemo(() => {
    return validationRulesets.filter(rule =>
      rule.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (rule.description && rule.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
      rule.regexPattern.toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a,b) => a.name.localeCompare(b.name));
  }, [validationRulesets, searchTerm]);

  const handleCreateNew = () => {
    setEditingRule(null);
    setIsFormOpen(true);
  };

  const handleEdit = (rule: ValidationRuleset) => {
    setEditingRule(rule);
    setIsFormOpen(true);
  };

  const handleDelete = async (ruleId: string, ruleName: string) => {
    try {
      await deleteValidationRuleset(ruleId);
      toast({ title: "Validation Rule Deleted", description: `Rule "${ruleName}" has been successfully deleted.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error Deleting Rule", description: error.message });
    }
  };

  const onSubmit = async (values: ValidationRuleFormValues) => {
    // Check for name uniqueness
    const existingByName = validationRulesets.find(rs => rs.name.toLowerCase() === values.name.toLowerCase());
    if (existingByName && (!editingRule || existingByName.id !== editingRule.id)) {
        form.setError("name", { type: "manual", message: "A validation rule with this name already exists." });
        return;
    }

    try {
      if (editingRule) {
        await updateValidationRuleset(editingRule.id, values);
        toast({ title: "Validation Rule Updated", description: `Rule "${values.name}" has been updated.` });
      } else {
        await addValidationRuleset(values);
        toast({ title: "Validation Rule Created", description: `Rule "${values.name}" has been created.` });
      }
      setIsFormOpen(false);
      setEditingRule(null);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error Saving Rule", description: error.message });
    }
  };

  if (!isReady) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading validation rules admin...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="text-center md:text-left">
          <h1 className="text-3xl font-bold text-primary flex items-center">
            <ShieldCheck className="mr-3 h-8 w-8" /> Validation Rule Administration
          </h1>
          <p className="text-muted-foreground">Define and manage reusable regex validation rules.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-grow md:flex-grow-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search rules..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full md:w-64"
            />
          </div>
          <Button onClick={handleCreateNew} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <PlusCircle className="mr-2 h-4 w-4" /> Create Rule
          </Button>
        </div>
      </header>

      <Dialog open={isFormOpen} onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) setEditingRule(null);
      }}>
        <DialogContent className="sm:max-w-[625px]">
          <FormDialogHeader>
            <FormDialogTitle>{editingRule ? 'Edit Validation Rule' : 'Create New Validation Rule'}</FormDialogTitle>
            <FormDialogDescription>
              {editingRule ? `Update the details for the "${editingRule.name}" rule.` : 'Define a new regex validation rule.'}
            </FormDialogDescription>
          </FormDialogHeader>
          <ValidationRuleForm
            form={form}
            onSubmit={onSubmit}
            onCancel={() => { setIsFormOpen(false); setEditingRule(null); }}
            existingRule={editingRule || undefined}
            isLoading={form.formState.isSubmitting}
          />
        </DialogContent>
      </Dialog>

      {filteredRulesets.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Regex size={48} className="mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold">No Validation Rules Found</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm ? `No rules match your search for "${searchTerm}".` : "You haven't created any validation rules yet."}
            </p>
            {!searchTerm && (
              <Button onClick={handleCreateNew} variant="default">
                <PlusCircle className="mr-2 h-4 w-4" /> Create First Rule
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
                <TableHead>Regex Pattern</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right w-[150px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRulesets.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell><Badge variant="secondary" className="font-mono">{rule.regexPattern}</Badge></TableCell>
                  <TableCell className="text-muted-foreground truncate max-w-xs">{rule.description || 'N/A'}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(rule)} className="mr-2 hover:text-primary">
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
                            This action cannot be undone. This will permanently delete the rule "{rule.name}".
                            This rule cannot be deleted if it's currently assigned to any model properties.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(rule.id, rule.name)}>
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
    </div>
  );
}

export default withAuth(ValidationRulesAdminPageInternal, ['administrator']);
