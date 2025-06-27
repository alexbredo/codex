
import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import path from 'path';
import fs from 'fs/promises'; // Use fs.promises for async file operations
import { DEBUG_MODE, MOCK_API_ADMIN_USER } from '@/lib/auth'; // Import debug constants
import type { Permission } from '@/lib/types';


// Determine the database path.
// It will be created in a 'data' subdirectory of the application root.
// In Docker, process.cwd() will be /app, so it becomes /app/data/database.sqlite
const dataDir = path.join(process.cwd(), 'data');
const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'database.sqlite');


let dbInstance: Promise<Database> | null = null;


const ALL_PERMISSIONS: Omit<Permission, 'id'>[] = [
  // User Management
  { name: 'View Users', category: 'Users', id: 'users:view' },
  { name: 'Create Users', category: 'Users', id: 'users:create' },
  { name: 'Edit Users', category: 'Users', id: 'users:edit' },
  { name: 'Delete Users', category: 'Users', id: 'users:delete' },
  { name: 'Manage Roles', category: 'Users', id: 'roles:manage' },
  
  // Object Permissions (Global) - Now clearly marked as global
  { name: 'Create Objects (Any Model)', category: 'Objects - Global', id: 'objects:create' },
  { name: 'Edit Own Objects (Any Model)', category: 'Objects - Global', id: 'objects:edit_own' },
  { name: 'Delete Own Objects (Any Model)', category: 'Objects - Global', id: 'objects:delete_own' },
  { name: 'Revert Object History (Admin)', category: 'Objects - Global', id: 'objects:revert' },

  // Administration
  { name: 'View Activity Log', category: 'Admin', id: 'admin:view_activity_log' },
  { name: 'Manage Workflows', category: 'Admin', id: 'admin:manage_workflows' },
  { name: 'Manage Validation Rules', category: 'Admin', id: 'admin:manage_validation_rules' },
  { name: 'Manage Model Groups', category: 'Admin', id: 'admin:manage_model_groups' },
  { name: 'Manage All Models & Structure', category: 'Admin', id: 'models:manage' },
  { name: 'Import/Export Models', category: 'Admin', id: 'models:import_export' },
];



