
export type PropertyType = 'string' | 'number' | 'boolean' | 'date' | 'relationship' | 'markdown' | 'rating' | 'image' | 'fileAttachment';

export interface Property {
  id: string;
  model_id: string;
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
  modelGroupId: string | null;
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
  isDeleted?: boolean; // Flag for soft delete
  deletedAt?: string | null; // Timestamp for soft delete
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

// Changelog Types for Data Objects
export interface PropertyChangeDetail {
  propertyName: string;
  oldValue: any;
  newValue: any;
  // Optional labels for special fields like workflow state or owner
  oldLabel?: string;
  newLabel?: string;
}

export type ChangelogEventType = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'REVERT_UPDATE' | 'REVERT_DELETE' | 'REVERT_RESTORE';

export interface ChangelogEventData {
  type: ChangelogEventType;
  status?: 'deleted' | 'restored'; // For DELETE/RESTORE types
  timestamp?: string; // For DELETE/RESTORE types
  initialData?: Record<string, any>; // For CREATE type
  modifiedProperties?: PropertyChangeDetail[]; // For UPDATE type, also for REVERT_UPDATE
  snapshot?: Record<string, any>; // For DELETE to store pre-delete state, also used by REVERT_DELETE
  revertedFromChangelogEntryId?: string; // For REVERT_* types, to link back to the entry that was reverted
}

export interface ChangelogEntry {
  id: string;
  dataObjectId: string;
  modelId: string;
  changedAt: string; // ISO 8601
  changedByUserId: string | null;
  changedByUsername?: string; // Populated by API when fetching
  changeType: ChangelogEventType;
  changes: ChangelogEventData; // Parsed JSON from DB
}

// Structural Changelog Types
export type StructuralChangelogEntityType = 'ModelGroup' | 'Model' | 'Property' | 'Workflow' | 'WorkflowState' | 'ValidationRuleset';
export type StructuralChangelogActionType = 'CREATE' | 'UPDATE' | 'DELETE';

export interface StructuralChangeDetail {
  field: string; // e.g., 'name', 'description', 'propertyAdded', 'propertyRemoved', 'propertyUpdated'
  oldValue?: any;
  newValue?: any;
  propertyId?: string; // If change relates to a specific property within a model
  propertyName?: string; // If change relates to a specific property within a model
}

export interface StructuralChangelogEntry {
  id: string;
  timestamp: string; // ISO 8601
  userId: string | null;
  username?: string; // To be populated on fetch for display
  entityType: StructuralChangelogEntityType;
  entityId: string;
  entityName?: string; // Name of the entity (e.g., Model Group name, Model name)
  action: StructuralChangelogActionType;
  changes: StructuralChangeDetail[] | Record<string, any>; // Parsed JSON object from DB
}

// Security Log Types
export interface SecurityLogEntry {
  id: string;
  timestamp: string;
  userId: string | null;
  username?: string;
  action: string;
  targetEntityType?: string;
  targetEntityId?: string;
  details?: Record<string, any> | string; // Stored as JSON string, parsed on fetch
}

// Unified Activity Log Types
export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  category: 'Structural' | 'Data' | 'Security';
  user: {
    id: string | null;
    name: string;
  };
  action: string;
  entity: {
    type: string;
    id: string | null;
    name: string | null;
  };
  summary: string;
  details: any;
}


// Response type for paginated structural changelog
export interface PaginatedStructuralChangelogResponse {
  entries: StructuralChangelogEntry[];
  totalEntries: number;
  totalPages: number;
  currentPage: number;
}
export interface PaginatedActivityLogResponse {
  entries: ActivityLogEntry[];
  totalEntries: number;
  totalPages: number;
  currentPage: number;
}


// Type for Model Export
export interface ExportedModelBundle {
  model: Model;
  dataObjects: DataObject[];
}

// Dashboard and Widget Types
export type WidgetType = 'dataSummary' | 'modelCountChart' | 'quickStart' | 'numericSummary';

export interface WidgetConfigBase {
  title?: string;
}

export interface DataSummaryWidgetConfig extends WidgetConfigBase {
  summaryType: 'totalModels' | 'totalObjects' | { modelId: string; modelName?: string }; // modelName for display
}

export interface ModelCountChartWidgetConfig extends WidgetConfigBase {
  // No specific config needed for now, shows all models
}

export interface QuickStartWidgetConfig extends WidgetConfigBase {
  // No specific config needed for this type
}

export interface NumericSummaryWidgetConfig extends WidgetConfigBase {
  modelId: string;
  propertyId: string;
  calculationType: 'min' | 'max' | 'sum' | 'avg';
}

export type SpecificWidgetConfig = DataSummaryWidgetConfig | ModelCountChartWidgetConfig | QuickStartWidgetConfig | NumericSummaryWidgetConfig;

export interface WidgetGridConfig {
  colSpan?: number; // e.g., 1, 2, 3 for a 3-column grid
  rowSpan?: number;
  order?: number; // Optional for ordering if not using array index
}

export interface WidgetInstance {
  id: string; // Unique ID for this widget instance on the dashboard
  type: WidgetType;
  config: SpecificWidgetConfig;
  gridConfig: WidgetGridConfig;
}

export interface Dashboard {
  id: string;
  userId: string;
  name: string; // e.g., "My Main Dashboard"
  isDefault: boolean;
  widgets: WidgetInstance[]; // Stored as JSON in DB, parsed on fetch
  createdAt: string;
  updatedAt: string;
}

// RBAC Types
export interface Permission {
  id: string; // e.g., 'users:create'
  name: string; // e.g., 'Create Users'
  category: string; // e.g., 'User Management'
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  isSystemRole?: boolean;
  permissionIds?: string[]; // Populated when fetching a single role
}
export interface UserRoleInfo {
  id: string;
  name: string;
}
export interface UserSession {
  id: string;
  username: string;
  roles: UserRoleInfo[];
  permissionIds: string[];
}
