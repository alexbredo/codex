
'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { Model, DataObject, Property, ModelGroup, WorkflowWithDetails } from '@/lib/types';

const POLLING_INTERVAL_MS = 30000; // 30 seconds
const WEBSOCKET_RETRY_DELAY_MS = 5000; // 5 seconds
const HIGHLIGHT_DURATION_MS = 3000; // 3 seconds

interface DataContextType {
  models: Model[];
  objects: Record<string, DataObject[]>;
  modelGroups: ModelGroup[];
  workflows: WorkflowWithDetails[];
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

  fetchWorkflows: () => Promise<void>;
  addWorkflow: (workflowData: Omit<WorkflowWithDetails, 'id' | 'initialStateId' | 'states'> & { states: Array<Omit<WorkflowWithDetails['states'][0], 'id' | 'workflowId' | 'successorStateIds'> & {successorStateNames?: string[]}> }) => Promise<WorkflowWithDetails>;
  updateWorkflow: (workflowId: string, workflowData: Omit<WorkflowWithDetails, 'id' | 'initialStateId' | 'states'> & { states: Array<Omit<WorkflowWithDetails['states'][0], 'id' | 'workflowId' | 'successorStateIds'> & {id?:string, successorStateNames?: string[]}> }) => Promise<WorkflowWithDetails | undefined>;
  deleteWorkflow: (workflowId: string) => Promise<void>;
  getWorkflowById: (workflowId: string) => WorkflowWithDetails | undefined;

