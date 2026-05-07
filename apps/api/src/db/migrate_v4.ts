import 'dotenv/config';
import { pool } from './client';

const schema = `
-- ── cards table: add TCGdex fields ──────────────────────────────────────────
ALTER TABLE cards ADD COLUMN IF NOT EXISTS language      VARCHAR(5)   NOT NULL DEFAULT 'EN';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS tcgdex_id     VARCHAR(64);
ALTER TABLE cards ADD COLUMN IF NOT EXISTS tcgdex_set_id VARCHAR(32);
ALTER TABLE cards ADD COLUMN IF NOT EXISTS local_id      VARCHAR(16);
ALTER TABLE cards ADD COLUMN IF NOT EXISTS illustrator   VARCHAR(128);
ALTER TABLE cards ADD COLUMN IF NOT EXISTS category      VARCHAR(16);
ALTER TABLE cards ADD COLUMN IF NOT EXISTS hp            INT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS regulation_mark VARCHAR(4);
ALTER TABLE cards ADD COLUMN IF NOT EXISTS legal_standard  BOOLEAN DEFAULT false;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS legal_expanded  BOOLEAN DEFAULT false;

-- Drop the single-column unique constraint so we can replace it with (external_id, language)
ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_external_id_key;
ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_external_id_language_unique;
ALTER TABLE cards ADD CONSTRAINT cards_external_id_language_unique UNIQUE (external_id, language);

-- ── card_finishes: add language + expand finish_id enum ──────────────────────
ALTER TABLE card_finishes ADD COLUMN IF NOT EXISTS language VARCHAR(5) NOT NULL DEFAULT 'EN';

ALTER TABLE card_finishes DROP CONSTRAINT IF EXISTS card_finishes_finish_id_check;
ALTER TABLE card_finishes ADD CONSTRAINT card_finishes_finish_id_check
  CHECK (finish_id IN (
    'standard','holo','reverse_holo','full_art','secret_rare','alt_art_holo',
    'first_edition','promo'
  ));

-- Expand user_cards.finish CHECK to match
ALTER TABLE user_cards DROP CONSTRAINT IF EXISTS user_cards_finish_check;
ALTER TABLE user_cards ADD CONSTRAINT user_cards_finish_check
  CHECK (finish IN (
    'standard','holo','reverse_holo','full_art','secret_rare','alt_art_holo',
    'first_edition','promo'
  ));

-- ── card_sets: cache set metadata per language ──────────────────────────────
CREATE TABLE IF NOT EXISTS card_sets (
  id           VARCHAR(32)  NOT NULL,
  name         VARCHAR(128) NOT NULL,
  series       VARCHAR(128),
  language     VARCHAR(5)   NOT NULL,
  card_count   INT,
  release_date DATE,
  logo_url     VARCHAR(512),
  symbol_url   VARCHAR(512),
  synced_at    TIMESTAMP,
  PRIMARY KEY (id, language)
);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(schema);
    console.log('v4 migration complete');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(e => { console.error(e); process.exit(1); });
