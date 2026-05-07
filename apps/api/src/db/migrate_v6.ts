/**
 * Migration v6: One Piece variant support
 * - Add parallel_id, variant_type, jp_name columns to cards
 * - Replace cards_external_id_language_unique with (external_id, parallel_id, language) unique
 */
import 'dotenv/config';
import { pool } from './client';

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Add parallel_id — identifies which parallel variant (p1, p2, jp1, etc.), NULL for base cards
    await client.query(`
      ALTER TABLE cards
        ADD COLUMN IF NOT EXISTS parallel_id VARCHAR(16)
    `);
    console.log('Added cards.parallel_id');

    // 2. Add variant_type — semantic type of the variant
    await client.query(`
      ALTER TABLE cards
        ADD COLUMN IF NOT EXISTS variant_type VARCHAR(32)
    `);
    console.log('Added cards.variant_type');

    // 3. Add jp_name — Japanese card name for JP-exclusive cards
    await client.query(`
      ALTER TABLE cards
        ADD COLUMN IF NOT EXISTS jp_name VARCHAR(256)
    `);
    console.log('Added cards.jp_name');

    // 4. Drop the old unique constraints (may be named differently across environments)
    await client.query(`
      ALTER TABLE cards
        DROP CONSTRAINT IF EXISTS cards_external_id_unique
    `);
    await client.query(`
      ALTER TABLE cards
        DROP CONSTRAINT IF EXISTS cards_external_id_language_unique
    `);
    console.log('Dropped old unique constraints on cards');

    // 5. Add new unique constraint that allows multiple parallels per base card
    await client.query(`
      ALTER TABLE cards
        ADD CONSTRAINT cards_base_parallel_lang_unique
        UNIQUE (external_id, parallel_id, language)
    `);
    console.log('Added cards_base_parallel_lang_unique constraint');

    await client.query('COMMIT');
    console.log('Migration v6 complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
