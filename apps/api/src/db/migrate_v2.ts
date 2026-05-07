import 'dotenv/config';
import { pool } from './client';

const schema = `
-- Card attributes on binder entries
ALTER TABLE user_cards
  ADD COLUMN IF NOT EXISTS condition VARCHAR(10) NOT NULL DEFAULT 'NM'
    CHECK (condition IN ('M','NM','LP','MP','HP','DMG')),
  ADD COLUMN IF NOT EXISTS language VARCHAR(20) NOT NULL DEFAULT 'English',
  ADD COLUMN IF NOT EXISTS edition VARCHAR(20) NOT NULL DEFAULT '1st'
    CHECK (edition IN ('1st','unlimited','promo','other')),
  ADD COLUMN IF NOT EXISTS finish VARCHAR(20) NOT NULL DEFAULT 'normal'
    CHECK (finish IN ('normal','holo','reverse_holo','full_art','alt_art','secret'));

-- Feed events
CREATE TABLE IF NOT EXISTS feed_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type VARCHAR(30) NOT NULL
    CHECK (event_type IN ('new_match','trade_completed','new_event_nearby','new_match_area')),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}',
  geohash VARCHAR(10),
  cursor_ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feed_events_target_cursor_idx
  ON feed_events(target_user_id, cursor_ts DESC);
CREATE INDEX IF NOT EXISTS feed_events_geohash_idx
  ON feed_events(geohash) WHERE geohash IS NOT NULL;

-- Drop old unique constraint on user_cards so the new unique includes attributes
ALTER TABLE user_cards DROP CONSTRAINT IF EXISTS user_cards_user_id_card_id_status_key;
CREATE UNIQUE INDEX IF NOT EXISTS user_cards_unique_entry
  ON user_cards(user_id, card_id, status, language, finish);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(schema);
    console.log('Migration v2 complete');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
