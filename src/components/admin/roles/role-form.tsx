
'use client';

import * as React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import type { RoleFormValues } from './role-form-schema';
import type { Permission, Model } from '@/lib/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlusCircle, Trash2, Database, Shield, Edit2, KeyRound } from 'lucide-react';
import { useData } from '@/contexts/data-context';

interface RoleFormProps {
  form: UseFormReturn<RoleFormValues>;
  onSubmit: (values: RoleFormValues) => void;
  onCancel: () => void;
  isLoading?: boolean;
  isEditing?: boolean;
  isSystemRole?: boolean;
  allPermissions: Record<string, Permission[]>;
}


const permissionDisplayMap: Record<string, { label: string; description: string }> = {
    create: { label: "Create Objects", description: "Can create new objects for this model."},
    view: { label: "View Objects", description: "Can see objects of this model." },
    edit: { label: "Edit Objects", description: "Can modify any object of this model." },
    delete: { label: "Delete Objects", description: "Can delete any object of this model." },
    edit_own: { label: "Edit Own Objects", description: "Can only edit objects they own." },
    delete_own: { label: "Delete Own Objects", description: "Can only delete objects they own." },
    manage: { label: "Manage Structure", description: "Can edit/delete the model's structure." },
};

const ModelPermissionCard = ({ model, form }: { model: Model; form: UseFormReturn<RoleFormValues> }) => {
  const permissionIds = useWatch({ control: form.control, name: 'permissionIds' });

  const handlePermissionChange = (permissionAction: string, modelId: string, checked: boolean) => {
    const permissionId = `model:${permissionAction}:${modelId}`;
    const currentPermissions = form.getValues('permissionIds') || [];
    let newPermissions: string[];

    if (checked) {
      newPermissions = [...currentPermissions, permissionId];
    } else {
      newPermissions = currentPermissions.filter(id => id !== permissionId);
    }
    form.setValue('permissionIds', newPermissions, { shouldDirty: true, shouldTouch: true });
  };
  
  return (
    <Card className="bg-background/50">
      <CardHeader className="p-3 border-b">
        <CardTitle className="text-base flex items-center">
            <Database className="h-4 w-4 mr-2 text-primary"/>
            {model.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Object Permissions */}
        <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center"><Edit2 className="h-4 w-4 mr-2 text-muted-foreground"/> Object Actions</h4>
            {['create', 'view', 'edit', 'delete'].map(action => (
                <FormField
                    key={action}
                    control={form.control}
                    name="permissionIds"
                    render={() => (
                        <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                                <Checkbox
                                    checked={permissionIds?.includes(`model:${action}:${model.id}`)}
                                    onCheckedChange={(checked) => handlePermissionChange(action, model.id, !!checked)}
                                />
                            </FormControl>
                            <FormLabel className="text-sm font-normal">{permissionDisplayMap[action].label}</FormLabel>
                        </FormItem>
                    )}
                />
            ))}
        </div>
        {/* Ownership Permissions */}
        <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center"><KeyRound className="h-4 w-4 mr-2 text-muted-foreground"/> Ownership Rules</h4>
            {['edit_own', 'delete_own'].map(action => (
                 <FormField
                    key={action}
                    control={form.control}
                    name="permissionIds"
                    render={() => (
                        <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                                <Checkbox
                                    checked={permissionIds?.includes(`model:${action}:${model.id}`)}
                                    onCheckedChange={(checked) => handlePermissionChange(action, model.id, !!checked)}
                                />
                            </FormControl>
                            <FormLabel className="text-sm font-normal">{permissionDisplayMap[action].label}</FormLabel>
                        </FormItem>
                    )}
                />
            ))}
        </div>
        {/* Structure Permissions */}
        <div className="space-y-2 md:col-span-2">
            <h4 className="text-sm font-semibold flex items-center"><Shield className="h-4 w-4 mr-2 text-muted-foreground"/> Structure Management</h4>
            <FormField
                key="manage"
                control={form.control}
                name="permissionIds"
                render={() => (
                    <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                            <Checkbox
                                checked={permissionIds?.includes(`model:manage:${model.id}`)}
                                onCheckedChange={(checked) => handlePermissionChange('manage', model.id, !!checked)}
                            />
                        </FormControl>
                        <FormLabel className="text-sm font-normal">{permissionDisplayMap['manage'].label}</FormLabel>
                    </FormItem>
                )}
            />
        </div>
      </CardContent>
    </Card>
  );
};


