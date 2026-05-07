/**
 * Migration v5: Support One Piece TCG
 * - Drop the finish_id enum CHECK constraint so any game can use arbitrary finish types
 * - Add 'one_piece' to cards.game CHECK if it exists
 * - Add 'language' column default for card_finishes if missing
 */
import 'dotenv/config';
import { pool } from './client';

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Drop the finish_id CHECK constraint on card_finishes
    await client.query(`
      ALTER TABLE card_finishes
        DROP CONSTRAINT IF EXISTS card_finishes_finish_id_check
    `);
    console.log('Dropped card_finishes_finish_id_check constraint');

    // 2. Make image_url nullable on card_finishes (may already be done in v4, safe to repeat)
    await client.query(`
      ALTER TABLE card_finishes
        ALTER COLUMN image_url DROP NOT NULL
    `);
    console.log('Made card_finishes.image_url nullable');

    // 3. Add language column to card_finishes if not present
    await client.query(`
      ALTER TABLE card_finishes
        ADD COLUMN IF NOT EXISTS language VARCHAR(5) DEFAULT 'EN'
    `);
    console.log('Ensured card_finishes.language column exists');

    // 4. Drop the finish CHECK constraint on user_cards so One Piece variants can be saved
    await client.query(`
      ALTER TABLE user_cards
        DROP CONSTRAINT IF EXISTS user_cards_finish_check
    `);
    console.log('Dropped user_cards_finish_check constraint');

    // 5. Widen user_cards.finish to VARCHAR(50) for longer One Piece finish IDs
    await client.query(`
      ALTER TABLE user_cards
        ALTER COLUMN finish TYPE VARCHAR(50)
    `);
    console.log('Widened user_cards.finish to VARCHAR(50)');

    await client.query('COMMIT');
    console.log('Migration v5 complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
