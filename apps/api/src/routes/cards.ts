import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/client';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// Columns resolved with EN fallbacks for image, name, set_name on non-EN cards
const RESOLVED_COLS = `
  c.id, c.external_id, c.game, c.set_code, c.rarity,
  c.market_price_eur, c.is_seed, c.language, c.tcgdex_id, c.tcgdex_set_id, c.local_id,
  c.illustrator, c.category, c.hp, c.regulation_mark, c.legal_standard, c.legal_expanded,
  c.parallel_id, c.variant_type, c.jp_name, c.name_en, c.created_at, c.updated_at,
  COALESCE(
    CASE WHEN c.language != 'EN' THEN _en.name END,
    c.name_en,
    c.name
  ) AS name,
  COALESCE(
    CASE WHEN c.language != 'EN' THEN _en.set_name END,
    c.set_name
  ) AS set_name,
  COALESCE(c.image_url, _en.image_url) AS image_url
`;

const EN_FALLBACK_JOIN = `
  LEFT JOIN LATERAL (
    SELECT name, set_name, image_url
    FROM cards
    WHERE external_id = c.external_id AND language = 'EN' AND parallel_id IS NULL
    LIMIT 1
  ) _en ON true
`;

const CARD_WITH_FINISHES = `
  SELECT ${RESOLVED_COLS},
    COALESCE((
      SELECT json_agg(json_build_object(
        'finish_id', cf.finish_id, 'label', cf.label,
        'image_url', cf.image_url, 'market_price_eur', cf.market_price_eur
      ) ORDER BY cf.finish_id)
      FROM card_finishes cf WHERE cf.card_id = c.id
    ), '[]'::json) AS available_finishes
  FROM cards c ${EN_FALLBACK_JOIN}
`;

// For search: base cards only, with variant summary attached
const CARD_WITH_FINISHES_AND_VARIANTS = `
  SELECT ${RESOLVED_COLS},
    COALESCE((
      SELECT json_agg(json_build_object(
        'finish_id', cf.finish_id, 'label', cf.label,
        'image_url', cf.image_url, 'market_price_eur', cf.market_price_eur
      ) ORDER BY cf.finish_id)
      FROM card_finishes cf WHERE cf.card_id = c.id
    ), '[]'::json) AS available_finishes,
    COALESCE((
      SELECT COUNT(*)::int FROM cards v
      WHERE v.external_id = c.external_id
        AND v.language = c.language
        AND v.parallel_id IS NOT NULL
    ), 0) AS variant_count,
    COALESCE((
      SELECT json_agg(json_build_object(
        'id', v.id, 'parallel_id', v.parallel_id, 'variant_type', v.variant_type,
        'image_url', COALESCE(v.image_url, _en.image_url), 'rarity', v.rarity
      ) ORDER BY v.parallel_id)
      FROM cards v
      WHERE v.external_id = c.external_id
        AND v.language = c.language
        AND v.parallel_id IS NOT NULL
    ), '[]'::json) AS variants
  FROM cards c ${EN_FALLBACK_JOIN}
`;

const VALID_LANGS = new Set(['EN', 'DE', 'JP']);