export default function RoleForm({
  form,
  onSubmit,
  onCancel,
  isLoading,
  isEditing,
  isSystemRole,
  allPermissions,
}: RoleFormProps) {
  const { models } = useData();

  const [configuredModelIds, setConfiguredModelIds] = React.useState<Set<string>>(() => {
    // Pre-populate with models that already have permissions in this role
    const initialIds = new Set<string>();
    const permissionIds = form.getValues('permissionIds') || [];
    permissionIds.forEach(id => {
      const parts = id.split(':');
      if (parts[0] === 'model' && parts.length === 3) {
        initialIds.add(parts[2]);
      }
    });
    return initialIds;
  });

  const availableModelsToAdd = React.useMemo(() => {
    return models.filter(m => !configuredModelIds.has(m.id)).sort((a,b) => a.name.localeCompare(b.name));
  }, [models, configuredModelIds]);


  const globalPermissionCategories = React.useMemo(() => {
    return Object.keys(allPermissions).filter(cat => !cat.startsWith('Model:')).sort();
  }, [allPermissions]);


  const handleAddModelPermissions = (modelId: string) => {
    if (modelId) {
      setConfiguredModelIds(prev => new Set(prev).add(modelId));
    }
  };

  const handleRemoveModelConfiguration = (modelId: string) => {
      setConfiguredModelIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(modelId);
          return newSet;
      });
      // Also remove all permissions for this model from the form state
      const currentPermissions = form.getValues('permissionIds') || [];
      const newPermissions = currentPermissions.filter(id => !id.endsWith(`:${modelId}`));
      form.setValue('permissionIds', newPermissions, { shouldDirty: true, shouldTouch: true });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 h-full flex flex-col">
        <ScrollArea className="flex-grow pr-4 -mr-4">
          <div className="space-y-6">
            <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Role Name</FormLabel>
                  <FormControl><Input placeholder="e.g., Content Editor" {...field} disabled={isSystemRole} /></FormControl>
                  {isSystemRole && <FormDescription>System role name cannot be changed.</FormDescription>}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl><Textarea placeholder="A brief description of this role's purpose." {...field} value={field.value ?? ''} disabled={isSystemRole} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Model-Specific Permissions Section */}
            <Card>
              <CardHeader>
                <CardTitle>Model-Specific Permissions</CardTitle>
                <FormDescription>Grant permissions for specific data models.</FormDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Array.from(configuredModelIds).map(modelId => {
                     const model = models.find(m => m.id === modelId);
                     if (!model) return null;
                     return (
                        <div key={modelId} className="relative group">
                            <ModelPermissionCard model={model} form={form} />
                            <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-7 w-7 text-destructive opacity-50 group-hover:opacity-100" onClick={() => handleRemoveModelConfiguration(modelId)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                     );
                  })}
                </div>
                {availableModelsToAdd.length > 0 && (
                    <div className="flex items-center gap-2 pt-4 border-t">
                        <Select onValueChange={handleAddModelPermissions} value="">
                            <SelectTrigger className="flex-grow">
                                <SelectValue placeholder="Select a model to add permissions..." />
                            </SelectTrigger>
                            <SelectContent>
                                {availableModelsToAdd.map(model => (
                                    <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                         <Button type="button" variant="secondary" onClick={() => handleAddModelPermissions(availableModelsToAdd[0]?.id)} disabled={availableModelsToAdd.length === 0}><PlusCircle className="mr-2 h-4 w-4"/> Add</Button>
                    </div>
                )}
                 {availableModelsToAdd.length === 0 && configuredModelIds.size > 0 && (
                     <p className="text-sm text-center text-muted-foreground pt-4 border-t">All models have been configured.</p>
                )}
              </CardContent>
            </Card>

            {/* Global & System Permissions Section */}
            <div>
              <FormLabel>Global & System Permissions</FormLabel>
              <FormDescription>Assign system-wide permissions that are not tied to a specific model.</FormDescription>
              <FormField control={form.control} name="permissionIds" render={() => (
                  <FormItem className="mt-2 rounded-md border p-4">
                    <Accordion type="multiple" className="w-full" defaultValue={globalPermissionCategories}>
                      {globalPermissionCategories.map((category) => (
                        <AccordionItem value={category} key={category}>
                          <AccordionTrigger className="text-base">{category}</AccordionTrigger>
                          <AccordionContent className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                            {allPermissions[category].map((permission) => (
                              <FormField key={permission.id} control={form.control} name="permissionIds" render={({ field }) => (
                                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                    <FormControl>
                                      <Checkbox
                                        disabled={isSystemRole}
                                        checked={field.value?.includes(permission.id)}
                                        onCheckedChange={(checked) => {
                                          return checked
                                            ? field.onChange([...(field.value || []), permission.id])
                                            : field.onChange((field.value || []).filter((value) => value !== permission.id));
                                        }}
                                      />
                                    </FormControl>
                                    <FormLabel className="font-normal">{permission.name}</FormLabel>
                                  </FormItem>
                                )}
                              />
                            ))}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </ScrollArea>
        <div className="flex justify-end space-x-2 pt-4 border-t flex-shrink-0">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>Cancel</Button>
          <Button type="submit" disabled={isLoading || form.formState.isSubmitting} className="bg-primary hover:bg-primary/90">
            {isLoading || form.formState.isSubmitting ? 'Saving...' : (isEditing ? 'Update Role' : 'Create Role')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
