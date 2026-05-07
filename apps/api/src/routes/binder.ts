import { Router, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { computeMatchesForUser } from '../services/matchEngine';

const router = Router();
router.use(requireAuth);

const CARD_WITH_FINISHES = `
  SELECT uc.id, uc.user_id, uc.card_id, uc.status, uc.quantity,
         uc.condition, uc.language, uc.edition, uc.finish, uc.notes, uc.created_at,
         uc.is_graded, uc.grading_company, uc.grade, uc.cert_number,
         uc.graded_at, uc.include_in_trades, uc.slab_image_url,
         json_build_object(
           'id', c.id, 'external_id', c.external_id,
           'name', COALESCE(CASE WHEN c.language != 'EN' THEN _en.name END, c.name_en, c.name),
           'game', c.game,
           'set_name', COALESCE(CASE WHEN c.language != 'EN' THEN _en.set_name END, c.set_name),
           'set_code', c.set_code,
           'rarity', c.rarity,
           'image_url', COALESCE(c.image_url, _en.image_url),
           'market_price_eur', c.market_price_eur,
           'is_seed', c.is_seed,
           'available_finishes', COALESCE((
             SELECT json_agg(json_build_object('finish_id', cf.finish_id, 'label', cf.label,
                             'image_url', cf.image_url, 'market_price_eur', cf.market_price_eur))
             FROM card_finishes cf WHERE cf.card_id = c.id
           ), '[]'::json)
         ) AS card
  FROM user_cards uc
  JOIN cards c ON c.id = uc.card_id
  LEFT JOIN LATERAL (
    SELECT name, set_name, image_url
    FROM cards
    WHERE external_id = c.external_id AND language = 'EN' AND parallel_id IS NULL
    LIMIT 1
  ) _en ON true
`;

router.get('/', async (req: AuthRequest, res: Response) => {
  const entries = await query(
    `${CARD_WITH_FINISHES} WHERE uc.user_id = $1 ORDER BY uc.created_at DESC`,
    [req.userId]
  );
  return res.json(entries);
});

// GET /api/binder/slabs — graded entries only with graded price data
router.get('/slabs', async (req: AuthRequest, res: Response) => {
  const slabs = await query(
    `${CARD_WITH_FINISHES}
     LEFT JOIN card_ebay_graded_prices gp ON gp.card_id = c.id
     WHERE uc.user_id = $1 AND uc.is_graded = true
     ORDER BY uc.created_at DESC`,
    [req.userId]
  );

  // Compute total value: use grade-matched eBay median in USD
  let totalValueUsd = 0;
  for (const slab of slabs) {
    const gp = slab.graded_prices;
    const company = slab.grading_company?.toLowerCase();
    const grade = slab.grade;
    if (gp && company && grade) {
      const key = `${company}_${grade.replace(/\s+.*/,'')}_median`;
      const val = gp[key];
      if (val) totalValueUsd += val / 100;
    }
    // Fallback to raw market price in EUR approximated as USD
    if (totalValueUsd === 0 && slab.card?.market_price_eur) {
      totalValueUsd += slab.card.market_price_eur / 100 * 1.08;
    }
  }

  // Fetch graded prices joined separately
  const slabsWithPrices = await Promise.all(
    slabs.map(async (slab: any) => {
      const gp = await queryOne(
        `SELECT * FROM card_ebay_graded_prices WHERE card_id = $1`,
        [slab.card_id]
      );
      return { ...slab, graded_prices: gp ?? null };
    })
  );

  // Recompute total value with actual graded prices
  let totalUsd = 0;
  for (const slab of slabsWithPrices) {
    const gp = slab.graded_prices;
    const company = (slab.grading_company ?? '').toLowerCase();
    const gradeNum = (slab.grade ?? '').replace(/\s+.*/,'');
    if (gp && company && gradeNum) {
      const val = gp[`${company}_${gradeNum}_median`];
      if (val) { totalUsd += val / 100; continue; }
    }
    if (slab.card?.market_price_eur) totalUsd += slab.card.market_price_eur / 100 * 1.08;
  }

  return res.json({
    slabs: slabsWithPrices,
    total_value_usd: parseFloat(totalUsd.toFixed(2)),
    total_value_eur: parseFloat((totalUsd / 1.08).toFixed(2)),
  });
});

const conditionEnum = z.enum(['NM','LP','MP','HP','Damaged']).nullable().optional();
const languageEnum = z.enum(['EN','JP','DE','FR','ES','IT','PT','KO','ZH']).nullable().optional();
const editionEnum = z.enum(['1st_ed','unlimited','alt_art','promo','reprint']).nullable().optional();
const finishEnum = z.string().max(50).nullable().optional();
const gradingCompanyEnum = z.enum(['PSA','CGC','BGS','ACE','SGC','TAG']).nullable().optional();

const gradingFields = {
  is_graded: z.boolean().optional(),
  grading_company: gradingCompanyEnum,
  grade: z.string().max(16).nullable().optional(),
  cert_number: z.string().max(32).nullable().optional(),
  graded_at: z.string().nullable().optional(),
  include_in_trades: z.boolean().optional(),
  slab_image_url: z.string().max(512).nullable().optional(),
};

const addSchema = z.object({
  card_id: z.string().uuid(),
  status: z.enum(['want', 'have']),
  quantity: z.number().int().min(1).max(10).default(1),
  condition: conditionEnum,
  language: languageEnum,
  edition: editionEnum,
  finish: finishEnum,
  notes: z.string().max(120).optional(),
  ...gradingFields,
});

router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation', message: parsed.error.message });

  const { card_id, status, quantity, language, edition, finish, notes,
          is_graded, grading_company, grade, cert_number, graded_at,
          include_in_trades, slab_image_url } = parsed.data;

  // Grading validation
  if (is_graded && (!grading_company || !grade)) {
    return res.status(400).json({ error: 'Validation', message: 'grading_company and grade are required for graded cards' });
  }

  // Graded cards always NM
  const condition = is_graded ? 'NM' : (parsed.data.condition ?? null);

  // Enforce 30-card free limit
  const userInfo = await queryOne('SELECT is_pro FROM users WHERE id=$1', [req.userId]);
  if (userInfo && !userInfo.is_pro) {
    const countResult = await queryOne<{ count: string }>(
      'SELECT COUNT(*) FROM user_cards WHERE user_id=$1',
      [req.userId]
    );
    if (parseInt(countResult?.count ?? '0') >= 30) {
      return res.status(403).json({
        error: 'LimitReached',
        code: 'binder_limit_reached',
        message: 'Free plan allows 30 cards. Upgrade to Binder Pro for unlimited cards.',
      });
    }
  }

  const cardExists = await queryOne('SELECT id FROM cards WHERE id=$1', [card_id]);
  if (!cardExists) return res.status(404).json({ error: 'NotFound', message: 'Card not found' });

  const entry = await queryOne(
    `INSERT INTO user_cards (
       user_id, card_id, status, quantity, condition, language, edition, finish, notes,
       is_graded, grading_company, grade, cert_number, graded_at, include_in_trades, slab_image_url
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [
      req.userId, card_id, status, quantity,
      condition ?? null, language ?? null, edition ?? null, finish ?? null, notes ?? null,
      is_graded ?? false, grading_company ?? null, grade ?? null,
      cert_number ?? null, graded_at ?? null, include_in_trades ?? false, slab_image_url ?? null,
    ]
  );

  const [full] = await query(`${CARD_WITH_FINISHES} WHERE uc.id = $1`, [entry.id]);
  setImmediate(() => computeMatchesForUser(req.userId!));
  return res.status(201).json(full ?? entry);
});

const updateSchema = z.object({
  quantity: z.number().int().min(1).max(10).optional(),
  condition: conditionEnum,
  language: languageEnum,
  edition: editionEnum,
  finish: finishEnum,
  notes: z.string().max(120).nullable().optional(),
  ...gradingFields,
});

router.patch('/:entry_id', async (req: AuthRequest, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation', message: parsed.error.message });

  const entry = await queryOne(
    'SELECT id, is_graded FROM user_cards WHERE id=$1 AND user_id=$2',
    [req.params.entry_id, req.userId]
  );
  if (!entry) return res.status(404).json({ error: 'NotFound', message: 'Binder entry not found' });

  const d = parsed.data;
  const isGraded = d.is_graded ?? entry.is_graded;

  if (isGraded && (d.is_graded === true) && (!d.grading_company && !d.grade)) {
    // allow partial updates without requiring company+grade every time
  }

  const updates: string[] = [];
  const values: any[] = [];
  let idx = 1;

  const addField = (col: string, val: any) => {
    updates.push(`${col}=$${idx++}`);
    values.push(val);
  };

  if (d.quantity !== undefined) addField('quantity', d.quantity);
  if (d.condition !== undefined) addField('condition', isGraded ? 'NM' : d.condition);
  if (d.language !== undefined) addField('language', d.language);
  if (d.edition !== undefined) addField('edition', d.edition);
  if (d.finish !== undefined) addField('finish', d.finish);
  if (d.notes !== undefined) addField('notes', d.notes);
  if (d.is_graded !== undefined) {
    addField('is_graded', d.is_graded);
    if (d.is_graded) addField('condition', 'NM');
  }
  if (d.grading_company !== undefined) addField('grading_company', d.grading_company);
  if (d.grade !== undefined) addField('grade', d.grade);
  if (d.cert_number !== undefined) addField('cert_number', d.cert_number);
  if (d.graded_at !== undefined) addField('graded_at', d.graded_at);
  if (d.include_in_trades !== undefined) addField('include_in_trades', d.include_in_trades);
  if (d.slab_image_url !== undefined) addField('slab_image_url', d.slab_image_url);

  if (updates.length === 0) return res.status(400).json({ error: 'BadRequest', message: 'No fields to update' });

  values.push(req.params.entry_id, req.userId);
  await queryOne(
    `UPDATE user_cards SET ${updates.join(', ')} WHERE id=$${idx} AND user_id=$${idx + 1}`,
    values
  );

  const [full] = await query(`${CARD_WITH_FINISHES} WHERE uc.id = $1`, [req.params.entry_id]);
  setImmediate(() => computeMatchesForUser(req.userId!));
  return res.json(full);
});

router.delete('/:entry_id', async (req: AuthRequest, res: Response) => {
  const deleted = await queryOne(
    'DELETE FROM user_cards WHERE id=$1 AND user_id=$2 RETURNING id',
    [req.params.entry_id, req.userId]
  );
  if (!deleted) return res.status(404).json({ error: 'NotFound', message: 'Binder entry not found' });
  setImmediate(() => computeMatchesForUser(req.userId!));
  return res.json({ ok: true });
});

export default router;
