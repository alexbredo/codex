import { getDb } from '@/lib/db';

async function migrate() {
  const db = await getDb();

  // Add a temporary column to store the old model_group_id
  await db.exec('ALTER TABLE models ADD COLUMN temp_model_group_id TEXT');

  // Update the temporary column with the model_group_id based on the namespace
  await db.exec(`
    UPDATE models
    SET temp_model_group_id = (SELECT id FROM model_groups WHERE name = models.namespace)
    WHERE namespace IS NOT NULL;
  `);

  // Drop the old namespace column
  await db.exec('ALTER TABLE models DROP COLUMN namespace');

  // Rename the temporary column to model_group_id
  await db.exec('ALTER TABLE models RENAME COLUMN temp_model_group_id TO model_group_id');


  console.log('Migration complete!');
}

migrate().catch(err => console.error("Migration error:", err));
