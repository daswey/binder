import 'dotenv/config';
import { query } from './client';

async function migrate() {
  console.log('Running migration v10: push_subscriptions table...');

  await query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint    TEXT NOT NULL,
      p256dh      TEXT NOT NULL,
      auth        TEXT NOT NULL,
      user_agent  TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, endpoint)
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS push_subs_user_idx ON push_subscriptions (user_id)`);

  console.log('Migration v10 complete.');
  process.exit(0);
}

migrate().catch(err => { console.error(err); process.exit(1); });
