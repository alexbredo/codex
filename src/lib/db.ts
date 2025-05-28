
import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import path from 'path';
import fs from 'fs/promises'; // Use fs.promises for async file operations

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

  // Models Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      displayPropertyNames TEXT, -- Stores JSON string array: '["prop1", "prop2"]'
      namespace TEXT NOT NULL DEFAULT 'Default', -- Refers to model_groups.name, or 'Default'
      workflowId TEXT, -- FK to workflows table
      FOREIGN KEY (workflowId) REFERENCES workflows(id) ON DELETE SET NULL
    );
  `);

  try {
    await db.run("ALTER TABLE models ADD COLUMN namespace TEXT NOT NULL DEFAULT 'Default'");
  } catch (e: any) {
    if (!(e.message && (e.message.toLowerCase().includes('duplicate column name') || e.message.toLowerCase().includes('already has a column named namespace')))) {
      console.error("Migration: Error trying to add 'namespace' column to 'models' table (this might be an issue if it doesn't exist):", e.message);
    }
  }
  try {
    await db.run("ALTER TABLE models ADD COLUMN workflowId TEXT REFERENCES workflows(id) ON DELETE SET NULL");
  } catch (e: any) {
    if (!(e.message && (e.message.toLowerCase().includes('duplicate column name') || e.message.toLowerCase().includes('already has a column named workflowid')))) {
      console.error("Migration: Error trying to add 'workflowId' column to 'models' table (this might be an issue if it doesn't exist):", e.message);
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
      required INTEGER DEFAULT 0, -- 0 for false, 1 for true
      relationshipType TEXT, -- 'one' or 'many'
      unit TEXT,
      precision INTEGER,
      autoSetOnCreate INTEGER DEFAULT 0,
      autoSetOnUpdate INTEGER DEFAULT 0,
      isUnique INTEGER DEFAULT 0, -- 0 for false, 1 for true (only for string type)
      orderIndex INTEGER NOT NULL DEFAULT 0, -- For property display order
      defaultValue TEXT, -- Store default value as string
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
      UNIQUE (model_id, name)
    );
  `);

  try {
    await db.run('ALTER TABLE properties ADD COLUMN orderIndex INTEGER NOT NULL DEFAULT 0');
  } catch (e: any) {
    if (!(e.message && (e.message.toLowerCase().includes('duplicate column name') || e.message.toLowerCase().includes('already has a column named orderindex')))) {
        console.error("Migration: Error trying to add 'orderIndex' column to 'properties' table (this might be an issue if it doesn't exist):", e.message);
    }
  }
  
  try {
    await db.run('ALTER TABLE properties ADD COLUMN isUnique INTEGER DEFAULT 0');
  } catch (e: any) {
     if (!(e.message && (e.message.toLowerCase().includes('duplicate column name') || e.message.toLowerCase().includes('already has a column named isunique')))) {
        console.error("Migration: Error trying to add 'isUnique' column to 'properties' table (this might be an issue if it doesn't exist):", e.message);
    }
  }

  try {
    await db.run('ALTER TABLE properties ADD COLUMN defaultValue TEXT');
  } catch (e: any) {
     if (!(e.message && (e.message.toLowerCase().includes('duplicate column name') || e.message.toLowerCase().includes('already has a column named defaultvalue')))) {
        console.error("Migration: Error trying to add 'defaultValue' column to 'properties' table (this might be an issue if it doesn't exist):", e.message);
    }
  }


  // Data Objects Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS data_objects (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL,
      data TEXT NOT NULL, -- Stores the object's key-value pairs as a JSON string
      currentStateId TEXT, -- FK to workflow_states table
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
      FOREIGN KEY (currentStateId) REFERENCES workflow_states(id) ON DELETE SET NULL
    );
  `);
   try {
    await db.run("ALTER TABLE data_objects ADD COLUMN currentStateId TEXT REFERENCES workflow_states(id) ON DELETE SET NULL");
  } catch (e: any) {
    if (!(e.message && (e.message.toLowerCase().includes('duplicate column name') || e.message.toLowerCase().includes('already has a column named currentstateid')))) {
      console.error("Migration: Error trying to add 'currentStateId' column to 'data_objects' table:", e.message);
    }
  }


  // Users Table (for placeholder authentication)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL, -- WARNING: Storing plaintext passwords. Highly insecure. For demo only.
      role TEXT NOT NULL DEFAULT 'user' -- 'user' or 'administrator'
    );
  `);
  console.log("Users table (for placeholder auth) ensured.");

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
      isInitial INTEGER DEFAULT 0, -- 0 for false, 1 for true
      FOREIGN KEY (workflowId) REFERENCES workflows(id) ON DELETE CASCADE,
      UNIQUE (workflowId, name)
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_state_transitions (
      id TEXT PRIMARY KEY,
      workflowId TEXT NOT NULL, -- For easier cascading deletes and querying
      fromStateId TEXT NOT NULL,
      toStateId TEXT NOT NULL,
      FOREIGN KEY (workflowId) REFERENCES workflows(id) ON DELETE CASCADE,
      FOREIGN KEY (fromStateId) REFERENCES workflow_states(id) ON DELETE CASCADE,
      FOREIGN KEY (toStateId) REFERENCES workflow_states(id) ON DELETE CASCADE,
      UNIQUE(workflowId, fromStateId, toStateId)
    );
  `);


  console.log(`Database initialized at ${dbPath}`);
  return db;
}

export function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = initializeDb();
  }
  return dbInstance;
}
