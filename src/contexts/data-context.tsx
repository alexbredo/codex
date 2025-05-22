'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Model, DataObject, Property } from '@/lib/types';

interface DataContextType {
  models: Model[];
  objects: Record<string, DataObject[]>;
  addModel: (modelData: Omit<Model, 'id'>) => Model;
  updateModel: (modelId: string, updates: Partial<Omit<Model, 'id' | 'properties'>> & { properties?: Property[] }) => Model | undefined;
  deleteModel: (modelId: string) => void;
  getModelById: (modelId: string) => Model | undefined;
  getModelByName: (name: string) => Model | undefined;
  addObject: (modelId: string, objectData: Omit<DataObject, 'id'>) => DataObject;
  updateObject: (modelId: string, objectId: string, updates: Partial<Omit<DataObject, 'id'>>) => DataObject | undefined;
  deleteObject: (modelId: string, objectId: string) => void;
  getObjectsByModelId: (modelId: string) => DataObject[];
  isReady: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

const initialModels: Model[] = [
  {
    id: 'clx18090o0000qp08j9q1x0y0',
    name: 'Product',
    description: 'Represents products in the inventory.',
    properties: [
      { id: 'clx18090p0001qp08w6k2y0s3', name: 'Name', type: 'string', required: true },
      { id: 'clx18090p0002qp08l3c8k7j1', name: 'Price', type: 'number', required: true },
      { id: 'clx18090p0003qp08q8b5d9e2', name: 'In Stock', type: 'boolean' },
      { id: 'clx18090q0004qp08q3z9h7x4', name: 'Release Date', type: 'date' },
    ],
  },
  {
    id: 'clx18090q0005qp08m2n7b1d5',
    name: 'Customer',
    description: 'Represents customers of the business.',
    properties: [
      { id: 'clx18090q0006qp08t0u8v9w6', name: 'First Name', type: 'string', required: true },
      { id: 'clx18090q0007qp08a2b3c4d7', name: 'Last Name', type: 'string', required: true },
      { id: 'clx18090q0008qp08e5f6g7h8', name: 'Email', type: 'string' },
      { id: 'clx18090r0009qp08i9j0k1l9', name: 'Is Premium', type: 'boolean' },
      { id: 'clx18090r000aqp08p2q3r4s0', name: 'Joined Date', type: 'date' },
    ],
  },
];

const initialObjects: Record<string, DataObject[]> = {
  'clx18090o0000qp08j9q1x0y0': [ // Products
    { id: 'clx182dbs0000ui08nsl7y3kz', Name: 'Laptop Pro X', Price: 1499.99, 'In Stock': true, 'Release Date': '2023-05-15T00:00:00.000Z' },
    { id: 'clx182dbt0001ui08opq8r9st', Name: 'Wireless Keyboard', Price: 79.50, 'In Stock': false, 'Release Date': '2022-11-01T00:00:00.000Z' },
  ],
  'clx18090q0005qp08m2n7b1d5': [ // Customers
    { id: 'clx182dbt0002ui08uvw9x0yz', 'First Name': 'Alice', 'Last Name': 'Johnson', Email: 'alice@example.com', 'Is Premium': true, 'Joined Date': '2021-01-20T00:00:00.000Z' },
  ],
};


export function DataProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState<Model[]>([]);
  const [objects, setObjects] = useState<Record<string, DataObject[]>>({});
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    try {
      const storedModels = localStorage.getItem('dynamicDataWeaver_models');
      const storedObjects = localStorage.getItem('dynamicDataWeaver_objects');
      if (storedModels) {
        setModels(JSON.parse(storedModels));
      } else {
        setModels(initialModels); // Load initial if nothing in storage
      }
      if (storedObjects) {
        setObjects(JSON.parse(storedObjects));
      } else {
        setObjects(initialObjects); // Load initial if nothing in storage
      }
    } catch (error) {
      console.error("Failed to load data from localStorage", error);
      setModels(initialModels);
      setObjects(initialObjects);
    }
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (isReady) {
      try {
        localStorage.setItem('dynamicDataWeaver_models', JSON.stringify(models));
      } catch (error) {
        console.error("Failed to save models to localStorage", error);
      }
    }
  }, [models, isReady]);

  useEffect(() => {
    if (isReady) {
      try {
        localStorage.setItem('dynamicDataWeaver_objects', JSON.stringify(objects));
      } catch (error) {
        console.error("Failed to save objects to localStorage", error);
      }
    }
  }, [objects, isReady]);

  const addModel = useCallback((modelData: Omit<Model, 'id'>): Model => {
    const newModel: Model = { ...modelData, id: crypto.randomUUID() };
    setModels((prev) => [...prev, newModel]);
    return newModel;
  }, []);

  const updateModel = useCallback((modelId: string, updates: Partial<Omit<Model, 'id' | 'properties'>> & { properties?: Property[] }): Model | undefined => {
    let updatedModel: Model | undefined;
    setModels((prevModels) =>
      prevModels.map((model) => {
        if (model.id === modelId) {
          updatedModel = { ...model, ...updates };
          return updatedModel;
        }
        return model;
      })
    );
    return updatedModel;
  }, []);

  const deleteModel = useCallback((modelId: string) => {
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


  const addObject = useCallback((modelId: string, objectData: Omit<DataObject, 'id'>): DataObject => {
    const newObject: DataObject = { ...objectData, id: crypto.randomUUID() };
    setObjects((prev) => ({
      ...prev,
      [modelId]: [...(prev[modelId] || []), newObject],
    }));
    return newObject;
  }, []);

  const updateObject = useCallback((modelId: string, objectId: string, updates: Partial<Omit<DataObject, 'id'>>): DataObject | undefined => {
    let updatedObject: DataObject | undefined;
    setObjects((prevObjects) => {
      const modelObjects = prevObjects[modelId] || [];
      const newModelObjects = modelObjects.map((obj) => {
        if (obj.id === objectId) {
          updatedObject = { ...obj, ...updates };
          return updatedObject;
        }
        return obj;
      });
      return { ...prevObjects, [modelId]: newModelObjects };
    });
    return updatedObject;
  }, []);

  const deleteObject = useCallback((modelId: string, objectId: string) => {
    setObjects((prev) => ({
      ...prev,
      [modelId]: (prev[modelId] || []).filter((obj) => obj.id !== objectId),
    }));
  }, []);

  const getObjectsByModelId = useCallback((modelId: string) => {
    return objects[modelId] || [];
  }, [objects]);

  return (
    <DataContext.Provider value={{ models, objects, addModel, updateModel, deleteModel, getModelById, getModelByName, addObject, updateObject, deleteObject, getObjectsByModelId, isReady }}>
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