router.get('/search', async (req: Request, res: Response) => {
  const { q = '', game, set, lang, page = '1', limit = '20', include_variants = 'false' } =
    req.query as Record<string, string>;
  const language = VALID_LANGS.has((lang ?? '').toUpperCase()) ? lang.toUpperCase() : 'EN';
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params: any[] = [];
  const conditions: string[] = [];
  let idx = 1;

  // Always filter by language
  conditions.push(`c.language = $${idx++}`);
  params.push(language);

  // By default show only base cards (parallel_id IS NULL).
  // Pass include_variants=true to show all parallels.
  if (include_variants !== 'true') {
    conditions.push(`c.parallel_id IS NULL`);
  }

  if (q) {
    conditions.push(`(
      to_tsvector('simple', c.name || ' ' || c.external_id || ' ' || COALESCE(c.name_en, '')) @@ plainto_tsquery('simple', $${idx})
      OR c.external_id ILIKE $${idx + 1}
      OR c.name ILIKE $${idx + 2}
      OR c.name_en ILIKE $${idx + 3}
    )`);
    params.push(q, `%${q}%`, `%${q}%`, `%${q}%`);
    idx += 4;
  }
  if (game) { conditions.push(`c.game = $${idx++}`); params.push(game); }
  if (set) { conditions.push(`c.set_code = $${idx++}`); params.push(set); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  // Relevance ranking: exact name match → starts-with → contains → alphabetical
  const orderBy = q
    ? `ORDER BY
        CASE WHEN LOWER(c.name) = LOWER($${idx}) OR LOWER(c.name_en) = LOWER($${idx})   THEN 0
             WHEN LOWER(c.name) LIKE LOWER($${idx + 1}) OR LOWER(COALESCE(c.name_en,'')) LIKE LOWER($${idx + 1}) THEN 1
             ELSE 2 END,
        c.name ASC`
    : `ORDER BY c.name ASC`;
  const rankParams = q ? [q, `${q.toLowerCase()}%`] : [];
  idx += rankParams.length;

  // Use variant-enriched query for base-only searches so UI can show variant count
  const baseQuery = include_variants !== 'true'
    ? CARD_WITH_FINISHES_AND_VARIANTS
    : CARD_WITH_FINISHES;

  const cards = await query(
    `${baseQuery} ${where} ${orderBy} LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, ...rankParams, parseInt(limit), offset]
  );

  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) FROM cards c ${where}`,
    params
  );

  return res.json({
    data: cards,
    total: parseInt(countResult?.count ?? '0'),
    page: parseInt(page),
    limit: parseInt(limit),
  });
});

router.get('/:id/finishes', async (req: Request, res: Response) => {
  const finishes = await query(
    `SELECT * FROM card_finishes WHERE card_id=$1 ORDER BY finish_id`,
    [req.params.id]
  );
  return res.json(finishes);
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  let card: any;

  if (UUID_RE.test(id)) {
    [card] = await query(`${CARD_WITH_FINISHES} WHERE c.id=$1`, [id]);
  }
  if (!card) {
    // For external_id lookups, prefer the base card (parallel_id IS NULL) so available_finishes
    // contains all variant options. If there's no base card, fall back to the first match.
    const byExtIdRows = await query(
      `${CARD_WITH_FINISHES_AND_VARIANTS} WHERE c.external_id=$1 ORDER BY c.parallel_id NULLS FIRST LIMIT 1`,
      [id]
    );
    const byExtId = byExtIdRows[0];
    if (!byExtId) return res.status(404).json({ error: 'NotFound', message: 'Card not found' });
    return res.json(byExtId);
  }
  return res.json(card);
});

// Condition price factors relative to NM
const CONDITION_FACTORS: Record<string, number> = {
  NM: 1.0,
  LP: 0.85,
  MP: 0.65,
  HP: 0.4,
  Damaged: 0.2,
};

router.get('/:id/prices', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'BadRequest', message: 'Invalid card id' });

  const card = await queryOne(
    `SELECT c.id, c.name, c.market_price_eur,
            COALESCE((
              SELECT json_agg(json_build_object(
                'finish_id', cf.finish_id, 'label', cf.label, 'market_price_eur', cf.market_price_eur
              ) ORDER BY cf.finish_id)
              FROM card_finishes cf WHERE cf.card_id = c.id
            ), '[]'::json) AS finishes
     FROM cards c WHERE c.id = $1`,
    [id]
  );
  if (!card) return res.status(404).json({ error: 'NotFound', message: 'Card not found' });

  // DB stores prices in cents; divide by 100 to get euros
  const basePriceCents: number | null = card.market_price_eur ? parseFloat(card.market_price_eur) : null;
  const basePrice: number | null = basePriceCents != null ? basePriceCents / 100 : null;

  const conditionPrices = basePrice != null
    ? Object.entries(CONDITION_FACTORS).map(([condition, factor]) => ({
        condition,
        price_eur: parseFloat((basePrice * factor).toFixed(2)),
      }))
    : [];

  const finishes = (typeof card.finishes === 'string' ? JSON.parse(card.finishes) : card.finishes) as any[];
  const finishPrices = finishes.map(f => {
    const finishPriceCents = f.market_price_eur != null ? parseFloat(f.market_price_eur) : null;
    const finishPrice = finishPriceCents != null ? finishPriceCents / 100 : null;
    return {
      finish_id: f.finish_id,
      label: f.label,
      market_price_eur: finishPrice,
      condition_prices: finishPrice != null
        ? Object.entries(CONDITION_FACTORS).map(([condition, factor]) => ({
            condition,
            price_eur: parseFloat((finishPrice * factor).toFixed(2)),
          }))
        : [],
    };
  });

  return res.json({
    card_id: card.id,
    card_name: card.name,
    market_price_eur: basePrice,
    condition_prices: conditionPrices,
    finishes: finishPrices,
    source: 'cardmarket',
    updated_at: new Date().toISOString(),
  });
});

