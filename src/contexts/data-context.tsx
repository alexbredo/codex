
'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Model, DataObject, Property } from '@/lib/types';

interface DataContextType {
  models: Model[];
  objects: Record<string, DataObject[]>;
  addModel: (modelData: Omit<Model, 'id' | 'namespace'> & { namespace?: string }) => Promise<Model>;
  updateModel: (modelId: string, updates: Partial<Omit<Model, 'id' | 'properties' | 'displayPropertyNames' | 'namespace'>> & { properties?: Property[], displayPropertyNames?: string[], namespace?: string }) => Promise<Model | undefined>;
  deleteModel: (modelId: string) => Promise<void>;
  getModelById: (modelId: string) => Model | undefined;
  getModelByName: (name: string) => Model | undefined;
  addObject: (modelId: string, objectData: Omit<DataObject, 'id'>) => Promise<DataObject>;
  updateObject: (modelId: string, objectId: string, updates: Partial<Omit<DataObject, 'id'>>) => Promise<DataObject | undefined>;
  deleteObject: (modelId: string, objectId: string) => Promise<void>;
  getObjectsByModelId: (modelId: string) => DataObject[];
  getAllObjects: () => Record<string, DataObject[]>;
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
      console.warn(`Could not parse displayPropertyNames for model ${dbModel.id}: '${dbModel.displayPropertyNames}'`, e);
    }
  }

  return {
    id: dbModel.id,
    name: dbModel.name,
    description: dbModel.description,
    namespace: dbModel.namespace || 'Default',
    displayPropertyNames: parsedDisplayPropertyNames,
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
    })).sort((a, b) => a.orderIndex - b.orderIndex),
  };
};


