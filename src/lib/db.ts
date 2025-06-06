
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
    console.log(`Data directory ensured at ${dataDir}`);
  } catch (error: any) {
    console.error(`Failed to create data directory at ${dataDir}:`, error);
    throw error; // Rethrow if directory creation fails, as DB init will fail
  }

  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

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

  // Validation Rulesets Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS validation_rulesets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      regexPattern TEXT NOT NULL
    );
  `);
  console.log("Validation Rulesets table ensured.");

  // Workflow Tables first due to FK dependencies from Models
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
  try {
    await db.run('ALTER TABLE workflow_states ADD COLUMN orderIndex INTEGER NOT NULL DEFAULT 0');
  } catch (e: any) {
    const msg = e.message?.toLowerCase() || "";
    if (!(msg.includes('duplicate column name') || msg.includes('already has a column named orderindex'))) {
        console.error("Migration Error (workflow_states.orderIndex):", e.message); throw e;
    }
  }
  try {
    await db.run('ALTER TABLE workflow_states ADD COLUMN color TEXT');
  } catch (e: any)
    {const msg = e.message?.toLowerCase() || "";
    if (!(msg.includes('duplicate column name') || msg.includes('already has a column named color'))) {
        console.error("Migration Error (workflow_states.color):", e.message); throw e;
    }
  }

  // Models Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      displayPropertyNames TEXT, 
      namespace TEXT NOT NULL DEFAULT 'Default', 
      workflowId TEXT, 
      FOREIGN KEY (workflowId) REFERENCES workflows(id) ON DELETE SET NULL
    );
  `);

  try {
    await db.run("ALTER TABLE models ADD COLUMN namespace TEXT NOT NULL DEFAULT 'Default'");
  } catch (e: any) {
    const msg = e.message?.toLowerCase() || "";
    if (!(msg.includes('duplicate column name') || msg.includes('already has a column named namespace'))) {
      console.error("Migration Error (models.namespace):", e.message); throw e;
    }
  }
  try {
    // workflowId column might already exist from CREATE TABLE if schema was updated
    // So, check for "duplicate column" first, then for issues with REFERENCES if it's a new add
    await db.run("ALTER TABLE models ADD COLUMN workflowId TEXT REFERENCES workflows(id) ON DELETE SET NULL");
  } catch (e: any) {
    const msg = e.message?.toLowerCase() || "";
    if (!(msg.includes('duplicate column name') || msg.includes('already has a column named workflowid'))) {
      console.error("Migration Error (models.workflowId FK):", e.message); throw e;
    }
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

  try {
    await db.run('ALTER TABLE properties ADD COLUMN orderIndex INTEGER NOT NULL DEFAULT 0');
  } catch (e: any) {
    const msg = e.message?.toLowerCase() || "";
    if (!(msg.includes('duplicate column name') || msg.includes('already has a column named orderindex'))) {
        console.error("Migration Error (properties.orderIndex):", e.message); throw e;
    }
  }
  try {
    await db.run('ALTER TABLE properties ADD COLUMN isUnique INTEGER DEFAULT 0');
  } catch (e: any) {
     const msg = e.message?.toLowerCase() || "";
     if (!(msg.includes('duplicate column name') || msg.includes('already has a column named isunique'))) {
        console.error("Migration Error (properties.isUnique):", e.message); throw e;
    }
  }
  try {
    await db.run('ALTER TABLE properties ADD COLUMN defaultValue TEXT');
  } catch (e: any) {
     const msg = e.message?.toLowerCase() || "";
     if (!(msg.includes('duplicate column name') || msg.includes('already has a column named defaultvalue'))) {
        console.error("Migration Error (properties.defaultValue):", e.message); throw e;
    }
  }
  try {
    // validationRulesetId might already exist from CREATE TABLE
    await db.run('ALTER TABLE properties ADD COLUMN validationRulesetId TEXT REFERENCES validation_rulesets(id) ON DELETE SET NULL');
  } catch (e: any) {
    const msg = e.message?.toLowerCase() || "";
    if (!(msg.includes('duplicate column name') || msg.includes('already has a column named validationrulesetid'))) {
        console.error("Migration Error (properties.validationRulesetId FK):", e.message); throw e;
    }
  }
  try {
    await db.run('ALTER TABLE properties ADD COLUMN minValue REAL');
  } catch (e: any) {
    const msg = e.message?.toLowerCase() || "";
    if (!(msg.includes('duplicate column name') || msg.includes('already has a column named minvalue'))) {
        console.error("Migration Error (properties.minValue):", e.message); throw e;
    }
  }
  try {
    await db.run('ALTER TABLE properties ADD COLUMN maxValue REAL');
  } catch (e: any) {
    const msg = e.message?.toLowerCase() || "";
    if (!(msg.includes('duplicate column name') || msg.includes('already has a column named maxvalue'))) {
        console.error("Migration Error (properties.maxValue):", e.message); throw e;
    }
  }

  // Users Table (for placeholder authentication)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL, 
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'administrator'))
    );
  `);
  console.log("Users table (for placeholder auth) ensured.");


  // Data Objects Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS data_objects (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL,
      data TEXT NOT NULL, 
      currentStateId TEXT, 
      ownerId TEXT, 
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
      FOREIGN KEY (currentStateId) REFERENCES workflow_states(id) ON DELETE SET NULL,
      FOREIGN KEY (ownerId) REFERENCES users(id) ON DELETE SET NULL
    );
  `);
   try {
    // currentStateId might exist from CREATE TABLE
    await db.run("ALTER TABLE data_objects ADD COLUMN currentStateId TEXT REFERENCES workflow_states(id) ON DELETE SET NULL");
  } catch (e: any) {
    const msg = e.message?.toLowerCase() || "";
    if (!(msg.includes('duplicate column name') || msg.includes('already has a column named currentstateid'))) {
      console.error("Migration Error (data_objects.currentStateId FK):", e.message); throw e;
    }
  }
   try {
    // ownerId might exist from CREATE TABLE
    await db.run("ALTER TABLE data_objects ADD COLUMN ownerId TEXT REFERENCES users(id) ON DELETE SET NULL");
  } catch (e: any) {
    const msg = e.message?.toLowerCase() || "";
    if (!(msg.includes('duplicate column name') || msg.includes('already has a column named ownerid'))) {
      console.error("Migration Error (data_objects.ownerId FK):", e.message); throw e;
    }
  }


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
      console.log(`DEBUG_MODE: Ensured mock admin user '${mockAdmin.username}' (ID: ${mockAdmin.id}) exists in the database.`);
    } catch (error: any) {
      // This error during debug user insertion should not stop DB initialization unless critical
      console.error(`DEBUG_MODE: Failed to ensure mock admin user '${mockAdmin.username}' in database:`, error.message);
    }
  }


  console.log(`Database initialized at ${dbPath}`);
  return db;
}

export function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = initializeDb();
  }
  return dbInstance;
}
