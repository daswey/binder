import 'dotenv/config';
import { query, queryOne } from './client';

async function seedSlabs() {
  console.log('Seeding slab data for seed_Marco_TCG...');

  // Mark SVI-199 (Charizard ex) as PSA 10
  const updated = await query(`
    UPDATE user_cards SET
      is_graded         = true,
      grading_company   = 'PSA',
      grade             = '10',
      cert_number       = '12345678',
      graded_at         = '2024-07-15',
      include_in_trades = false,
      condition         = 'NM'
    WHERE user_id = (SELECT id FROM users WHERE username = 'seed_Marco_TCG')
      AND card_id = (SELECT id FROM cards WHERE external_id = 'SVI-199' AND parallel_id IS NULL)
      AND status = 'have'
    RETURNING id
  `);
  console.log(`Marked ${updated.length} SVI-199 entry as PSA 10`);

  // Add OP01-002 (Shanks) as CGC 10
  const slab2 = await query(`
    INSERT INTO user_cards (
      id, user_id, card_id, status, quantity,
      is_graded, grading_company, grade, cert_number, graded_at,
      include_in_trades, condition, language, edition, finish
    )
    SELECT
      gen_random_uuid(),
      (SELECT id FROM users WHERE username = 'seed_Marco_TCG'),
      (SELECT id FROM cards WHERE external_id = 'OP01-002' AND parallel_id IS NULL),
      'have', 1,
      true, 'CGC', '10', '9876543', '2024-03-22',
      false, 'NM', 'EN', 'unlimited', 'secret_rare'
    WHERE (SELECT id FROM cards WHERE external_id = 'OP01-002' AND parallel_id IS NULL) IS NOT NULL
    ON CONFLICT DO NOTHING
    RETURNING id
  `);
  console.log(`Added ${slab2.length} OP01-002 CGC 10 slab`);

  // Seed graded eBay prices for SVI-199
  await query(`
    INSERT INTO card_ebay_graded_prices (
      card_id, psa_10_median, psa_10_samples, psa_9_median, psa_9_samples,
      psa_8_median, psa_8_samples, cgc_10_median, cgc_10_samples, cgc_9_median, cgc_9_samples
    )
    SELECT id, 28500, 14, 18000, 8, 12000, 3, 31000, 6, 19500, 4
    FROM cards WHERE external_id = 'SVI-199' AND parallel_id IS NULL
    ON CONFLICT (card_id) DO UPDATE SET
      psa_10_median = EXCLUDED.psa_10_median,
      psa_10_samples = EXCLUDED.psa_10_samples,
      psa_9_median = EXCLUDED.psa_9_median,
      psa_9_samples = EXCLUDED.psa_9_samples,
      psa_8_median = EXCLUDED.psa_8_median,
      cgc_10_median = EXCLUDED.cgc_10_median,
      cgc_10_samples = EXCLUDED.cgc_10_samples,
      updated_at = NOW()
  `);
  console.log('Seeded graded prices for SVI-199');

  // Seed graded eBay prices for OP01-002
  await query(`
    INSERT INTO card_ebay_graded_prices (
      card_id, psa_10_median, psa_10_samples, cgc_10_median, cgc_10_samples
    )
    SELECT id, 220000, 3, 245000, 2
    FROM cards WHERE external_id = 'OP01-002' AND parallel_id IS NULL
    ON CONFLICT (card_id) DO UPDATE SET
      psa_10_median = EXCLUDED.psa_10_median,
      cgc_10_median = EXCLUDED.cgc_10_median,
      updated_at = NOW()
  `);
  console.log('Seeded graded prices for OP01-002');

  // Seed PSA population for SVI-199
  await query(`
    INSERT INTO grading_population (
      card_id, grading_company,
      pop_10, pop_9, pop_8, pop_7, pop_below_7, total_graded, gem_rate_pct,
      source_url
    )
    SELECT id, 'PSA', 1204, 2891, 1540, 820, 1102, 7557,
      ROUND((1204.0 / 7557.0 * 100)::numeric, 1),
      'https://www.psacard.com/pop'
    FROM cards WHERE external_id = 'SVI-199' AND parallel_id IS NULL
    ON CONFLICT (card_id, grading_company) DO UPDATE SET
      pop_10 = EXCLUDED.pop_10,
      total_graded = EXCLUDED.total_graded,
      gem_rate_pct = EXCLUDED.gem_rate_pct,
      fetched_at = NOW()
  `);
  console.log('Seeded PSA population for SVI-199');

  console.log('Slab seeding complete.');
  process.exit(0);
}

seedSlabs().catch(err => { console.error(err); process.exit(1); });