export function DataProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState<Model[]>([]);
  const [objects, setObjects] = useState<Record<string, DataObject[]>>({});
  const [isReady, setIsReady] = useState(false);

  const formatApiError = async (response: Response, defaultMessage: string): Promise<string> => {
    let errorMessage = defaultMessage;
    try {
      const errorData = await response.json();
      console.error(`API Error (raw data from ${response.url}):`, errorData); // Keep this for server-side detailed logs
      if (errorData && errorData.error) {
        errorMessage = errorData.error;
        if (errorData.details) {
          errorMessage += ` (Details: ${errorData.details})`;
        }
      } else if (response.statusText) {
        errorMessage = `${defaultMessage}: ${response.status} ${response.statusText}`;
      } else {
         errorMessage = `${defaultMessage}: Server responded with status ${response.status} but no error details.`;
      }
    } catch (e) {
      console.error(`Failed to parse error response from server or non-JSON error response from ${response.url}:`, e);
      errorMessage = `${defaultMessage}: Server responded with status ${response.status} and non-JSON error body.`;
    }
    return errorMessage;
  };

  const fetchData = useCallback(async () => {
    setIsReady(false);
    try {
      const modelsResponse = await fetch('/api/data-weaver/models');
      if (!modelsResponse.ok) {
        let errorMessage = `Failed to fetch models. Status: ${modelsResponse.status}`;
        try {
          const errorData = await modelsResponse.json();
          if (errorData && errorData.error) {
            errorMessage += ` - Server: ${errorData.error}`;
            if (errorData.details) errorMessage += ` Details: ${errorData.details}`;
          }
        } catch (e) {
          errorMessage += ` - ${modelsResponse.statusText || 'Server did not provide detailed error.'}`;
        }
        throw new Error(errorMessage);
      }
      const modelsDataFromApi: Model[] = await modelsResponse.json();
      setModels(modelsDataFromApi.map(mapDbModelToClientModel));

      const allObjectsResponse = await fetch('/api/data-weaver/objects/all');
      if (!allObjectsResponse.ok) {
        let errorMessage = `Failed to fetch all objects. Status: ${allObjectsResponse.status}`;
        try {
            const errorData = await allObjectsResponse.json();
            if (errorData && errorData.error) {
                errorMessage += ` - Server: ${errorData.error}`;
                if (errorData.details) errorMessage += ` Details: ${errorData.details}`;
            }
        } catch (e) {
            errorMessage += ` - ${allObjectsResponse.statusText || 'Server did not provide detailed error.'}`;
        }
        throw new Error(errorMessage);
      }
      const allObjectsData: Record<string, DataObject[]> = await allObjectsResponse.json();
      setObjects(allObjectsData);

    } catch (error) {
      console.error("Failed to load data from API:", error);
      setModels([]);
      setObjects({});
    }
    setIsReady(true);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addModel = useCallback(async (modelData: Omit<Model, 'id' | 'namespace'> & { namespace?: string }): Promise<Model> => {
    const modelId = crypto.randomUUID();
    const propertiesWithIdsAndOrder = modelData.properties.map((p, index) => ({ 
      ...p, 
      id: p.id || crypto.randomUUID(),
      orderIndex: index 
    }));
    const finalNamespace = (modelData.namespace && modelData.namespace.trim() !== '') ? modelData.namespace.trim() : 'Default';
    
    const response = await fetch('/api/data-weaver/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...modelData, id: modelId, namespace: finalNamespace, properties: propertiesWithIdsAndOrder }),
    });
    if (!response.ok) {
      const errorMessage = await formatApiError(response, 'Failed to add model');
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

  const updateModel = useCallback(async (modelId: string, updates: Partial<Omit<Model, 'id' | 'properties' | 'displayPropertyNames' | 'namespace'>> & { properties?: Property[], displayPropertyNames?: string[], namespace?: string }): Promise<Model | undefined> => {
    const propertiesWithEnsuredIdsAndOrder = updates.properties?.map((p, index) => ({
      ...p,
      id: p.id || crypto.randomUUID(),
      required: !!p.required,
      autoSetOnCreate: !!p.autoSetOnCreate,
      autoSetOnUpdate: !!p.autoSetOnUpdate,
      isUnique: !!p.isUnique,
      orderIndex: index
    }));

    const finalNamespace = (updates.namespace && updates.namespace.trim() !== '') ? updates.namespace.trim() : undefined; // If undefined, API defaults

    const payload = {
      ...updates,
      namespace: finalNamespace, // Send possibly undefined, let API default if needed
      properties: propertiesWithEnsuredIdsAndOrder,
    };

    const response = await fetch(`/api/data-weaver/models/${modelId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
     if (!response.ok) {
      const errorMessage = await formatApiError(response, 'Failed to update model');
      throw new Error(errorMessage);
    }
    const updatedModelFromApi: Model = await response.json();
    const clientModel = mapDbModelToClientModel(updatedModelFromApi);
    
    let returnedModel: Model | undefined;
    setModels((prevModels) =>
      prevModels.map((model) => {
        if (model.id === modelId) {
          returnedModel = clientModel;
          return clientModel;
        }
        return model;
      }).sort((a, b) => {
        if (a.namespace.toLowerCase() < b.namespace.toLowerCase()) return -1;
        if (a.namespace.toLowerCase() > b.namespace.toLowerCase()) return 1;
        return a.name.localeCompare(b.name);
      })
    );
    return returnedModel;
  }, []);

  const deleteModel = useCallback(async (modelId: string) => {
    const response = await fetch(`/api/data-weaver/models/${modelId}`, {
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


  const addObject = useCallback(async (modelId: string, objectData: Omit<DataObject, 'id'>): Promise<DataObject> => {
    const objectId = crypto.randomUUID();
    const response = await fetch(`/api/data-weaver/models/${modelId}/objects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...objectData, id: objectId }),
    });
    if (!response.ok) {
      const errorMessage = await formatApiError(response, `Failed to add object to model ${modelId}`);
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
    const response = await fetch(`/api/data-weaver/models/${modelId}/objects/${objectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      const errorMessage = await formatApiError(response, `Failed to update object ${objectId} in model ${modelId}`);
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
    const response = await fetch(`/api/data-weaver/models/${modelId}/objects/${objectId}`, {
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

  return (
    <DataContext.Provider value={{ models, objects, addModel, updateModel, deleteModel, getModelById, getModelByName, addObject, updateObject, deleteObject, getObjectsByModelId, getAllObjects, isReady, fetchData }}>
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
