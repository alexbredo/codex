
import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import path from 'path';
import fs from 'fs/promises'; // Use fs.promises for async file operations
import { DEBUG_MODE, MOCK_API_ADMIN_USER } from '@/lib/auth'; // Import debug constants

// Determine the database path.
// It will be created in a 'data' subdirectory of the application root.
// In Docker, process.cwd() will be /app, so it becomes /app/data/database.sqlite
const dataDir = path.join(process.cwd(), 'data');
const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'database.sqlite');


let dbInstance: Promise<Database> | null = null;


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
  
  // Fast, one-time check to add model_group_id if it's missing from an old schema
  const modelsTableInfo = await db.all("PRAGMA table_info('models')");
  const hasModelGroupId = modelsTableInfo.some(col => col.name === 'model_group_id');
  if (!hasModelGroupId) {
    // This is safe to run. It's fast and will only execute on databases with the old schema.
    await db.exec('ALTER TABLE models ADD COLUMN model_group_id TEXT');
  }

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

  // Users Table (for placeholder authentication)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'administrator'))
    );
  `);

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
        `INSERT OR IGNORE INTO users (id, username, password, role) VALUES (?, ?, ?, ?)`,
        mockAdmin.id,
        mockAdmin.username,
        placeholderPassword,
        mockAdmin.role
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
