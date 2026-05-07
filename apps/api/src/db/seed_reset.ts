import 'dotenv/config';
import { pool } from './client';

async function reset() {
  const client = await pool.connect();
  try {
    // Delete all seed users and cascade
    await client.query(`DELETE FROM users WHERE username LIKE 'seed\_%'`);
    // Delete orphaned activity events and cards
    await client.query(`DELETE FROM activity_events WHERE actor_id IS NULL OR actor_id NOT IN (SELECT id FROM users)`);
    await client.query(`DELETE FROM cards WHERE is_seed = TRUE`);
    console.log('Seed data reset complete');
  } finally {
    client.release();
    await pool.end();
  }
}

reset().catch(e => { console.error(e); process.exit(1); });
