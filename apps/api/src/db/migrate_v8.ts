import 'dotenv/config';
import { query } from './client';

async function migrate() {
  console.log('Running migration v8: GDPR + Binder Pro schema…');

  await query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS agreed_to_terms_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS is_pro BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS pro_since TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS pro_expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(64),
      ADD COLUMN IF NOT EXISTS price_alert_count INT NOT NULL DEFAULT 0;
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users (deleted_at)
    WHERE deleted_at IS NOT NULL;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS price_alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      finish_id VARCHAR(64),
      target_price_eur NUMERIC(10,2) NOT NULL,
      last_price_eur NUMERIC(10,2),
      triggered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, card_id, finish_id)
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_price_alerts_user ON price_alerts (user_id);
  `);

  console.log('Migration v8 complete.');
  process.exit(0);
}

migrate().catch(err => { console.error(err); process.exit(1); });
