
export type PropertyType = 'string' | 'number' | 'boolean' | 'date' | 'relationship';

export interface Property {
  id: string;
  name: string;
  type: PropertyType;
  relatedModelId?: string; // Only if type is 'relationship'
  required?: boolean;
}

export interface Model {
  id: string;
  name: string;
  description?: string;
  properties: Property[];
}

export interface DataObject {
  id: string;
  [key: string]: any; // Dynamic properties based on the model
}

// For forms
export type ModelFormData = Omit<Model, 'id'>;
export type PropertyFormData = Omit<Property, 'id'>;
export type ObjectFormData = Omit<DataObject, 'id'>;