async function initializeDb(): Promise<Database> {
  // Ensure the data directory exists
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (error: any) {
    console.error(`Failed to create data directory at ${dataDir}:`, error);
    throw error; // Rethrow if directory creation fails, as DB init will fail
  }

  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  // Enable WAL (Write-Ahead Logging) mode for better concurrency
  await db.exec('PRAGMA journal_mode = WAL;');
  
  // Set a busy timeout (e.g., 5 seconds)
  await db.run('PRAGMA busy_timeout = 5000;');
  
  // Enable foreign key support
  await db.exec('PRAGMA foreign_keys = ON;');

  // Model Groups Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS model_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT
    );
  `);
  const defaultGroupId = '00000000-0000-0000-0000-000000000001';
  await db.run(
    'INSERT OR IGNORE INTO model_groups (id, name, description) VALUES (?, ?, ?)',
    defaultGroupId,
    'Default',
    'Default model group for uncategorized models'
  );

  // Validation Rulesets Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS validation_rulesets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      regexPattern TEXT NOT NULL
    );
  `);

  // Workflow Tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_states (
      id TEXT PRIMARY KEY,
      workflowId TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT,
      isInitial INTEGER DEFAULT 0,
      orderIndex INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (workflowId) REFERENCES workflows(id) ON DELETE CASCADE,
      UNIQUE (workflowId, name)
    );
  `);
  
  // Models Table - Define with the final, correct schema
  await db.exec(`
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      displayPropertyNames TEXT,
      model_group_id TEXT,
      workflowId TEXT,
      FOREIGN KEY (model_group_id) REFERENCES model_groups(id) ON DELETE SET NULL,
      FOREIGN KEY (workflowId) REFERENCES workflows(id) ON DELETE SET NULL
    );
  `);
  
  // Properties Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      relatedModelId TEXT,
      required INTEGER DEFAULT 0,
      relationshipType TEXT,
      unit TEXT,
      precision INTEGER,
      autoSetOnCreate INTEGER DEFAULT 0,
      autoSetOnUpdate INTEGER DEFAULT 0,
      isUnique INTEGER DEFAULT 0,
      orderIndex INTEGER NOT NULL DEFAULT 0,
      defaultValue TEXT,
      validationRulesetId TEXT,
      minValue REAL,
      maxValue REAL,
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
      FOREIGN KEY (validationRulesetId) REFERENCES validation_rulesets(id) ON DELETE SET NULL,
      UNIQUE (model_id, name)
    );
  `);

   // RBAC Tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      isSystemRole INTEGER DEFAULT 0
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY, -- e.g., 'users:create' or 'model:edit:uuid'
      name TEXT NOT NULL, -- e.g., 'Create Users' or 'Edit MyProject Objects'
      category TEXT NOT NULL -- e.g., 'User Management' or 'Model: MyProject'
    );
  `);
  
  await db.exec(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      roleId TEXT NOT NULL,
      permissionId TEXT NOT NULL,
      PRIMARY KEY (roleId, permissionId),
      FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permissionId) REFERENCES permissions(id) ON DELETE CASCADE
    );
  `);

  // Users Table (for placeholder authentication)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT, -- Old field, will be deprecated
      roleId TEXT REFERENCES roles(id) ON DELETE SET NULL
    );
  `);
  // Migration: Add roleId to users table if it doesn't exist (older schemas)
  const usersTableInfo = await db.all("PRAGMA table_info(users);");
  if (!usersTableInfo.some(col => col.name === 'roleId')) {
    await db.exec('ALTER TABLE users ADD COLUMN roleId TEXT REFERENCES roles(id) ON DELETE SET NULL;');
  }
  if (!usersTableInfo.some(col => col.name === 'role')) { // Handle even older schemas
    await db.exec("ALTER TABLE users ADD COLUMN role TEXT;");
  }


  // --- Seed Data for RBAC ---
  const adminRoleId = '00000000-role-0000-0000-administrator';
  const userRoleId = '00000000-role-0000-0000-000user000000';

  // Seed Roles
  await db.run('INSERT OR IGNORE INTO roles (id, name, description, isSystemRole) VALUES (?, ?, ?, ?)', adminRoleId, 'Administrator', 'Has all permissions.', 1);
  await db.run('INSERT OR IGNORE INTO roles (id, name, description, isSystemRole) VALUES (?, ?, ?, ?)', userRoleId, 'User', 'Standard user with basic data interaction permissions.', 1);
  
  // Seed Static Permissions
  for (const perm of ALL_PERMISSIONS) {
    await db.run('INSERT OR IGNORE INTO permissions (id, name, category) VALUES (?, ?, ?)', perm.id, perm.name, perm.category);
  }

  // Seed Role-Permissions links
  // Admin gets all static permissions
  for (const perm of ALL_PERMISSIONS) {
    await db.run('INSERT OR IGNORE INTO role_permissions (roleId, permissionId) VALUES (?, ?)', adminRoleId, perm.id);
  }
  
  // Now, grant admin all *dynamic* model permissions that might exist
  const existingModels = await db.all('SELECT id, name FROM models');
  for (const model of existingModels) {
    const actions = ['view', 'create', 'edit', 'delete', 'edit_own', 'delete_own', 'manage'];
    for (const action of actions) {
        const permId = `model:${action}:${model.id}`;
        let permName = '';
        if (action === 'create') permName = `Create ${model.name} Objects`;
        else if (action === 'edit_own') permName = `Edit Own ${model.name} Objects`;
        else if (action === 'delete_own') permName = `Delete Own ${model.name} Objects`;
        else if (action === 'manage') permName = `Manage ${model.name} Structure`;
        else permName = `${action.charAt(0).toUpperCase() + action.slice(1)} ${model.name} Objects`;
        
        // Ensure perm exists before trying to link it
        await db.run(
            'INSERT OR IGNORE INTO permissions (id, name, category) VALUES (?, ?, ?)',
            permId,
            permName,
            `Model: ${model.name}`
        );
        await db.run('INSERT OR IGNORE INTO role_permissions (roleId, permissionId) VALUES (?, ?)', adminRoleId, permId);
    }
  }


  // User gets a subset of global permissions
  const userPermissions = [
    'objects:create', 'objects:edit_own', 'objects:delete_own'
  ];
  for (const permId of userPermissions) {
     await db.run('INSERT OR IGNORE INTO role_permissions (roleId, permissionId) VALUES (?, ?)', userRoleId, permId);
  }
  // End RBAC Seed ---


  // Update users to have the new roleId based on old role string where roleId is not set
  await db.run('UPDATE users SET roleId = ? WHERE role = ? AND roleId IS NULL', adminRoleId, 'administrator');
  await db.run('UPDATE users SET roleId = ? WHERE role = ? AND roleId IS NULL', userRoleId, 'user');
  // Ensure any user without a role gets the default user role
  await db.run('UPDATE users SET roleId = ? WHERE roleId IS NULL', userRoleId);


  // Data Objects Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS data_objects (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL,
      data TEXT NOT NULL,
      currentStateId TEXT,
      ownerId TEXT,
      isDeleted INTEGER DEFAULT 0,
      deletedAt TEXT,
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
      FOREIGN KEY (currentStateId) REFERENCES workflow_states(id) ON DELETE SET NULL,
      FOREIGN KEY (ownerId) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_state_transitions (
      id TEXT PRIMARY KEY,
      workflowId TEXT NOT NULL,
      fromStateId TEXT NOT NULL,
      toStateId TEXT NOT NULL,
      FOREIGN KEY (workflowId) REFERENCES workflows(id) ON DELETE CASCADE,
      FOREIGN KEY (fromStateId) REFERENCES workflow_states(id) ON DELETE CASCADE,
      FOREIGN KEY (toStateId) REFERENCES workflow_states(id) ON DELETE CASCADE,
      UNIQUE(workflowId, fromStateId, toStateId)
    );
  `);

  // Data Object Changelog Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS data_object_changelog (
      id TEXT PRIMARY KEY,
      dataObjectId TEXT NOT NULL,
      modelId TEXT NOT NULL,
      changedAt TEXT NOT NULL,
      changedByUserId TEXT,
      changeType TEXT NOT NULL,
      changes TEXT NOT NULL,
      FOREIGN KEY (dataObjectId) REFERENCES data_objects(id) ON DELETE CASCADE,
      FOREIGN KEY (modelId) REFERENCES models(id) ON DELETE CASCADE,
      FOREIGN KEY (changedByUserId) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // Structural Changelog Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS structural_changelog (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      userId TEXT,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      entityName TEXT,
      action TEXT NOT NULL,
      changes TEXT,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
    );
  `);
  
  // NEW Security Log Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS security_log (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      userId TEXT,
      username TEXT,
      action TEXT NOT NULL,
      targetEntityType TEXT,
      targetEntityId TEXT,
      details TEXT,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // Dashboards Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS dashboards (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      name TEXT NOT NULL,
      isDefault INTEGER DEFAULT 0,
      widgets TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  await db.exec('CREATE INDEX IF NOT EXISTS idx_dashboards_userId_isDefault ON dashboards (userId, isDefault);');


  // Ensure mock admin user exists if in DEBUG_MODE
  if (DEBUG_MODE) {
    const mockAdmin = MOCK_API_ADMIN_USER;
    const placeholderPassword = 'debugpassword';
    try {
      await db.run(
        `INSERT OR IGNORE INTO users (id, username, password, role, roleId) VALUES (?, ?, ?, ?, ?)`,
        mockAdmin.id,
        mockAdmin.username,
        placeholderPassword,
        mockAdmin.role,
        adminRoleId
      );
    } catch (error: any) {
      console.error(`DEBUG_MODE: Failed to ensure mock admin user '${mockAdmin.username}' in database:`, error.message);
    }
  }

  return db;
}

export function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = initializeDb();
  }
  return dbInstance;
}
