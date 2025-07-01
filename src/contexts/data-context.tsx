

'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { Model, DataObject, Property, ModelGroup, WorkflowWithDetails, ValidationRuleset, UserSession as User, SharedObjectLink, Wizard } from '@/lib/types';
import { useAuth } from './auth-context';
import { mapDbModelToClientModel, formatApiError } from '@/lib/utils'; // Import from utils

const HIGHLIGHT_DURATION_MS = 3000;

// This defines the shape of the data passed to updateModel, ensuring modelGroupId is allowed.
type ModelUpdatePayload = Partial<Omit<Model, 'id' | 'properties'>> & { properties?: Property[] };

export interface DataContextType {
  models: Model[];
  objects: Record<string, DataObject[]>; // Stores active objects
  deletedObjects: Record<string, DataObject[]>; // Stores soft-deleted objects
  modelGroups: ModelGroup[];
  workflows: WorkflowWithDetails[];
  wizards: Wizard[];
  validationRulesets: ValidationRuleset[];
  allUsers: User[];
  lastChangedInfo: { modelId: string, objectId: string, changeType: 'added' | 'updated' | 'restored' | 'deleted' } | null;

  addModel: (modelData: Omit<Model, 'id' | 'modelGroupId' | 'workflowId'> & { modelGroupId?: string | null, workflowId?: string | null }) => Promise<Model>;
  updateModel: (modelId: string, updates: ModelUpdatePayload) => Promise<Model | undefined>;
  deleteModel: (modelId: string) => Promise<void>;
  getModelById: (modelId: string) => Model | undefined;
  getModelByName: (name: string) => Model | undefined;

  addObject: (modelId: string, objectData: Omit<DataObject, 'id' | 'currentStateId' | 'ownerId'> & {currentStateId?: string | null, ownerId?: string | null}, objectId?: string) => Promise<DataObject>;
  updateObject: (modelId: string, objectId: string, updates: Partial<Omit<DataObject, 'id'>>) => Promise<DataObject | undefined>;
  deleteObject: (modelId: string, objectId: string) => Promise<void>; // This will now soft delete
  restoreObject: (modelId: string, objectId: string) => Promise<DataObject | undefined>; // New restore function
  getObjectsByModelId: (modelId: string, includeDeleted?: boolean) => DataObject[]; // Added includeDeleted flag
  getAllObjects: (includeDeleted?: boolean) => Record<string, DataObject[]>; // Added includeDeleted flag
  
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

  addWizard: (wizardData: Omit<Wizard, 'id' | 'steps'> & { steps: Array<Omit<Wizard['steps'][0], 'id' | 'wizardId'>> }) => Promise<Wizard>;
  updateWizard: (wizardId: string, wizardData: Omit<Wizard, 'id' | 'steps'> & { steps: Array<Omit<Wizard['steps'][0], 'id' | 'wizardId'> & {id?:string}> }) => Promise<Wizard | undefined>;
  deleteWizard: (wizardId: string) => Promise<void>;
  getWizardById: (wizardId: string) => Wizard | undefined;

  addValidationRuleset: (rulesetData: Omit<ValidationRuleset, 'id'>) => Promise<ValidationRuleset>;
  updateValidationRuleset: (rulesetId: string, updates: Partial<Omit<ValidationRuleset, 'id'>>) => Promise<ValidationRuleset | undefined>;
  deleteValidationRuleset: (rulesetId: string) => Promise<void>;
  getValidationRulesetById: (rulesetId: string) => ValidationRuleset | undefined;
  getUserById: (userId: string | null | undefined) => User | undefined;

