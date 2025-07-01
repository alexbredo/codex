
'use client';

import type { UseFormReturn, ControllerRenderProps, FieldValues, FieldPath } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form';
import type { Model, DataObject, WorkflowWithDetails, Property, WorkflowStateWithSuccessors } from '@/lib/types';
import AdaptiveFormField from './adaptive-form-field';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/auth-context';
import { useState } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from 'lucide-react';

interface User {
  id: string;
  username: string;
  roles: { id: string; name: string; }[];
}
interface ObjectFormProps {
  form: UseFormReturn<Record<string, any>>;
  model: Model;
  onSubmit: (values: Record<string, any>) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  existingObject?: DataObject;
  formObjectId?: string | null; 
  currentWorkflow?: WorkflowWithDetails | null;
  allUsers?: User[];
  currentUser?: User | null;
  propertyIdsToShow?: string[]; // New optional prop
}

const INTERNAL_NO_STATE_CHANGE = "__NO_STATE_CHANGE__";
const INTERNAL_NO_OWNER_SELECTED = "__NO_OWNER_SELECTED__";


export default function ObjectForm({
  form,
  model,
  onSubmit,
  onCancel,
  isLoading,
  existingObject,
  formObjectId,
  currentWorkflow,
  allUsers = [],
  currentUser,
  propertyIdsToShow, // Destructure new prop
}: ObjectFormProps) {
  const formContext = existingObject ? 'edit' : 'create';
  const { toast } = useToast();

  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);

  // Filter properties based on propertyIdsToShow if it's provided
  const propertiesToRender = propertyIdsToShow
    ? model.properties.filter(p => propertyIdsToShow.includes(p.id)).sort((a, b) => a.orderIndex - b.orderIndex)
    : model.properties.sort((a, b) => a.orderIndex - b.orderIndex);


  let availableStatesForSelect: Array<{ value: string; label: string; isCurrent: boolean }> = [];
  let currentStateName: string | undefined;

  if (formContext === 'edit' && currentWorkflow && existingObject) {
    const objCurrentStateId = existingObject.currentStateId;
    const objCurrentState = currentWorkflow.states.find(s => s.id === objCurrentStateId);
    
    if (objCurrentState) {
      currentStateName = objCurrentState.name;
      availableStatesForSelect.push({ value: objCurrentState.id, label: `${objCurrentState.name} (Current)`, isCurrent: true });
      objCurrentState.successorStateIds.forEach(successorId => {
        const successorState = currentWorkflow.states.find(s => s.id === successorId);
        if (successorState) {
          availableStatesForSelect.push({ value: successorState.id, label: successorState.name, isCurrent: false });
        }
      });
    } else if (objCurrentStateId === null || objCurrentStateId === undefined) {
      currentStateName = "None (No Current State)";
      availableStatesForSelect.push({ value: INTERNAL_NO_STATE_CHANGE, label: "(No Current State)", isCurrent: true });
      const initialWfState = currentWorkflow.states.find(s => s.isInitial);
      if(initialWfState) {
        availableStatesForSelect.push({ value: initialWfState.id, label: `${initialWfState.name} (Set Initial)`, isCurrent: false });
      }
    } else {
        currentStateName = `Unknown State (ID: ${objCurrentStateId.substring(0,8)}...)`;
        availableStatesForSelect.push({ value: objCurrentStateId, label: `${currentStateName} (Current)`, isCurrent: true });
    }
  }

  const isAdmin = currentUser?.roles.some(r => r.name.toLowerCase() === 'administrator');

  const handleFormSubmit = async (values: Record<string, any>) => {
    setIsUploadingFiles(true);
    setUploadProgress({});
    const updatedValues = { ...values };
    const fileUploadPromises: Promise<void>[] = [];

    const uploadFileWithProgress = (file: File, property: Property) => {
      return new Promise<void>((resolve, reject) => {
        const endpoint = property.type === 'image' ? '/api/codex-structure/upload-image' : '/api/codex-structure/upload-file';
        const formData = new FormData();
        formData.append('file', file);
        formData.append('modelId', model.id);
        const idForUpload = formObjectId || existingObject?.id;
        if (idForUpload) {
          formData.append('objectId', idForUpload);
        } else {
          toast({ title: "Error", description: "Cannot upload file without a unique object identifier.", variant: "destructive" });
          reject(new Error("Cannot upload file without an object identifier."));
          return;
        }
        formData.append('propertyName', property.name);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', endpoint, true);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = (event.loaded / event.total) * 100;
            setUploadProgress(prev => ({ ...prev, [property.name]: percentComplete }));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploadProgress(prev => ({ ...prev, [property.name]: 100 }));
            const result = JSON.parse(xhr.responseText);
            if (property.type === 'image') {
              updatedValues[property.name] = result.url;
            } else if (property.type === 'fileAttachment') {
              updatedValues[property.name] = { url: result.url, name: result.name };
            }
            resolve();
          } else {
            setUploadProgress(prev => ({ ...prev, [property.name]: -1 }));
            try {
              const errorResponse = JSON.parse(xhr.responseText);
              reject(new Error(errorResponse.error || `Upload for ${property.name} failed: ${xhr.statusText}`));
            } catch {
              reject(new Error(`Upload for ${property.name} failed with status: ${xhr.status}`));
            }
          }
        };

        xhr.onerror = () => {
          setUploadProgress(prev => ({ ...prev, [property.name]: -1 }));
          reject(new Error(`Upload for ${property.name} failed due to a network error.`));
        };

        xhr.send(formData);
      });
    };

    for (const property of model.properties) {
      const fieldValue = values[property.name];
      if ((property.type === 'image' || property.type === 'fileAttachment') && fieldValue instanceof File) {
        fileUploadPromises.push(uploadFileWithProgress(fieldValue, property));
      }
    }

    try {
      if (fileUploadPromises.length > 0) {
        await Promise.all(fileUploadPromises);
      }
      await onSubmit(updatedValues);
    } catch (error: any) {
      console.error("Error during file upload or form submission:", error);
      toast({
        title: "Submission Failed",
        description: error.message || "An unexpected error occurred during file processing.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingFiles(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
        <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-4 ">
                {formContext === 'edit' && currentWorkflow && existingObject && (
                  <FormField
                    control={form.control}
                    name="currentStateId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State</FormLabel>
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value === INTERNAL_NO_STATE_CHANGE ? (existingObject?.currentStateId || null) : value)
                          }}
                          value={field.value ? String(field.value) : (existingObject?.currentStateId ? String(existingObject.currentStateId) : INTERNAL_NO_STATE_CHANGE) }
                          disabled={isUploadingFiles}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select state" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {availableStatesForSelect.map(stateOption => (
                              <SelectItem key={stateOption.value} value={stateOption.value}>
                                {stateOption.label}
                              </SelectItem>
                            ))}
                             {availableStatesForSelect.length === 0 && existingObject?.currentStateId && (
                                 <SelectItem value={existingObject.currentStateId} disabled>
                                    {currentStateName || `Current State (ID: ${existingObject.currentStateId.substring(0,8)}...)`}
                                </SelectItem>
                            )}
                            {availableStatesForSelect.length === 0 && !existingObject?.currentStateId && (
                                 <SelectItem value={INTERNAL_NO_STATE_CHANGE} disabled>
                                    (No Current State)
                                </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Current state: {currentStateName || "Not set"}. Change to a valid next state.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {formContext === 'edit' && isAdmin && (
                  <FormField
                    control={form.control}
                    name="ownerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Owner</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(value === INTERNAL_NO_OWNER_SELECTED ? null : value)}
                          value={field.value || INTERNAL_NO_OWNER_SELECTED}
                          disabled={isUploadingFiles}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select an owner" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={INTERNAL_NO_OWNER_SELECTED}>-- No Owner / Unassigned --</SelectItem>
                            {allUsers.map(user => (
                              <SelectItem key={user.id} value={user.id}>
                                {user.username} ({user.roles.map(r => r.name).join(', ')})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Assign or change the owner of this record. (Admin only)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}


                {propertiesToRender.map((property) => (
                <AdaptiveFormField
                    key={property.id}
                    form={form} 
                    property={property}
                    formContext={formContext}
                    modelId={model.id}
                    objectId={formObjectId || existingObject?.id}
                    isUploading={isUploadingFiles}
                    uploadProgress={uploadProgress[property.name]}
                />
                ))}
            </div>
        </ScrollArea>
        <div className="flex justify-end space-x-2 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading || isUploadingFiles}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading || form.formState.isSubmitting || isUploadingFiles} className="bg-primary hover:bg-primary/90">
            {isUploadingFiles ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</>
              : (isLoading || form.formState.isSubmitting) ? 'Saving...' 
              : (existingObject ? `Update ${model.name}` : `Create ${model.name}`)}
          </Button>
        </div>
      </form>
    </Form>
  );
}
