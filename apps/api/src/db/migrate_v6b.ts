/**
 * Migration v6b: Fix unique constraint on cards for nullable parallel_id.
 *
 * PostgreSQL UNIQUE constraints treat NULLs as distinct, so
 * (external_id, NULL, language) never conflicts. We need two partial
 * unique indexes instead of one multi-column constraint.
 */
import 'dotenv/config';
import { pool } from './client';

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Drop the v6 constraint (won't work for NULLs)
    await client.query(`
      ALTER TABLE cards
        DROP CONSTRAINT IF EXISTS cards_base_parallel_lang_unique
    `);
    console.log('Dropped cards_base_parallel_lang_unique');

    // Drop any stale unique constraint from before v6
    await client.query(`ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_external_id_unique`);
    await client.query(`ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_external_id_language_unique`);

    // Drop any existing partial indexes we're about to recreate
    await client.query(`DROP INDEX IF EXISTS cards_base_lang_uidx`);
    await client.query(`DROP INDEX IF EXISTS cards_variant_lang_uidx`);

    // Partial unique index for BASE cards (parallel_id IS NULL)
    await client.query(`
      CREATE UNIQUE INDEX cards_base_lang_uidx
        ON cards (external_id, language)
       WHERE parallel_id IS NULL
    `);
    console.log('Created cards_base_lang_uidx (partial, parallel_id IS NULL)');

    // Partial unique index for VARIANT cards (parallel_id IS NOT NULL)
    await client.query(`
      CREATE UNIQUE INDEX cards_variant_lang_uidx
        ON cards (external_id, parallel_id, language)
       WHERE parallel_id IS NOT NULL
    `);
    console.log('Created cards_variant_lang_uidx (partial, parallel_id IS NOT NULL)');

    await client.query('COMMIT');
    console.log('Migration v6b complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
