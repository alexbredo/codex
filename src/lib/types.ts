
export type PropertyType = 'string' | 'number' | 'boolean' | 'date' | 'relationship' | 'markdown' | 'rating' | 'image';

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
  isUnique?: boolean; // For string type: enforce unique value across objects of this model
  orderIndex: number; // For property display order
  defaultValue?: string; // Stored as string, parsed based on 'type' when used
  validationRulesetId?: string | null; // ID of the assigned validation ruleset
  minValue?: number | null; // For number type: minimum value
  maxValue?: number | null; // For number type: maximum value
}

export interface Model {
  id:string;
  name: string;
  description?: string;
  namespace: string; // Will always have a value, defaulting to 'Default'
  properties: Property[];
  displayPropertyNames?: string[]; // Property names to use for display purposes
  workflowId?: string | null; // ID of the assigned workflow
}

export interface ModelGroup {
  id: string;
  name: string;
  description?: string;
}

export interface DataObject {
  id: string;
  currentStateId?: string | null; // ID of the current workflow state
  ownerId?: string | null; // ID of the user who owns/created the record
  createdAt?: string; // ISO 8601 date string
  updatedAt?: string; // ISO 8601 date string
  [key: string]: any; // Dynamic properties based on the model
}

// Workflow System Types
export interface WorkflowStateInput { // For form input, before DB IDs are known for successors
  id?: string; // Optional, for existing states during update
  name: string;
  description?: string;
  color?: string | null; // Hex color code
  isInitial?: boolean;
  orderIndex: number; // For maintaining UI order
  successorStateNames?: string[]; // Use names for UI, resolve to IDs on backend
}

export interface WorkflowState {
  id: string;
  workflowId: string;
  name: string;
  description?: string;
  color?: string | null; // Hex color code
  isInitial: boolean; // Stored as 0 or 1 in DB, mapped to boolean
  orderIndex: number;
}

export interface WorkflowStateWithSuccessors extends WorkflowState {
  successorStateIds: string[];
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
}

export interface WorkflowWithDetails extends Workflow {
  initialStateId?: string | null;
  states: WorkflowStateWithSuccessors[];
}

// Validation Ruleset System Types
export interface ValidationRuleset {
  id: string;
  name: string;
  description?: string;
  regexPattern: string;
}


// For forms
export type ModelFormData = Omit<Model, 'id' | 'namespace' | 'workflowId'> & {
  namespace?: string; // Optional in form, will be defaulted
  workflowId?: string | null; // Optional in form
};
export type PropertyFormData = Omit<Property, 'id' | 'orderIndex'> & {
  id?: string; // Make ID optional for new properties in form
  orderIndex?: number; // Optional for form, will be set programmatically
  relationshipType?: 'one' | 'many',
  autoSetOnCreate?: boolean,
  autoSetOnUpdate?: boolean,
  isUnique?: boolean,
  defaultValue?: string;
  validationRulesetId?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
};
export type ObjectFormData = Omit<DataObject, 'id' | 'currentStateId' | 'ownerId' | 'createdAt' | 'updatedAt'> & {
  currentStateId?: string | null;
  ownerId?: string | null;
};


export type ModelGroupFormData = Omit<ModelGroup, 'id'>;
export type ValidationRulesetFormData = Omit<ValidationRuleset, 'id'>;