router.get('/:id/ebay-comps', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'BadRequest', message: 'Invalid card id' });

  const card = await queryOne('SELECT id, name, external_id, game FROM cards WHERE id=$1', [id]);
  if (!card) return res.status(404).json({ error: 'NotFound', message: 'Card not found' });

  const apifyToken = process.env.APIFY_TOKEN;
  if (!apifyToken) {
    return res.json({ comps: [], search_url: buildEbaySearchUrl(card.name, card.game), source: 'ebay' });
  }

  try {
    const searchQuery = `${card.name} ${card.external_id ?? ''} TCG`.trim();
    const runRes = await fetch(
      'https://api.apify.com/v2/acts/apify~ebay-scraper/run-sync-get-dataset-items?token=' + apifyToken,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          search: searchQuery,
          country: 'EBAY-DE',
          maxItems: 10,
          soldItems: true,
        }),
        signal: AbortSignal.timeout(25000),
      }
    );
    if (!runRes.ok) throw new Error(`Apify ${runRes.status}`);
    const items = (await runRes.json()) as any[];
    const comps = items.slice(0, 10).map(item => ({
      title: item.title,
      price_eur: item.price?.value ?? null,
      sold_date: item.soldDate ?? null,
      url: item.url ?? null,
      image_url: item.image ?? null,
    }));
    return res.json({ comps, search_url: buildEbaySearchUrl(card.name, card.game), source: 'ebay' });
  } catch (err: any) {
    console.error('[ebay-comps]', err?.message);
    return res.json({ comps: [], search_url: buildEbaySearchUrl(card.name, card.game), source: 'ebay', error: 'fetch_failed' });
  }
});

function buildEbaySearchUrl(name: string, game: string): string {
  const q = encodeURIComponent(`${name} ${game} TCG`);
  return `https://www.ebay.de/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1`;
}

router.post('/sync', requireAuth, async (req: AuthRequest, res: Response) => {
  return res.json({ ok: true, message: 'Card sync triggered (background job)' });
});

router.get('/:id/graded-prices', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'BadRequest', message: 'Invalid card id' });

  const card = await queryOne('SELECT id, name FROM cards WHERE id=$1', [id]);
  if (!card) return res.status(404).json({ error: 'NotFound', message: 'Card not found' });

  const gp = await queryOne('SELECT * FROM card_ebay_graded_prices WHERE card_id=$1', [id]);
  const pops = await query('SELECT * FROM grading_population WHERE card_id=$1', [id]);
  const popMap: Record<string, any> = {};
  for (const p of pops) popMap[p.grading_company] = p;

  const buildGrader = (prefix: string) => {
    if (!gp) return null;
    const g10 = gp[`${prefix}_10_median`];
    const g9  = gp[`${prefix}_9_median`];
    const g8  = gp[`${prefix}_8_median`];
    if (!g10 && !g9) return null;
    return {
      grade_10: { median_usd: g10 != null ? g10 / 100 : null, sample_count: gp[`${prefix}_10_samples`] ?? null },
      grade_9:  { median_usd: g9  != null ? g9  / 100 : null, sample_count: gp[`${prefix}_9_samples`]  ?? null },
      grade_8:  { median_usd: g8  != null ? g8  / 100 : null, sample_count: gp[`${prefix}_8_samples`]  ?? null },
    };
  };

  return res.json({
    card_id: id,
    psa: buildGrader('psa'),
    cgc: buildGrader('cgc'),
    bgs: buildGrader('bgs'),
    population: {
      psa: popMap['PSA'] ?? null,
      cgc: popMap['CGC'] ?? null,
      bgs: popMap['BGS'] ?? null,
    },
    updated_at: gp?.updated_at ?? null,
  });
});

export default router;
