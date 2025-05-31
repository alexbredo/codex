
'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Model, DataObject, Property, ModelGroup, WorkflowWithDetails } from '@/lib/types';

interface DataContextType {
  models: Model[];
  objects: Record<string, DataObject[]>;
  modelGroups: ModelGroup[];
  workflows: WorkflowWithDetails[];

  addModel: (modelData: Omit<Model, 'id' | 'namespace' | 'workflowId'> & { namespace?: string, workflowId?: string | null }) => Promise<Model>;
  updateModel: (modelId: string, updates: Partial<Omit<Model, 'id' | 'properties' | 'displayPropertyNames' | 'namespace' | 'workflowId'>> & { properties?: Property[], displayPropertyNames?: string[], namespace?: string, workflowId?: string | null }) => Promise<Model | undefined>;
  deleteModel: (modelId: string) => Promise<void>;
  getModelById: (modelId: string) => Model | undefined;
  getModelByName: (name: string) => Model | undefined;

  addObject: (modelId: string, objectData: Omit<DataObject, 'id' | 'currentStateId'> & {currentStateId?: string | null}, objectId?: string) => Promise<DataObject>;
  updateObject: (modelId: string, objectId: string, updates: Partial<Omit<DataObject, 'id'>>) => Promise<DataObject | undefined>;
  deleteObject: (modelId: string, objectId: string) => Promise<void>;
  getObjectsByModelId: (modelId: string) => DataObject[];
  getAllObjects: () => Record<string, DataObject[]>;
  
  addModelGroup: (groupData: Omit<ModelGroup, 'id'>) => Promise<ModelGroup>;
  updateModelGroup: (groupId: string, updates: Partial<Omit<ModelGroup, 'id'>>) => Promise<ModelGroup | undefined>;
  deleteModelGroup: (groupId: string) => Promise<void>;
  getModelGroupById: (groupId: string) => ModelGroup | undefined;
  getModelGroupByName: (name: string) => ModelGroup | undefined;
  getAllModelGroups: () => ModelGroup[];

  fetchWorkflows: () => Promise<void>;
  addWorkflow: (workflowData: Omit<WorkflowWithDetails, 'id' | 'initialStateId' | 'states'> & { states: Array<Omit<WorkflowWithDetails['states'][0], 'id' | 'workflowId' | 'successorStateIds'> & {successorStateNames?: string[]}> }) => Promise<WorkflowWithDetails>;
  updateWorkflow: (workflowId: string, workflowData: Omit<WorkflowWithDetails, 'id' | 'initialStateId' | 'states'> & { states: Array<Omit<WorkflowWithDetails['states'][0], 'id' | 'workflowId' | 'successorStateIds'> & {id?:string, successorStateNames?: string[]}> }) => Promise<WorkflowWithDetails | undefined>;
  deleteWorkflow: (workflowId: string) => Promise<void>;
  getWorkflowById: (workflowId: string) => WorkflowWithDetails | undefined;


  isReady: boolean;
  fetchData: () => Promise<void>; 
}

const DataContext = createContext<DataContextType | undefined>(undefined);

const mapDbModelToClientModel = (dbModel: any): Model => {
  let parsedDisplayPropertyNames: string[] = [];
  if (Array.isArray(dbModel.displayPropertyNames)) {
    parsedDisplayPropertyNames = dbModel.displayPropertyNames;
  } else if (typeof dbModel.displayPropertyNames === 'string') {
    try {
      const temp = JSON.parse(dbModel.displayPropertyNames);
      if (Array.isArray(temp)) {
        parsedDisplayPropertyNames = temp.filter((name: any) => typeof name === 'string');
      }
    } catch (e) {
      // console.warn(`Context: Could not parse displayPropertyNames for model ${dbModel.id}: '${dbModel.displayPropertyNames}'`, e);
    }
  }

  return {
    id: dbModel.id,
    name: dbModel.name,
    description: dbModel.description,
    namespace: dbModel.namespace || 'Default',
    displayPropertyNames: parsedDisplayPropertyNames,
    workflowId: dbModel.workflowId === undefined ? null : dbModel.workflowId,
    properties: (dbModel.properties || []).map((p: any) => ({
      id: p.id || crypto.randomUUID(),
      name: p.name,
      type: p.type,
      relatedModelId: p.type === 'relationship' ? p.relatedModelId : undefined,
      required: p.required === 1 || p.required === true, 
      relationshipType: p.type === 'relationship' ? (p.relationshipType || 'one') : undefined,
      unit: p.type === 'number' ? p.unit : undefined,
      precision: p.type === 'number' ? (p.precision === undefined || p.precision === null || isNaN(Number(p.precision)) ? 2 : Number(p.precision)) : undefined,
      autoSetOnCreate: p.type === 'date' ? (p.autoSetOnCreate === 1 || p.autoSetOnCreate === true) : false,
      autoSetOnUpdate: p.type === 'date' ? (p.autoSetOnUpdate === 1 || p.autoSetOnUpdate === true) : false,
      isUnique: p.type === 'string' ? (p.isUnique === 1 || p.isUnique === true) : false,
      orderIndex: p.orderIndex ?? 0,
      defaultValue: p.defaultValue ?? null, 
    })).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
  };
};

