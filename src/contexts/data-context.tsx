
'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Model, DataObject, Property } from '@/lib/types';

interface DataContextType {
  models: Model[];
  objects: Record<string, DataObject[]>;
  addModel: (modelData: Omit<Model, 'id'>) => Promise<Model>;
  updateModel: (modelId: string, updates: Partial<Omit<Model, 'id' | 'properties' | 'displayPropertyNames'>> & { properties?: Property[], displayPropertyNames?: string[] }) => Promise<Model | undefined>;
  deleteModel: (modelId: string) => Promise<void>;
  getModelById: (modelId: string) => Model | undefined;
  getModelByName: (name: string) => Model | undefined;
  addObject: (modelId: string, objectData: Omit<DataObject, 'id'>) => Promise<DataObject>;
  updateObject: (modelId: string, objectId: string, updates: Partial<Omit<DataObject, 'id'>>) => Promise<DataObject | undefined>;
  deleteObject: (modelId: string, objectId: string) => Promise<void>;
  getObjectsByModelId: (modelId: string) => DataObject[];
  getAllObjects: () => Record<string, DataObject[]>;
  isReady: boolean;
  fetchData: () => Promise<void>; // Added for manual refresh if needed
}

const DataContext = createContext<DataContextType | undefined>(undefined);

// Helper to map DB row to Model type (client-side)
const mapDbModelToClientModel = (dbModel: any): Model => {
  return {
    id: dbModel.id,
    name: dbModel.name,
    description: dbModel.description,
    displayPropertyNames: Array.isArray(dbModel.displayPropertyNames) 
      ? dbModel.displayPropertyNames 
      : (typeof dbModel.displayPropertyNames === 'string' && dbModel.displayPropertyNames.length > 2 ? JSON.parse(dbModel.displayPropertyNames) : []),
    properties: (dbModel.properties || []).map((p: any) => ({
      ...p,
      id: p.id || crypto.randomUUID(),
      required: p.required === 1 || p.required === true, 
      relationshipType: p.type === 'relationship' ? (p.relationshipType || 'one') : undefined,
      unit: p.type === 'number' ? p.unit : undefined,
      precision: p.type === 'number' ? (p.precision === undefined || p.precision === null ? 2 : p.precision) : undefined,
      autoSetOnCreate: p.type === 'date' ? (p.autoSetOnCreate === 1 || p.autoSetOnCreate === true) : false,
      autoSetOnUpdate: p.type === 'date' ? (p.autoSetOnUpdate === 1 || p.autoSetOnUpdate === true) : false,
    })),
  };
};


export function DataProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState<Model[]>([]);
  const [objects, setObjects] = useState<Record<string, DataObject[]>>({});
  const [isReady, setIsReady] = useState(false);

  const fetchData = useCallback(async () => {
    setIsReady(false);
    try {
      const modelsResponse = await fetch('/api/data-weaver/models');
      if (!modelsResponse.ok) throw new Error(`Failed to fetch models: ${modelsResponse.statusText}`);
      const modelsDataFromApi: Model[] = await modelsResponse.json();
      setModels(modelsDataFromApi.map(mapDbModelToClientModel));

      const allObjectsResponse = await fetch('/api/data-weaver/objects/all');
      if (!allObjectsResponse.ok) throw new Error(`Failed to fetch all objects: ${allObjectsResponse.statusText}`);
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


  const addModel = useCallback(async (modelData: Omit<Model, 'id'>): Promise<Model> => {
    const modelId = crypto.randomUUID();
    const propertiesWithIds = modelData.properties.map(p => ({ ...p, id: p.id || crypto.randomUUID() }));
    
    const response = await fetch('/api/data-weaver/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...modelData, id: modelId, properties: propertiesWithIds }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      console.error("API Error in addModel:", errorData);
      throw new Error(errorData.error || 'Failed to add model via API');
    }
    const newModel: Model = await response.json();
    const clientModel = mapDbModelToClientModel(newModel);
    setModels((prev) => [...prev, clientModel]);
    // Initialize objects for the new model
    setObjects((prev) => ({ ...prev, [clientModel.id]: [] }));
    return clientModel;
  }, []);

  const updateModel = useCallback(async (modelId: string, updates: Partial<Omit<Model, 'id' | 'properties' | 'displayPropertyNames'>> & { properties?: Property[], displayPropertyNames?: string[] }): Promise<Model | undefined> => {
    const propertiesWithEnsuredIds = updates.properties?.map(p => ({
      ...p,
      id: p.id || crypto.randomUUID(),
      required: !!p.required,
      autoSetOnCreate: !!p.autoSetOnCreate,
      autoSetOnUpdate: !!p.autoSetOnUpdate,
    }));

    const payload = {
      ...updates,
      properties: propertiesWithEnsuredIds,
    };

    const response = await fetch(`/api/data-weaver/models/${modelId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
     if (!response.ok) {
      const errorData = await response.json();
      console.error("API Error in updateModel:", errorData);
      throw new Error(errorData.error || 'Failed to update model via API');
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
      })
    );
    return returnedModel;
  }, []);

  const deleteModel = useCallback(async (modelId: string) => {
    const response = await fetch(`/api/data-weaver/models/${modelId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const errorData = await response.json();
      console.error("API Error in deleteModel:", errorData);
      throw new Error(errorData.error || 'Failed to delete model via API');
    }
    
    setModels((prev) => prev.filter((model) => model.id !== modelId));
    setObjects((prev) => {
      const newObjects = { ...prev };
      delete newObjects[modelId];
      return newObjects;
    });
    // Properties referencing this model in other models are handled by DB cascade or UI logic for relationships.
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
      const errorData = await response.json();
      console.error("API Error in addObject:", errorData);
      throw new Error(errorData.error || 'Failed to add object via API');
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
      const errorData = await response.json();
      console.error("API Error in updateObject:", errorData);
      throw new Error(errorData.error || 'Failed to update object via API');
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
      const errorData = await response.json();
      console.error("API Error in deleteObject:", errorData);
      throw new Error(errorData.error || 'Failed to delete object via API');
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
