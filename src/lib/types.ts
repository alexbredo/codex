
export type PropertyType = 'string' | 'number' | 'boolean' | 'date' | 'relationship';

export interface Property {
  id: string;
  name: string;
  type: PropertyType;
  relatedModelId?: string; // Only if type is 'relationship'
  required?: boolean;
  relationshipType?: 'one' | 'many'; // For relationship type
  unit?: string; // For number type
  precision?: number; // For number type
  autoSetOnCreate?: boolean; // For date type: set to current date on object creation
  autoSetOnUpdate?: boolean; // For date type: set to current date on object update
  orderIndex: number; // For property display order
}

export interface Model {
  id:string;
  name: string;
  description?: string;
  properties: Property[];
  displayPropertyNames?: string[]; // Property names to use for display purposes
}

export interface DataObject {
  id: string;
  [key: string]: any; // Dynamic properties based on the model
}

// For forms
export type ModelFormData = Omit<Model, 'id'>;
export type PropertyFormData = Omit<Property, 'id' | 'orderIndex'> & { 
  orderIndex?: number; // Optional for form, will be set programmatically
  relationshipType?: 'one' | 'many',
  autoSetOnCreate?: boolean,
  autoSetOnUpdate?: boolean,
};
export type ObjectFormData = Omit<DataObject, 'id'>;