  isReady: boolean;
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
  const [isReady, setIsReady] = useState(false);
  const [lastChangedInfo, setLastChangedInfo] = useState<{ modelId: string, objectId: string, changeType: 'added' | 'updated' } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const [isPollingActive, setIsPollingActive] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const webSocketRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);


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

  const fetchData = useCallback(async (triggeredBy?: string) => {
    console.log(`[DataContext] fetchData called. Trigger: ${triggeredBy || 'Unknown'}`);
    setIsReady(false);
    try {
      const groupsResponse = await fetch('/api/codex-structure/model-groups');
      if (!groupsResponse.ok) throw new Error(await formatApiError(groupsResponse, 'Failed to fetch model groups'));
      const groupsData: ModelGroup[] = await groupsResponse.json();
      setModelGroups(groupsData.sort((a, b) => a.name.localeCompare(b.name)));

      const modelsResponse = await fetch('/api/codex-structure/models');
      if (!modelsResponse.ok) throw new Error(await formatApiError(modelsResponse, 'Failed to fetch models'));
      const modelsDataFromApi: Model[] = await modelsResponse.json();
      setModels(modelsDataFromApi.map(mapDbModelToClientModel));

      const allObjectsResponse = await fetch('/api/codex-structure/objects/all');
      if (!allObjectsResponse.ok) throw new Error(await formatApiError(allObjectsResponse, 'Failed to fetch all objects'));
      const allObjectsData: Record<string, DataObject[]> = await allObjectsResponse.json();
      setObjects(allObjectsData);

      await fetchWorkflows();
    } catch (error: any) {
      console.error(`Failed to load data from API. Trigger: ${triggeredBy}. Error:`, error.message, error);
      setModels([]); setObjects({}); setModelGroups([]); setWorkflows([]);
    } finally {
      setIsReady(true);
    }
  }, [fetchWorkflows]);

  const stopHttpPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      console.log("[DataContext] HTTP polling stopped.");
    }
    setIsPollingActive(false);
  }, []);

  const startHttpPolling = useCallback(() => {
    if (isPollingActive) return;
    console.log("[DataContext] Starting HTTP polling...");
    setIsPollingActive(true);
    fetchData('Polling Started'); 
    pollingIntervalRef.current = setInterval(() => {
      fetchData('Polling Interval');
    }, POLLING_INTERVAL_MS);
  }, [isPollingActive, fetchData]);

  const connectWebSocket = useCallback(() => {
    console.log("[DataContext] connectWebSocket called.");
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}/api/ws`;

    // Diagnostic GET request
    fetch('/api/ws')
      .then(async response => {
        const responseText = await response.text();
        console.log(`[DataContext] Diagnostic HTTP GET to /api/ws status: ${response.status}, statusText: N/A, response: ${responseText}`);
        if (!response.ok) {
          console.warn(`[DataContext] Diagnostic GET to /api/ws failed, status ${response.status}. WebSocket connection might also fail.`);
        }
      })
      .catch(error => {
        console.error('[DataContext] Diagnostic GET to /api/ws failed:', error);
      });

    console.log(`[DataContext] Attempting to connect to WebSocket at: ${wsUrl}`);
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      console.log("[DataContext] WebSocket connection attempt skipped: already open or connecting.");
      return;
    }

    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      console.log("[DataContext] WebSocket connection established.");
      if (webSocketRetryTimeoutRef.current) {
        clearTimeout(webSocketRetryTimeoutRef.current);
        webSocketRetryTimeoutRef.current = null;
      }
      stopHttpPolling();
    };

    wsRef.current.onmessage = async (event) => {
      console.log("[DataContext] WebSocket message received:", event.data);
      try {
        const message = JSON.parse(event.data as string);
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);

        if (message.type === 'OBJECT_CREATED' || message.type === 'OBJECT_UPDATED') {
          const { modelId, objectId } = message.payload;
          const response = await fetch(`/api/codex-structure/models/${modelId}/objects/${objectId}`);
          if (response.ok) {
            const updatedObject: DataObject = await response.json();
            setObjects(prev => ({
              ...prev,
              [modelId]: (prev[modelId] || []).map(obj => obj.id === objectId ? updatedObject : obj)
                                             .filter(obj => obj.id !== objectId || message.type === 'OBJECT_UPDATED') // remove if created then updated
                                             .concat(message.type === 'OBJECT_CREATED' && !(prev[modelId] || []).find(obj => obj.id === objectId) ? [updatedObject] : [])
            }));
            setLastChangedInfo({ modelId, objectId, changeType: message.type === 'OBJECT_CREATED' ? 'added' : 'updated' });
          } else {
            console.warn(`[DataContext] Failed to fetch details for ${message.type} object ${objectId} in model ${modelId}. Status: ${response.status}`);
            fetchData(`Partial refresh after ${message.type} due to fetch failure`);
          }
        } else if (message.type === 'OBJECT_DELETED') {
          const { modelId, objectId } = message.payload;
          setObjects(prev => ({
            ...prev,
            [modelId]: (prev[modelId] || []).filter(obj => obj.id !== objectId)
          }));
           setLastChangedInfo(null); // No specific highlight for delete, or could add one
        } else if (message.type === 'MODEL_STRUCTURE_CHANGED' || message.type === 'MODEL_GROUP_CHANGED' || message.type === 'WORKFLOW_CHANGED') {
           fetchData(`Data refresh due to ${message.type}`);
           setLastChangedInfo(null);
        } else {
           fetchData('WebSocket Full Refresh Trigger');
           setLastChangedInfo(null);
        }
        highlightTimeoutRef.current = setTimeout(() => setLastChangedInfo(null), HIGHLIGHT_DURATION_MS);
      } catch (error) {
        console.error("[DataContext] Error processing WebSocket message or fetching update:", error);
        fetchData('WebSocket Error Recovery Refresh');
        setLastChangedInfo(null);
      }
    };

    wsRef.current.onclose = (event) => {
      console.log(`[DataContext] WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason || 'N/A'}, WasClean: ${event.wasClean}`);
      if (!event.wasClean) {
        console.log("[DataContext] WebSocket closed unexpectedly. Attempting to reconnect and starting HTTP polling.");
        if (webSocketRetryTimeoutRef.current) clearTimeout(webSocketRetryTimeoutRef.current);
        webSocketRetryTimeoutRef.current = setTimeout(connectWebSocket, WEBSOCKET_RETRY_DELAY_MS);
        startHttpPolling();
      } else {
        stopHttpPolling(); // Stop polling if connection closed cleanly
      }
    };

    wsRef.current.onerror = (error) => {
      console.error("[DataContext] WebSocket error:", error);
      // onclose will typically follow an error, so reconnection logic is primarily there.
    };
  }, [fetchData, startHttpPolling, stopHttpPolling]);

  useEffect(() => {
    fetchData('Initial Load');
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        console.log("[DataContext] Closing WebSocket connection on component unmount.");
        wsRef.current.close();
        wsRef.current = null;
      }
      if (webSocketRetryTimeoutRef.current) clearTimeout(webSocketRetryTimeoutRef.current);
      stopHttpPolling(); // Ensure polling is stopped on unmount
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, [connectWebSocket]); // Removed fetchData from here based on user feedback


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
    // Optimistic update handled by WebSocket message and fetchData for full consistency
    await fetchData('After Add Model');
    return mapDbModelToClientModel(newModel);
  }, [fetchData]);

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
    // Optimistic update for immediate UI, WebSocket will confirm/update
    setObjects((prev) => ({ ...prev, [modelId]: [...(prev[modelId] || []), newObject] }));
    setLastChangedInfo({ modelId, objectId: newObject.id, changeType: 'added' });
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => setLastChangedInfo(null), HIGHLIGHT_DURATION_MS);
    // No full fetchData here; rely on WebSocket or polling for eventual consistency of others
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
    // Optimistic update
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
    // Optimistic update
    setObjects((prev) => ({ ...prev, [modelId]: (prev[modelId] || []).filter((obj) => obj.id !== objectId) }));
    // No highlight for delete or specific action
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

  const contextValue: DataContextType = {
    models, objects, modelGroups, workflows, lastChangedInfo,
    addModel, updateModel, deleteModel, getModelById, getModelByName,
    addObject, updateObject, deleteObject, getObjectsByModelId, getAllObjects,
    addModelGroup, updateModelGroup, deleteModelGroup, getModelGroupById, getModelGroupByName, getAllModelGroups,
    fetchWorkflows, addWorkflow, updateWorkflow, deleteWorkflow, getWorkflowById,
    isReady, fetchData, formatApiError
  };

  return <DataContext.Provider value={contextValue}>{children}</DataContext.Provider>;
}

export function useData(): DataContextType {
  const context = useContext(DataContext);
  if (context === undefined) throw new Error('useData must be used within a DataProvider');
  return context;
}