  isReady: boolean;
  isBackgroundFetching: boolean;
  fetchData: (triggeredBy?: string) => Promise<void>;
  formatApiError: (response: Response, defaultMessage: string) => Promise<string>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const { hasPermission, isLoading: authIsLoading } = useAuth();
  const [models, setModels] = useState<Model[]>([]);
  const [objects, setObjects] = useState<Record<string, DataObject[]>>({}); // Active objects
  const [deletedObjects, setDeletedObjects] = useState<Record<string, DataObject[]>>({}); // Soft-deleted objects
  const [modelGroups, setModelGroups] = useState<ModelGroup[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowWithDetails[]>([]);
  const [wizards, setWizards] = useState<Wizard[]>([]);
  const [validationRulesets, setValidationRulesets] = useState<ValidationRuleset[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isBackgroundFetching, setIsBackgroundFetching] = useState(false);
  const [lastChangedInfo, setLastChangedInfo] = useState<{ modelId: string, objectId: string, changeType: 'added' | 'updated' | 'restored' | 'deleted' } | null>(null);

  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingDataRef = useRef(false);
  const initialLoadCompletedRef = useRef(false);


  const fetchWorkflowsInternal = useCallback(async (): Promise<WorkflowWithDetails[] | null> => {
    try {
      const response = await fetch('/api/codex-structure/workflows');
      if (!response.ok) {
        const errorMessage = await formatApiError(response.clone(), 'Failed to fetch workflows');
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

  const fetchWizardsInternal = useCallback(async (): Promise<Wizard[] | null> => {
    try {
        const response = await fetch('/api/codex-structure/wizards');
        if (!response.ok) {
            const errorMessage = await formatApiError(response.clone(), 'Failed to fetch wizards');
            throw new Error(errorMessage);
        }
        const wizardsDataFromApi: Wizard[] = await response.json();
        return wizardsDataFromApi.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error: any) {
        console.error("[DataContext] Failed to load wizards from API:", error.message, error);
        return null;
    }
  }, []);

  const fetchValidationRulesetsInternal = useCallback(async (): Promise<ValidationRuleset[] | null> => {
    try {
      const response = await fetch('/api/codex-structure/validation-rulesets');
      if (!response.ok) {
        const errorMessage = await formatApiError(response.clone(), 'Failed to fetch validation rulesets');
        throw new Error(errorMessage);
      }
      const rulesetsDataFromApi: ValidationRuleset[] = await response.json();
      return rulesetsDataFromApi.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error: any) {
      console.error("[DataContext] Failed to load validation rulesets from API:", error.message, error);
      return null;
    }
  }, []);
  
  const fetchAllUsersInternal = useCallback(async (): Promise<User[] | null> => {
    try {
      const response = await fetch('/api/users');
      if (!response.ok) {
        const errorMessage = await formatApiError(response.clone(), 'Failed to fetch users');
        throw new Error(errorMessage);
      }
      const usersDataFromApi: User[] = await response.json();
      return usersDataFromApi.sort((a, b) => a.username.localeCompare(b.username));
    } catch (error: any) {
      console.error("[DataContext] Failed to load users from API:", error.message, error);
      return null;
    }
  }, []);


  const fetchData = useCallback(async (triggeredBy?: string) => {
    if (isFetchingDataRef.current || authIsLoading) {
      return;
    }
    isFetchingDataRef.current = true;

    if (initialLoadCompletedRef.current) {
      setIsBackgroundFetching(true);
    } else {
      setIsReady(false);
    }

    try {
      const groupsResponse = await fetch('/api/codex-structure/model-groups');
      if (!groupsResponse.ok) throw new Error(await formatApiError(groupsResponse.clone(), 'Failed to fetch model groups'));
      const groupsDataFromApi: ModelGroup[] = await groupsResponse.json();
      
      setModelGroups(prevGroups => {
        const newGroupsSorted = [...groupsDataFromApi].sort((a, b) => a.name.localeCompare(b.name));
        const prevGroupsSorted = [...prevGroups].sort((a, b) => a.name.localeCompare(b.name));
        return JSON.stringify(newGroupsSorted) !== JSON.stringify(prevGroupsSorted) ? newGroupsSorted : prevGroups;
      });

      const modelsResponse = await fetch('/api/codex-structure/models');
      if (!modelsResponse.ok) throw new Error(await formatApiError(modelsResponse.clone(), 'Failed to fetch models'));
      const modelsDataFromApi: Model[] = await modelsResponse.json();
      
      setModels(prevModels => {
        const newModelsMapped = modelsDataFromApi.map(mapDbModelToClientModel);
        const newModelsSorted = [...newModelsMapped].sort((a,b) => a.id.localeCompare(b.id));
        const prevModelsSorted = [...prevModels].sort((a,b) => a.id.localeCompare(b.id));
        return JSON.stringify(newModelsSorted) !== JSON.stringify(prevModelsSorted) ? newModelsMapped : prevModels;
      });

      // Fetch active objects
      const activeObjectsResponse = await fetch('/api/codex-structure/objects/all'); // Default is non-deleted
      if (!activeObjectsResponse.ok) throw new Error(await formatApiError(activeObjectsResponse.clone(), 'Failed to fetch active objects'));
      const newActiveObjectsData: Record<string, DataObject[]> = await activeObjectsResponse.json();
      setObjects(newActiveObjectsData); // Direct set for active objects

      // Fetch soft-deleted objects
      const deletedObjectsResponse = await fetch('/api/codex-structure/objects/all?includeDeleted=true');
      if (!deletedObjectsResponse.ok) throw new Error(await formatApiError(deletedObjectsResponse.clone(), 'Failed to fetch all objects including deleted'));
      const allObjectsIncludingDeleted: Record<string, DataObject[]> = await deletedObjectsResponse.json();
      
      const newDeletedObjectsData: Record<string, DataObject[]> = {};
      for (const modelId in allObjectsIncludingDeleted) {
        newDeletedObjectsData[modelId] = allObjectsIncludingDeleted[modelId].filter(obj => obj.isDeleted);
      }
      setDeletedObjects(newDeletedObjectsData); // Direct set for deleted objects

      // Conditionally fetch admin-level data
      if (hasPermission('admin:manage_workflows')) {
        const newWorkflowsData = await fetchWorkflowsInternal();
        if (newWorkflowsData) {
          setWorkflows(prevWorkflows => {
            const newSortedJson = JSON.stringify([...newWorkflowsData].sort((a, b) => a.id.localeCompare(b.id)));
            const prevSortedJson = JSON.stringify([...prevWorkflows].sort((a, b) => a.id.localeCompare(b.id)));
            return newSortedJson !== prevSortedJson ? newWorkflowsData : prevWorkflows;
          });
        }
      } else {
        setWorkflows([]); // Clear data if no permission
      }
      
      if (hasPermission('admin:manage_wizards')) {
        const newWizardsData = await fetchWizardsInternal();
        if (newWizardsData) {
            setWizards(prevWizards => {
                const newSortedJson = JSON.stringify([...newWizardsData].sort((a, b) => a.id.localeCompare(b.id)));
                const prevSortedJson = JSON.stringify([...prevWizards].sort((a, b) => a.id.localeCompare(b.id)));
                return newSortedJson !== prevSortedJson ? newWizardsData : prevWizards;
            });
        }
      } else {
        setWizards([]);
      }

      if (hasPermission('admin:manage_validation_rules')) {
        const newRulesetsData = await fetchValidationRulesetsInternal();
        if (newRulesetsData) {
          setValidationRulesets(prevRulesets => {
            const newSortedJson = JSON.stringify([...newRulesetsData].sort((a,b) => a.id.localeCompare(b.id)));
            const prevSortedJson = JSON.stringify([...prevRulesets].sort((a,b) => a.id.localeCompare(b.id)));
            return newSortedJson !== prevSortedJson ? newRulesetsData : prevRulesets;
          });
        }
      } else {
        setValidationRulesets([]);
      }

      if (hasPermission('users:view')) {
        const newUsersData = await fetchAllUsersInternal();
        if (newUsersData) {
          setAllUsers(prevUsers => {
            const newSortedJson = JSON.stringify([...newUsersData].sort((a,b) => a.id.localeCompare(b.id)));
            const prevSortedJson = JSON.stringify([...prevUsers].sort((a,b) => a.id.localeCompare(b.id)));
            return newSortedJson !== prevSortedJson ? newUsersData : prevUsers;
          });
        }
      } else {
        setAllUsers([]);
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
    }
  }, [authIsLoading, hasPermission, fetchWorkflowsInternal, fetchWizardsInternal, fetchValidationRulesetsInternal, fetchAllUsersInternal]);


  useEffect(() => {
    if (!authIsLoading) {
        fetchData('Initial Load / Auth Change');
    }
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, [fetchData, authIsLoading]);


  const addModel = useCallback(async (modelData: Omit<Model, 'id' | 'modelGroupId' | 'workflowId'> & { modelGroupId?: string | null, workflowId?: string | null }): Promise<Model> => {
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
      minValue: p.type === 'number' ? (p.minValue === undefined || p.minValue === null || isNaN(Number(p.minValue)) ? null : Number(p.minValue)) : null,
      maxValue: p.type === 'number' ? (p.maxValue === undefined || p.maxValue === null || isNaN(Number(p.maxValue)) ? null : Number(p.maxValue)) : null,
    }));
    
    const payload = { 
        ...modelData, 
        id: modelId, 
        modelGroupId: modelData.modelGroupId, 
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

  const updateModel = useCallback(async (modelId: string, updates: ModelUpdatePayload): Promise<Model | undefined> => {
    const payload: ModelUpdatePayload = { ...updates };

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

  const addObject = useCallback(async (modelId: string, objectData: Omit<DataObject, 'id' | 'currentStateId' | 'ownerId'> & {currentStateId?: string | null, ownerId?: string | null}, objectId?: string): Promise<DataObject> => {
    const finalObjectId = objectId || crypto.randomUUID();
    const payload = { ...objectData, id: finalObjectId }; 
    const response = await fetch(`/api/codex-structure/models/${modelId}/objects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw await formatApiError(response, `Failed to add object to model ${modelId}`);
    }
    const newObject: DataObject = await response.json();
    await fetchData(`After Add Object to ${modelId}`);
    setLastChangedInfo({ modelId, objectId: newObject.id, changeType: 'added' });
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => setLastChangedInfo(null), HIGHLIGHT_DURATION_MS);
    return newObject;
  }, [fetchData]);

  const updateObject = useCallback(async (modelId: string, objectId: string, updates: Partial<Omit<DataObject, 'id'>>) => {
    const response = await fetch(`/api/codex-structure/models/${modelId}/objects/${objectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      throw await formatApiError(response, `Failed to update object ${objectId} in model ${modelId}`);
    }
    const updatedObjectFromApi: DataObject = await response.json();
    await fetchData(`After Update Object ${objectId} in ${modelId}`);
    setLastChangedInfo({ modelId, objectId, changeType: 'updated' });
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => setLastChangedInfo(null), HIGHLIGHT_DURATION_MS);
    return updatedObjectFromApi;
  }, [fetchData]);

  const deleteObject = useCallback(async (modelId: string, objectId: string) => { // Now soft deletes
    const response = await fetch(`/api/codex-structure/models/${modelId}/objects/${objectId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(await formatApiError(response, `Failed to soft delete object ${objectId} from model ${modelId}`));
    await fetchData(`After Soft Delete Object ${objectId} from ${modelId}`);
    setLastChangedInfo({ modelId, objectId, changeType: 'deleted' });
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => setLastChangedInfo(null), HIGHLIGHT_DURATION_MS);
  }, [fetchData]);

  const restoreObject = useCallback(async (modelId: string, objectId: string): Promise<DataObject | undefined> => {
    const response = await fetch(`/api/codex-structure/models/${modelId}/objects/${objectId}/restore`, { method: 'POST' });
    if (!response.ok) throw new Error(await formatApiError(response, `Failed to restore object ${objectId} in model ${modelId}`));
    const restoredObjectFromApi: DataObject = await response.json();
    await fetchData(`After Restore Object ${objectId} in ${modelId}`);
    setLastChangedInfo({ modelId, objectId, changeType: 'restored' });
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => setLastChangedInfo(null), HIGHLIGHT_DURATION_MS);
    return restoredObjectFromApi;
  }, [fetchData]);

  const getObjectsByModelId = useCallback((modelId: string, includeDeleted = false) => {
    if (includeDeleted) {
      const active = objects[modelId] || [];
      const deleted = deletedObjects[modelId] || [];
      // Combine and ensure no duplicates if an object was somehow in both (shouldn't happen with proper API logic)
      const combined = [...active, ...deleted];
      const uniqueCombined = Array.from(new Map(combined.map(item => [item.id, item])).values());
      return uniqueCombined;
    }
    return objects[modelId] || [];
  }, [objects, deletedObjects]);

  const getAllObjects = useCallback((includeDeleted = false) => {
    if (includeDeleted) {
      const allCombinedObjects: Record<string, DataObject[]> = {};
      const allModelIds = new Set([...Object.keys(objects), ...Object.keys(deletedObjects)]);
      allModelIds.forEach(modelId => {
        allCombinedObjects[modelId] = getObjectsByModelId(modelId, true);
      });
      return allCombinedObjects;
    }
    return objects;
  }, [objects, deletedObjects, getObjectsByModelId]);

  const addModelGroup = useCallback(async (groupData: Omit<ModelGroup, 'id'>): Promise<ModelGroup> => {
    const response = await fetch('/api/codex-structure/model-groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(groupData),
    });
    if (!response.ok) throw new Error(await formatApiError(response, 'Failed to add model group'));
    const newGroup: ModelGroup = await response.json();
    await fetchData('After Add Model Group');
    return newGroup;
  }, [fetchData]);

  const updateModelGroup = useCallback(async (groupId: string, updates: Partial<Omit<ModelGroup, 'id'>>) => {
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
  
  const addWizard = useCallback(async (wizardData: Omit<Wizard, 'id' | 'steps'> & { steps: Array<Omit<Wizard['steps'][0], 'id' | 'wizardId'>> }): Promise<Wizard> => {
    const response = await fetch('/api/codex-structure/wizards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(wizardData) });
    if (!response.ok) throw new Error(await formatApiError(response, 'Failed to add wizard'));
    const newWizard: Wizard = await response.json();
    await fetchData('After Add Wizard');
    return newWizard;
  }, [fetchData]);

  const updateWizard = useCallback(async (wizardId: string, wizardData: Omit<Wizard, 'id' | 'steps'> & { steps: Array<Omit<Wizard['steps'][0], 'id' | 'wizardId'> & {id?:string}> }): Promise<Wizard | undefined> => {
    const response = await fetch(`/api/codex-structure/wizards/${wizardId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(wizardData) });
    if (!response.ok) throw new Error(await formatApiError(response, 'Failed to update wizard'));
    const updatedWizard: Wizard = await response.json();
    await fetchData('After Update Wizard');
    return updatedWizard;
  }, [fetchData]);

  const deleteWizard = useCallback(async (wizardId: string) => {
    const response = await fetch(`/api/codex-structure/wizards/${wizardId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(await formatApiError(response, 'Failed to delete wizard'));
    await fetchData('After Delete Wizard');
  }, [fetchData]);

  const getWizardById = useCallback((wizardId: string) => wizards.find(w => w.id === wizardId), [wizards]);

  const addValidationRuleset = useCallback(async (rulesetData: Omit<ValidationRuleset, 'id'>): Promise<ValidationRuleset> => {
    const response = await fetch('/api/codex-structure/validation-rulesets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rulesetData),
    });
    if (!response.ok) throw new Error(await formatApiError(response, 'Failed to add validation ruleset'));
    const newRuleset: ValidationRuleset = await response.json();
    await fetchData('After Add ValidationRuleset');
    return newRuleset;
  }, [fetchData]);

  const updateValidationRuleset = useCallback(async (rulesetId: string, updates: Partial<Omit<ValidationRuleset, 'id'>>) => {
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
  const getUserById = useCallback((userId: string | null | undefined) => allUsers.find(u => u.id === userId), [allUsers]);


  const contextValue: DataContextType = {
    models, objects, deletedObjects, modelGroups, workflows, wizards, validationRulesets, allUsers, lastChangedInfo,
    addModel, updateModel, deleteModel, getModelById, getModelByName,
    addObject, updateObject, deleteObject, restoreObject, getObjectsByModelId, getAllObjects,
    addModelGroup, updateModelGroup, deleteModelGroup, getModelGroupById, getModelGroupByName, getAllModelGroups,
    addWorkflow, updateWorkflow, deleteWorkflow, getWorkflowById, 
    addWizard, updateWizard, deleteWizard, getWizardById,
    addValidationRuleset, updateValidationRuleset, deleteValidationRuleset, getValidationRulesetById,
    getUserById,
    isReady, isBackgroundFetching, fetchData, formatApiError,
  };

  return <DataContext.Provider value={contextValue}>{children}</DataContext.Provider>;
}

export function useData(): DataContextType {
  const context = useContext(DataContext);
  if (context === undefined) throw new Error('useData must be used within a DataProvider');
  return context;
}
