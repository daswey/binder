import 'dotenv/config';
import { query } from './client';

export async function migrate_v9() {
  console.log('Running migration v9: graded cards / slab tracking...');

  await query(`
    ALTER TABLE user_cards ADD COLUMN IF NOT EXISTS is_graded         BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE user_cards ADD COLUMN IF NOT EXISTS grading_company   VARCHAR(16);
    ALTER TABLE user_cards ADD COLUMN IF NOT EXISTS grade             VARCHAR(16);
    ALTER TABLE user_cards ADD COLUMN IF NOT EXISTS cert_number       VARCHAR(32);
    ALTER TABLE user_cards ADD COLUMN IF NOT EXISTS graded_at         DATE;
    ALTER TABLE user_cards ADD COLUMN IF NOT EXISTS include_in_trades BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE user_cards ADD COLUMN IF NOT EXISTS slab_image_url    VARCHAR(512);
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS grading_population (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      card_id          UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      grading_company  VARCHAR(16) NOT NULL,
      pop_10           INT,
      pop_9            INT,
      pop_8            INT,
      pop_7            INT,
      pop_below_7      INT,
      total_graded     INT,
      gem_rate_pct     FLOAT,
      source_url       VARCHAR(512),
      fetched_at       TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (card_id, grading_company)
    );
    CREATE INDEX IF NOT EXISTS grading_pop_card ON grading_population(card_id);
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS card_ebay_graded_prices (
      card_id          UUID PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
      psa_10_median    INT,
      psa_10_samples   INT,
      psa_9_median     INT,
      psa_9_samples    INT,
      psa_8_median     INT,
      psa_8_samples    INT,
      cgc_10_median    INT,
      cgc_10_samples   INT,
      cgc_9_median     INT,
      cgc_9_samples    INT,
      bgs_10_median    INT,
      bgs_10_samples   INT,
      bgs_9_median     INT,
      bgs_9_samples    INT,
      updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  console.log('Migration v9 complete.');
  process.exit(0);
}

migrate_v9().catch(err => { console.error(err); process.exit(1); });
