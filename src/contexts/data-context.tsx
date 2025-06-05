
'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { Model, DataObject, Property, ModelGroup, WorkflowWithDetails, ValidationRuleset } from '@/lib/types';

const HIGHLIGHT_DURATION_MS = 3000;

export interface DataContextType { // Exported for use in withAuth if needed
  models: Model[];
  objects: Record<string, DataObject[]>;
  modelGroups: ModelGroup[];
  workflows: WorkflowWithDetails[];
  validationRulesets: ValidationRuleset[];
  lastChangedInfo: { modelId: string, objectId: string, changeType: 'added' | 'updated' } | null;

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

  addWorkflow: (workflowData: Omit<WorkflowWithDetails, 'id' | 'initialStateId' | 'states'> & { states: Array<Omit<WorkflowWithDetails['states'][0], 'id' | 'workflowId' | 'successorStateIds'> & {successorStateNames?: string[]}> }) => Promise<WorkflowWithDetails>;
  updateWorkflow: (workflowId: string, workflowData: Omit<WorkflowWithDetails, 'id' | 'initialStateId' | 'states'> & { states: Array<Omit<WorkflowWithDetails['states'][0], 'id' | 'workflowId' | 'successorStateIds'> & {id?:string, successorStateNames?: string[]}> }) => Promise<WorkflowWithDetails | undefined>;
  deleteWorkflow: (workflowId: string) => Promise<void>;
  getWorkflowById: (workflowId: string) => WorkflowWithDetails | undefined;

  addValidationRuleset: (rulesetData: Omit<ValidationRuleset, 'id'>) => Promise<ValidationRuleset>;
  updateValidationRuleset: (rulesetId: string, updates: Partial<Omit<ValidationRuleset, 'id'>>) => Promise<ValidationRuleset | undefined>;
  deleteValidationRuleset: (rulesetId: string) => Promise<void>;
  getValidationRulesetById: (rulesetId: string) => ValidationRuleset | undefined;