const formatApiError = async (response: Response, defaultMessage: string): Promise<string> => {
  let errorMessage = defaultMessage;
  const status = response.status;
  const statusText = response.statusText;

  try {
    const errorData = await response.json();
    if (errorData && errorData.error) {
      errorMessage = String(errorData.error); // Ensure it's a string
      if (errorData.details) {
        errorMessage += ` (Details: ${ (typeof errorData.details === 'string') ? errorData.details : JSON.stringify(errorData.details) })`;
      }
    } else {
      // JSON was valid, but no 'error' field. Use statusText or a generic message.
      errorMessage = `${defaultMessage}. Status: ${status} - ${statusText || 'Server returned a JSON response without a specific error field.'}`;
    }
  } catch (e) { // response.json() failed - body is not valid JSON
    const responseText = await response.text().catch(() => 'Could not read response text.');
    errorMessage = `${defaultMessage}. Status: ${status} - ${statusText || 'Non-JSON response from server.'} Body: ${responseText.substring(0, 200)}...`;
  }
  return errorMessage;
};


export function DataProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState<Model[]>([]);
  const [objects, setObjects] = useState<Record<string, DataObject[]>>({});
  const [modelGroups, setModelGroups] = useState<ModelGroup[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowWithDetails[]>([]);
  const [isReady, setIsReady] = useState(false);

  const fetchWorkflows = useCallback(async () => {
    try {
      const response = await fetch('/api/codex-structure/workflows');
      if (!response.ok) {
        const errorMessage = await formatApiError(response, 'Failed to fetch workflows');
        throw new Error(errorMessage);
      }
      const workflowsData: WorkflowWithDetails[] = await response.json();
      const clientWorkflows = workflowsData.map(wf => ({
        ...wf,
        states: wf.states.map(s => {
          const successorStateIds = (s as any).successorStateIdsStr ? (s as any).successorStateIdsStr.split(',').filter(Boolean) : s.successorStateIds || [];
          const { successorStateIdsStr, ...restOfState } = s as any;
          return {...restOfState, isInitial: !!s.isInitial, successorStateIds };
        })
      }));
      setWorkflows(clientWorkflows.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error: any) {
      console.error("Failed to load workflows from API:", error.message, error);
      setWorkflows([]);
    }
  }, []);


  const fetchData = useCallback(async () => {
    setIsReady(false);
    try {
      const groupsResponse = await fetch('/api/codex-structure/model-groups');
      if (!groupsResponse.ok) {
        const errorMessage = await formatApiError(groupsResponse, 'Failed to fetch model groups');
        throw new Error(errorMessage);
      }
      const groupsData: ModelGroup[] = await groupsResponse.json();
      setModelGroups(groupsData.sort((a, b) => a.name.localeCompare(b.name)));

      const modelsResponse = await fetch('/api/codex-structure/models');
      if (!modelsResponse.ok) {
        const errorMessage = await formatApiError(modelsResponse, 'Failed to fetch models');
        console.error("Full error details from models fetch:", await modelsResponse.text().catch(()=>"Could not read response body"));
        throw new Error(errorMessage);
      }
      const modelsDataFromApi: Model[] = await modelsResponse.json();
      setModels(modelsDataFromApi.map(mapDbModelToClientModel));

      const allObjectsResponse = await fetch('/api/codex-structure/objects/all');
      if (!allObjectsResponse.ok) {
        const errorMessage = await formatApiError(allObjectsResponse, 'Failed to fetch all objects');
        throw new Error(errorMessage);
      }
      const allObjectsData: Record<string, DataObject[]> = await allObjectsResponse.json();
      setObjects(allObjectsData);

      await fetchWorkflows();

    } catch (error: any) {
      console.error("Failed to load data from API:", error.message, error);
      setModels([]);
      setObjects({});
      setModelGroups([]);
      setWorkflows([]);
    }
    setIsReady(true);
  }, [fetchWorkflows]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addModel = useCallback(async (modelData: Omit<Model, 'id' | 'namespace' | 'workflowId'> & { namespace?: string, workflowId?: string | null }): Promise<Model> => {
    const modelId = crypto.randomUUID();
    const propertiesWithIdsAndOrder = modelData.properties.map((p, index) => ({ 
      ...p, 
      id: p.id || crypto.randomUUID(),
      required: !!p.required,
      autoSetOnCreate: !!p.autoSetOnCreate,
      autoSetOnUpdate: !!p.autoSetOnUpdate,
      isUnique: !!p.isUnique,
      defaultValue: p.defaultValue ?? null,
      orderIndex: index 
    }));
    const finalNamespace = (modelData.namespace && modelData.namespace.trim() !== '') ? modelData.namespace.trim() : 'Default';
    
    const payload = { 
        ...modelData, 
        id: modelId, 
        namespace: finalNamespace, 
        workflowId: modelData.workflowId,
        properties: propertiesWithIdsAndOrder 
    };
    console.log("[DataContext DEBUG] addModel - payload to API:", JSON.stringify(payload, null, 2));

    const response = await fetch('/api/codex-structure/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
       const errorMessage = await formatApiError(response, 'Failed to add model');
       console.error("API Error in addModel:", errorMessage);
       throw new Error(errorMessage);
    }
    const newModel: Model = await response.json();
    const clientModel = mapDbModelToClientModel(newModel);
    setModels((prev) => [...prev, clientModel].sort((a, b) => {
      if (a.namespace.toLowerCase() < b.namespace.toLowerCase()) return -1;
      if (a.namespace.toLowerCase() > b.namespace.toLowerCase()) return 1;
      return a.name.localeCompare(b.name);
    }));
    setObjects((prev) => ({ ...prev, [clientModel.id]: [] }));
    return clientModel;
  }, []);

  const updateModel = useCallback(async (modelId: string, updates: Partial<Omit<Model, 'id' | 'properties' | 'displayPropertyNames' | 'namespace' | 'workflowId'>> & { properties?: Property[], displayPropertyNames?: string[], namespace?: string, workflowId?: string | null }): Promise<Model | undefined> => {
    const propertiesWithEnsuredIdsAndOrder = updates.properties?.map((p, index) => ({
      ...p,
      id: p.id || crypto.randomUUID(),
      required: !!p.required,
      autoSetOnCreate: !!p.autoSetOnCreate,
      autoSetOnUpdate: !!p.autoSetOnUpdate,
      isUnique: !!p.isUnique,
      defaultValue: p.defaultValue ?? null,
      orderIndex: index
    }));

    const finalNamespace = (updates.namespace && updates.namespace.trim() !== '') ? updates.namespace.trim() : 'Default';

    const payload = {
      ...updates,
      namespace: finalNamespace, 
      workflowId: updates.workflowId,
      properties: propertiesWithEnsuredIdsAndOrder,
    };
    console.log("[DataContext DEBUG] updateModel - payload to API:", JSON.stringify(payload, null, 2));

    const response = await fetch(`/api/codex-structure/models/${modelId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
     if (!response.ok) {
      const errorMessage = await formatApiError(response, 'Failed to update model');
      throw new Error(errorMessage);
    }
    await fetchData(); 
    const updatedModelFromApi: Model = await response.json();
    const clientModel = models.find(m => m.id === updatedModelFromApi.id) || mapDbModelToClientModel(updatedModelFromApi);
    return clientModel;
  }, [fetchData, models]);

  const deleteModel = useCallback(async (modelId: string) => {
    const response = await fetch(`/api/codex-structure/models/${modelId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const errorMessage = await formatApiError(response, 'Failed to delete model');
      throw new Error(errorMessage);
    }
    
    setModels((prev) => prev.filter((model) => model.id !== modelId));
    setObjects((prev) => {
      const newObjects = { ...prev };
      delete newObjects[modelId];
      return newObjects;
    });
  }, []);

  const getModelById = useCallback((modelId: string) => {
    return models.find((model) => model.id === modelId);
  }, [models]);
  
  const getModelByName = useCallback((name: string) => {
    return models.find((model) => model.name.toLowerCase() === name.toLowerCase());
  }, [models]);

  const addObject = useCallback(async (modelId: string, objectData: Omit<DataObject, 'id' | 'currentStateId'> & {currentStateId?: string | null}, objectId?: string): Promise<DataObject> => {
    const finalObjectId = objectId || crypto.randomUUID();
    const payload = { ...objectData, id: finalObjectId }; 
    const response = await fetch(`/api/codex-structure/models/${modelId}/objects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `Failed to add object to model ${modelId}. Status: ${response.status}` }));
      let errorMessage = errorData.error || `Failed to add object to model ${modelId}`;
      if (errorData.field) {
        throw { message: errorMessage, field: errorData.field }; 
      }
      throw new Error(errorMessage);
    }
    const newObject: DataObject = await response.json();
    
    setObjects((prev) => ({
      ...prev,
      [modelId]: [...(prev[modelId] || []), newObject],
    }));
    return newObject;
  }, []);

  const updateObject = useCallback(async (modelId: string, objectId: string, updates: Partial<Omit<DataObject, 'id'>>): Promise<DataObject | undefined> => {
    const response = await fetch(`/api/codex-structure/models/${modelId}/objects/${objectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `Failed to update object ${objectId}. Status: ${response.status}` }));
      let errorMessage = errorData.error || `Failed to update object ${objectId} in model ${modelId}`;
       if (errorData.field) {
        throw { message: errorMessage, field: errorData.field };
      }
      throw new Error(errorMessage);
    }
    const updatedObjectFromApi: DataObject = await response.json();
    
    let returnedObject: DataObject | undefined;
    setObjects((prevObjects) => {
      const modelObjects = prevObjects[modelId] || [];
      const newModelObjects = modelObjects.map((obj) => {
        if (obj.id === objectId) {
          returnedObject = { ...obj, ...updatedObjectFromApi }; 
          return returnedObject;
        }
        return obj;
      });
      return { ...prevObjects, [modelId]: newModelObjects };
    });
    return returnedObject;
  }, []);

  const deleteObject = useCallback(async (modelId: string, objectId: string) => {
    const response = await fetch(`/api/codex-structure/models/${modelId}/objects/${objectId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const errorMessage = await formatApiError(response, `Failed to delete object ${objectId} from model ${modelId}`);
      throw new Error(errorMessage);
    }
    
    setObjects((prev) => ({
      ...prev,
      [modelId]: (prev[modelId] || []).filter((obj) => obj.id !== objectId),
    }));
  }, []);

  const getObjectsByModelId = useCallback((modelId: string) => {
    return objects[modelId] || [];
  }, [objects]);

  const getAllObjects = useCallback(() => {
    return objects;
  }, [objects]);

  const addModelGroup = useCallback(async (groupData: Omit<ModelGroup, 'id'>): Promise<ModelGroup> => {
    const response = await fetch('/api/codex-structure/model-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(groupData),
    });
    if (!response.ok) {
      const errorMessage = await formatApiError(response, 'Failed to add model group');
      throw new Error(errorMessage);
    }
    const newGroup: ModelGroup = await response.json();
    setModelGroups((prev) => [...prev, newGroup].sort((a,b) => a.name.localeCompare(b.name)));
    return newGroup;
  }, []);

  const updateModelGroup = useCallback(async (groupId: string, updates: Partial<Omit<ModelGroup, 'id'>>): Promise<ModelGroup | undefined> => {
    const response = await fetch(`/api/codex-structure/model-groups/${groupId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      const errorMessage = await formatApiError(response, 'Failed to update model group');
      throw new Error(errorMessage);
    }
    const updatedGroup: ModelGroup = await response.json();
    setModelGroups((prev) =>
      prev.map((group) => (group.id === groupId ? updatedGroup : group)).sort((a,b) => a.name.localeCompare(b.name))
    );
    return updatedGroup;
  }, []);

  const deleteModelGroup = useCallback(async (groupId: string) => {
    const response = await fetch(`/api/codex-structure/model-groups/${groupId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
       const errorMessage = await formatApiError(response, 'Failed to delete model group');
      throw new Error(errorMessage);
    }
    setModelGroups((prev) => prev.filter((group) => group.id !== groupId));
  }, []);

  const getModelGroupById = useCallback((groupId: string) => {
    return modelGroups.find((group) => group.id === groupId);
  }, [modelGroups]);

  const getModelGroupByName = useCallback((name: string) => {
    return modelGroups.find((group) => group.name.toLowerCase() === name.toLowerCase());
  }, [modelGroups]);

  const getAllModelGroups = useCallback(() => {
    return modelGroups;
  }, [modelGroups]);

  const addWorkflow = useCallback(async (workflowData: Omit<WorkflowWithDetails, 'id' | 'initialStateId' | 'states'> & { states: Array<Omit<WorkflowWithDetails['states'][0], 'id' | 'workflowId' | 'successorStateIds'> & {successorStateNames?: string[]}> }): Promise<WorkflowWithDetails> => {
    const response = await fetch('/api/codex-structure/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflowData),
    });
    if (!response.ok) {
        const errorMessage = await formatApiError(response, 'Failed to add workflow');
        throw new Error(errorMessage);
    }
    const newWorkflow: WorkflowWithDetails = await response.json();
    const clientWorkflow = {...newWorkflow, states: newWorkflow.states.map(s => ({...s, isInitial: !!s.isInitial}))};
    setWorkflows((prev) => [...prev, clientWorkflow].sort((a, b) => a.name.localeCompare(b.name)));
    return clientWorkflow;
  }, []);

  const updateWorkflow = useCallback(async (workflowId: string, workflowData: Omit<WorkflowWithDetails, 'id' | 'initialStateId' | 'states'> & { states: Array<Omit<WorkflowWithDetails['states'][0], 'id' | 'workflowId' | 'successorStateIds'> & {id?:string, successorStateNames?: string[]}> }): Promise<WorkflowWithDetails | undefined> => {
    const response = await fetch(`/api/codex-structure/workflows/${workflowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflowData),
    });
    if (!response.ok) {
        const errorMessage = await formatApiError(response, 'Failed to update workflow');
        throw new Error(errorMessage);
    }
    const updatedWorkflow: WorkflowWithDetails = await response.json();
    const clientWorkflow = {...updatedWorkflow, states: updatedWorkflow.states.map(s => ({...s, isInitial: !!s.isInitial}))};
    setWorkflows((prev) =>
        prev.map((wf) => (wf.id === workflowId ? clientWorkflow : wf)).sort((a, b) => a.name.localeCompare(b.name))
    );
    return clientWorkflow;
  }, []);

  const deleteWorkflow = useCallback(async (workflowId: string) => {
    const response = await fetch(`/api/codex-structure/workflows/${workflowId}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        const errorMessage = await formatApiError(response, 'Failed to delete workflow');
        throw new Error(errorMessage);
    }
    setWorkflows((prev) => prev.filter((wf) => wf.id !== workflowId));
  }, []);

  const getWorkflowById = useCallback((workflowId: string) => {
    return workflows.find((wf) => wf.id === workflowId);
  }, [workflows]);


  const contextValue: DataContextType = {
    models, objects, modelGroups, workflows,
    addModel, updateModel, deleteModel, getModelById, getModelByName,
    addObject, updateObject, deleteObject, getObjectsByModelId, getAllObjects,
    addModelGroup, updateModelGroup, deleteModelGroup, getModelGroupById, getModelGroupByName, getAllModelGroups,
    fetchWorkflows, addWorkflow, updateWorkflow, deleteWorkflow, getWorkflowById,
    isReady, fetchData
  };

  return (
    <DataContext.Provider value={contextValue}>
      {children}
    </DataContext.Provider>
  );
}

export function useData(): DataContextType {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
