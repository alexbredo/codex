
import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import path from 'path';

// Determine the database path. Use an in-memory DB for simplicity in some environments,
// or a file-based DB. For file-based, ensure the directory exists.
// Using './database.sqlite' places it in the project root.
const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : './database.sqlite';

let dbInstance: Promise<Database> | null = null;

async function initializeDb(): Promise<Database> {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  // Enable foreign key support
  await db.exec('PRAGMA foreign_keys = ON;');

  // Models Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      displayPropertyNames TEXT 
    );
  `);
  // displayPropertyNames will store JSON string array: '["prop1", "prop2"]'

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
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
      UNIQUE (model_id, name) 
    );
  `);

  // Data Objects Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS data_objects (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL,
      data TEXT NOT NULL, -- Stores the object's key-value pairs as a JSON string
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
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