  isReady: boolean;
  isBackgroundFetching: boolean;
  fetchData: (triggeredBy?: string) => Promise<void>;
  formatApiError: (response: Response, defaultMessage: string) => Promise<string>;
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
      validationRulesetId: p.validationRulesetId ?? null,
      min: p.min ?? null,
      max: p.max ?? null,
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
      errorMessage = String(errorData.error);
      if (errorData.details) {
        errorMessage += ` (Details: ${ (typeof errorData.details === 'string') ? errorData.details : JSON.stringify(errorData.details) })`;
      }
       if (errorData.field && typeof errorData.field === 'string') {
         errorMessage += ` (Field: ${errorData.field})`;
      }
    } else {
      errorMessage = `${defaultMessage}. Status: ${status} - ${statusText || 'Server returned a JSON response without a specific error field.'}`;
    }
  } catch (e) { 
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
  const [validationRulesets, setValidationRulesets] = useState<ValidationRuleset[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isBackgroundFetching, setIsBackgroundFetching] = useState(false);
  const [lastChangedInfo, setLastChangedInfo] = useState<{ modelId: string, objectId: string, changeType: 'added' | 'updated' } | null>(null);

  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingDataRef = useRef(false);
  const initialLoadCompletedRef = useRef(false);


  const fetchWorkflowsInternal = useCallback(async (): Promise<WorkflowWithDetails[] | null> => {
    try {
      const response = await fetch('/api/codex-structure/workflows');
      if (!response.ok) {
        const errorMessage = await formatApiError(response, 'Failed to fetch workflows');
        throw new Error(errorMessage);
      }
      const workflowsDataFromApi: WorkflowWithDetails[] = await response.json();
      return workflowsDataFromApi.map(wf => ({
        ...wf,
        states: wf.states.map(s => {
          const successorStateIds = (s as any).successorStateIdsStr ? (s as any).successorStateIdsStr.split(',').filter(Boolean) : s.successorStateIds || [];
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { successorStateIdsStr, ...restOfState } = s as any;
          return {...restOfState, isInitial: !!s.isInitial, successorStateIds };
        })
      })).sort((a, b) => a.name.localeCompare(b.name));
    } catch (error: any) {
      console.error("[DataContext] Failed to load workflows from API:", error.message, error);
      return null;
    }
  }, []);

  const fetchValidationRulesetsInternal = useCallback(async (): Promise<ValidationRuleset[] | null> => {
    try {
      const response = await fetch('/api/codex-structure/validation-rulesets');
      if (!response.ok) {
        const errorMessage = await formatApiError(response, 'Failed to fetch validation rulesets');
        throw new Error(errorMessage);
      }
      const rulesetsDataFromApi: ValidationRuleset[] = await response.json();
      return rulesetsDataFromApi.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error: any) {
      console.error("[DataContext] Failed to load validation rulesets from API:", error.message, error);
      return null;
    }
  }, []);

  const fetchData = useCallback(async (triggeredBy?: string) => {
    if (isFetchingDataRef.current) {
      console.warn(`[DataContext] Fetch already in progress. New trigger: ${triggeredBy}. Skipping.`);
      return;
    }
    console.log(`[DataContext] Starting fetchData. Trigger: ${triggeredBy || 'Unknown'}`);
    isFetchingDataRef.current = true;

    if (initialLoadCompletedRef.current) {
      setIsBackgroundFetching(true);
    } else {
      setIsReady(false);
    }

    try {
      const groupsResponse = await fetch('/api/codex-structure/model-groups');
      if (!groupsResponse.ok) throw new Error(await formatApiError(groupsResponse, 'Failed to fetch model groups'));
      const groupsDataFromApi: ModelGroup[] = await groupsResponse.json();
      
      setModelGroups(prevGroups => {
        const newGroupsSorted = [...groupsDataFromApi].sort((a, b) => a.name.localeCompare(b.name));
        const prevGroupsSorted = [...prevGroups].sort((a, b) => a.name.localeCompare(b.name));
        return JSON.stringify(newGroupsSorted) !== JSON.stringify(prevGroupsSorted) ? newGroupsSorted : prevGroups;
      });

      const modelsResponse = await fetch('/api/codex-structure/models');
      if (!modelsResponse.ok) throw new Error(await formatApiError(modelsResponse, 'Failed to fetch models'));
      const modelsDataFromApi: Model[] = await modelsResponse.json();
      
      setModels(prevModels => {
        const newModelsMapped = modelsDataFromApi.map(mapDbModelToClientModel);
        const newModelsSorted = [...newModelsMapped].sort((a,b) => a.id.localeCompare(b.id));
        const prevModelsSorted = [...prevModels].sort((a,b) => a.id.localeCompare(b.id));
        return JSON.stringify(newModelsSorted) !== JSON.stringify(prevModelsSorted) ? newModelsMapped : prevModels;
      });

      const allObjectsResponse = await fetch('/api/codex-structure/objects/all');
      if (!allObjectsResponse.ok) throw new Error(await formatApiError(allObjectsResponse, 'Failed to fetch all objects'));
      const newAllObjectsData: Record<string, DataObject[]> = await allObjectsResponse.json();
      
      setObjects(prevAllObjects => {
        let hasChanged = false;
        const nextAllObjectsState: Record<string, DataObject[]> = {};
        const allModelIds = new Set([...Object.keys(prevAllObjects), ...Object.keys(newAllObjectsData)]);

        allModelIds.forEach(modelId => {
          const newObjectsForModel = newAllObjectsData[modelId] || [];
          const currentObjectsForModel = prevAllObjects[modelId] || [];
          const newObjectsJson = JSON.stringify([...newObjectsForModel].sort((a, b) => a.id.localeCompare(b.id)));
          const currentObjectsJson = JSON.stringify([...currentObjectsForModel].sort((a, b) => a.id.localeCompare(b.id)));

          if (newObjectsJson !== currentObjectsJson) {
            nextAllObjectsState[modelId] = newObjectsForModel;
            hasChanged = true;
          } else if (prevAllObjects[modelId]) {
            nextAllObjectsState[modelId] = prevAllObjects[modelId]; // Keep old reference
          } else if (newObjectsForModel.length > 0) { // Case where prev was empty, new has items
            nextAllObjectsState[modelId] = newObjectsForModel;
            hasChanged = true;
          }
        });
        if (!hasChanged && Object.keys(prevAllObjects).length === Object.keys(nextAllObjectsState).length) {
          return prevAllObjects;
        }
        return nextAllObjectsState;
      });

      const newWorkflowsData = await fetchWorkflowsInternal();
      if (newWorkflowsData) {
        setWorkflows(prevWorkflows => {
          const newSortedJson = JSON.stringify([...newWorkflowsData].sort((a, b) => a.id.localeCompare(b.id)));
          const prevSortedJson = JSON.stringify([...prevWorkflows].sort((a, b) => a.id.localeCompare(b.id)));
          return newSortedJson !== prevSortedJson ? newWorkflowsData : prevWorkflows;
        });
      }

      const newRulesetsData = await fetchValidationRulesetsInternal();
      if (newRulesetsData) {
        setValidationRulesets(prevRulesets => {
          const newSortedJson = JSON.stringify([...newRulesetsData].sort((a,b) => a.id.localeCompare(b.id)));
          const prevSortedJson = JSON.stringify([...prevRulesets].sort((a,b) => a.id.localeCompare(b.id)));
          return newSortedJson !== prevSortedJson ? newRulesetsData : prevRulesets;
        });
      }

    } catch (error: any) {
      console.error(`[DataContext] Error during fetchData (Trigger: ${triggeredBy}):`, error.message, error);
    } finally {
      if (!initialLoadCompletedRef.current) {
        setIsReady(true);
        initialLoadCompletedRef.current = true;
      }
      setIsBackgroundFetching(false);
      isFetchingDataRef.current = false;
      console.log(`[DataContext] Finished fetchData. Trigger: ${triggeredBy || 'Unknown'}`);
    }
  }, [fetchWorkflowsInternal, fetchValidationRulesetsInternal]);


  useEffect(() => {
    fetchData('Initial Load');
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, [fetchData]);


  const addModel = useCallback(async (modelData: Omit<Model, 'id' | 'namespace' | 'workflowId'> & { namespace?: string, workflowId?: string | null }): Promise<Model> => {
    const modelId = crypto.randomUUID();
    const propertiesForApi = (modelData.properties || []).map((p, index) => ({
      ...p,
      id: p.id || crypto.randomUUID(),
      orderIndex: index,
      required: !!p.required,
      autoSetOnCreate: !!p.autoSetOnCreate,
      autoSetOnUpdate: !!p.autoSetOnUpdate,
      isUnique: !!p.isUnique,
      defaultValue: p.defaultValue ?? null,
      relatedModelId: p.type === 'relationship' ? p.relatedModelId : undefined,
      relationshipType: p.type === 'relationship' ? (p.relationshipType || 'one') : undefined,
      unit: p.type === 'number' ? p.unit : undefined,
      precision: p.type === 'number' ? (p.precision === undefined || p.precision === null || isNaN(Number(p.precision)) ? 2 : Number(p.precision)) : undefined,
      validationRulesetId: p.type === 'string' ? (p.validationRulesetId || null) : null,
      min: p.type === 'number' ? (p.min === undefined || p.min === null || isNaN(Number(p.min)) ? null : Number(p.min)) : null,
      max: p.type === 'number' ? (p.max === undefined || p.max === null || isNaN(Number(p.max)) ? null : Number(p.max)) : null,
    }));

    const finalNamespace = (modelData.namespace && modelData.namespace.trim() !== '') ? modelData.namespace.trim() : 'Default';
    
    const payload = { 
        ...modelData, 
        id: modelId, 
        namespace: finalNamespace, 
        workflowId: modelData.workflowId,
        properties: propertiesForApi 
    };

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
    await fetchData('After Add Model');
    return mapDbModelToClientModel(newModel);
  }, [fetchData]);

  const updateModel = useCallback(async (modelId: string, updates: Partial<Omit<Model, 'id' | 'properties' | 'displayPropertyNames' | 'namespace' | 'workflowId'>> & { properties?: Property[], displayPropertyNames?: string[], namespace?: string, workflowId?: string | null }): Promise<Model | undefined> => {
    const propertiesForApi = (updates.properties || []).map((p, index) => ({
      ...p,
      id: p.id || crypto.randomUUID(),
      orderIndex: index,
      required: !!p.required,
      autoSetOnCreate: !!p.autoSetOnCreate,
      autoSetOnUpdate: !!p.autoSetOnUpdate,
      isUnique: !!p.isUnique,
      defaultValue: p.defaultValue ?? null,
      relatedModelId: p.type === 'relationship' ? p.relatedModelId : undefined,
      relationshipType: p.type === 'relationship' ? (p.relationshipType || 'one') : undefined,
      unit: p.type === 'number' ? p.unit : undefined,
      precision: p.type === 'number' ? (p.precision === undefined || p.precision === null || isNaN(Number(p.precision)) ? 2 : Number(p.precision)) : undefined,
      validationRulesetId: p.type === 'string' ? (p.validationRulesetId || null) : null,
      min: p.type === 'number' ? (p.min === undefined || p.min === null || isNaN(Number(p.min)) ? null : Number(p.min)) : null,
      max: p.type === 'number' ? (p.max === undefined || p.max === null || isNaN(Number(p.max)) ? null : Number(p.max)) : null,
    }));

    const finalNamespace = (updates.namespace && updates.namespace.trim() !== '') ? updates.namespace.trim() : 'Default';

    const payload = {
      ...updates,
      namespace: finalNamespace, 
      workflowId: updates.workflowId,
      properties: propertiesForApi,
    };

    const response = await fetch(`/api/codex-structure/models/${modelId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
     if (!response.ok) {
      const errorMessage = await formatApiError(response, 'Failed to update model');
      throw new Error(errorMessage);
    }
    const updatedModelFromApi: Model = await response.json();
    await fetchData('After Update Model'); 
    return mapDbModelToClientModel(updatedModelFromApi);
  }, [fetchData]);

  const deleteModel = useCallback(async (modelId: string) => {
    const response = await fetch(`/api/codex-structure/models/${modelId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(await formatApiError(response, 'Failed to delete model'));
    await fetchData('After Delete Model');
  }, [fetchData]);

  const getModelById = useCallback((modelId: string) => models.find((model) => model.id === modelId), [models]);
  const getModelByName = useCallback((name: string) => models.find((model) => model.name.toLowerCase() === name.toLowerCase()), [models]);

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
      if (errorData.field) throw { message: errorMessage, field: errorData.field }; 
      throw new Error(errorMessage);
    }
    const newObject: DataObject = await response.json();
    setObjects((prev) => ({ ...prev, [modelId]: [...(prev[modelId] || []), newObject] }));
    setLastChangedInfo({ modelId, objectId: newObject.id, changeType: 'added' });
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => setLastChangedInfo(null), HIGHLIGHT_DURATION_MS);
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
       if (errorData.field) throw { message: errorMessage, field: errorData.field };
      throw new Error(errorMessage);
    }
    const updatedObjectFromApi: DataObject = await response.json();
    setObjects((prev) => ({
      ...prev,
      [modelId]: (prev[modelId] || []).map((obj) => obj.id === objectId ? { ...obj, ...updatedObjectFromApi } : obj),
    }));
    setLastChangedInfo({ modelId, objectId, changeType: 'updated' });
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => setLastChangedInfo(null), HIGHLIGHT_DURATION_MS);
    return updatedObjectFromApi;
  }, []);

  const deleteObject = useCallback(async (modelId: string, objectId: string) => {
    const response = await fetch(`/api/codex-structure/models/${modelId}/objects/${objectId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(await formatApiError(response, `Failed to delete object ${objectId} from model ${modelId}`));
    setObjects((prev) => ({ ...prev, [modelId]: (prev[modelId] || []).filter((obj) => obj.id !== objectId) }));
  }, []);

  const getObjectsByModelId = useCallback((modelId: string) => objects[modelId] || [], [objects]);
  const getAllObjects = useCallback(() => objects, [objects]);

  const addModelGroup = useCallback(async (groupData: Omit<ModelGroup, 'id'>): Promise<ModelGroup> => {
    const response = await fetch('/api/codex-structure/model-groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(groupData),
    });
    if (!response.ok) throw new Error(await formatApiError(response, 'Failed to add model group'));
    const newGroup: ModelGroup = await response.json();
    await fetchData('After Add Model Group');
    return newGroup;
  }, [fetchData]);

  const updateModelGroup = useCallback(async (groupId: string, updates: Partial<Omit<ModelGroup, 'id'>>): Promise<ModelGroup | undefined> => {
    const response = await fetch(`/api/codex-structure/model-groups/${groupId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
    });
    if (!response.ok) throw new Error(await formatApiError(response, 'Failed to update model group'));
    const updatedGroup: ModelGroup = await response.json();
    await fetchData('After Update Model Group');
    return updatedGroup;
  }, [fetchData]);

  const deleteModelGroup = useCallback(async (groupId: string) => {
    const response = await fetch(`/api/codex-structure/model-groups/${groupId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(await formatApiError(response, 'Failed to delete model group'));
    await fetchData('After Delete Model Group');
  }, [fetchData]);

  const getModelGroupById = useCallback((groupId: string) => modelGroups.find((g) => g.id === groupId), [modelGroups]);
  const getModelGroupByName = useCallback((name: string) => modelGroups.find((g) => g.name.toLowerCase() === name.toLowerCase()), [modelGroups]);
  const getAllModelGroups = useCallback(() => modelGroups, [modelGroups]);

  const addWorkflow = useCallback(async (workflowData: Omit<WorkflowWithDetails, 'id' | 'initialStateId' | 'states'> & { states: Array<Omit<WorkflowWithDetails['states'][0], 'id' | 'workflowId' | 'successorStateIds'> & {successorStateNames?: string[]}> }): Promise<WorkflowWithDetails> => {
    const response = await fetch('/api/codex-structure/workflows', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(workflowData),
    });
    if (!response.ok) throw new Error(await formatApiError(response, 'Failed to add workflow'));
    const newWorkflow: WorkflowWithDetails = await response.json();
    await fetchData('After Add Workflow');
    return {...newWorkflow, states: newWorkflow.states.map(s => ({...s, isInitial: !!s.isInitial}))};
  }, [fetchData]);

  const updateWorkflow = useCallback(async (workflowId: string, workflowData: Omit<WorkflowWithDetails, 'id' | 'initialStateId' | 'states'> & { states: Array<Omit<WorkflowWithDetails['states'][0], 'id' | 'workflowId' | 'successorStateIds'> & {id?:string, successorStateNames?: string[]}> }): Promise<WorkflowWithDetails | undefined> => {
    const response = await fetch(`/api/codex-structure/workflows/${workflowId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(workflowData),
    });
    if (!response.ok) throw new Error(await formatApiError(response, 'Failed to update workflow'));
    const updatedWorkflow: WorkflowWithDetails = await response.json();
    await fetchData('After Update Workflow');
    return {...updatedWorkflow, states: updatedWorkflow.states.map(s => ({...s, isInitial: !!s.isInitial}))};
  }, [fetchData]);

  const deleteWorkflow = useCallback(async (workflowId: string) => {
    const response = await fetch(`/api/codex-structure/workflows/${workflowId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(await formatApiError(response, 'Failed to delete workflow'));
    await fetchData('After Delete Workflow');
  }, [fetchData]);

  const getWorkflowById = useCallback((workflowId: string) => workflows.find((wf) => wf.id === workflowId), [workflows]);

  // Validation Ruleset CRUD
  const addValidationRuleset = useCallback(async (rulesetData: Omit<ValidationRuleset, 'id'>): Promise<ValidationRuleset> => {
    const response = await fetch('/api/codex-structure/validation-rulesets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rulesetData),
    });
    if (!response.ok) throw new Error(await formatApiError(response, 'Failed to add validation ruleset'));
    const newRuleset: ValidationRuleset = await response.json();
    await fetchData('After Add ValidationRuleset');
    return newRuleset;
  }, [fetchData]);

  const updateValidationRuleset = useCallback(async (rulesetId: string, updates: Partial<Omit<ValidationRuleset, 'id'>>): Promise<ValidationRuleset | undefined> => {
    const response = await fetch(`/api/codex-structure/validation-rulesets/${rulesetId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
    });
    if (!response.ok) throw new Error(await formatApiError(response, 'Failed to update validation ruleset'));
    const updatedRuleset: ValidationRuleset = await response.json();
    await fetchData('After Update ValidationRuleset');
    return updatedRuleset;
  }, [fetchData]);

  const deleteValidationRuleset = useCallback(async (rulesetId: string) => {
    const response = await fetch(`/api/codex-structure/validation-rulesets/${rulesetId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(await formatApiError(response, 'Failed to delete validation ruleset'));
    await fetchData('After Delete ValidationRuleset');
  }, [fetchData]);

  const getValidationRulesetById = useCallback((rulesetId: string) => validationRulesets.find(rs => rs.id === rulesetId), [validationRulesets]);

  const contextValue: DataContextType = {
    models, objects, modelGroups, workflows, validationRulesets, lastChangedInfo,
    addModel, updateModel, deleteModel, getModelById, getModelByName,
    addObject, updateObject, deleteObject, getObjectsByModelId, getAllObjects,
    addModelGroup, updateModelGroup, deleteModelGroup, getModelGroupById, getModelGroupByName, getAllModelGroups,
    addWorkflow, updateWorkflow, deleteWorkflow, getWorkflowById, 
    addValidationRuleset, updateValidationRuleset, deleteValidationRuleset, getValidationRulesetById,
    isReady, isBackgroundFetching, fetchData, formatApiError,
  };

  return <DataContext.Provider value={contextValue}>{children}</DataContext.Provider>;
}

export function useData(): DataContextType {
  const context = useContext(DataContext);
  if (context === undefined) throw new Error('useData must be used within a DataProvider');
  return context;
}

    