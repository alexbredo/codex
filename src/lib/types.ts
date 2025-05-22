
export type PropertyType = 'string' | 'number' | 'boolean' | 'date' | 'relationship';

export interface Property {
  id: string;
  name: string;
  type: PropertyType;
  relatedModelId?: string; // Only if type is 'relationship'
  required?: boolean;
  relationshipType?: 'one' | 'many'; // For relationship type
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
export type PropertyFormData = Omit<Property, 'id'> & { relationshipType?: 'one' | 'many' };
export type ObjectFormData = Omit<DataObject, 'id'>;
