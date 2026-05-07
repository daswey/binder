import { Router, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/client';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const MAX_ALERTS_FREE = 3;
const MAX_ALERTS_PRO = 50;

const createSchema = z.object({
  card_id: z.string().uuid(),
  finish_id: z.string().max(64).optional(),
  target_price_eur: z.number().positive(),
});

router.get('/', async (req: AuthRequest, res: Response) => {
  const alerts = await query(
    `SELECT pa.*, json_build_object(
       'id', c.id, 'name', c.name, 'image_url', c.image_url, 'game', c.game, 'external_id', c.external_id
     ) AS card
     FROM price_alerts pa
     JOIN cards c ON c.id = pa.card_id
     WHERE pa.user_id = $1
     ORDER BY pa.created_at DESC`,
    [req.userId]
  );
  return res.json(alerts);
});

router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation', message: parsed.error.message });

  const user = await queryOne('SELECT is_pro, price_alert_count FROM users WHERE id=$1', [req.userId]);
  if (!user) return res.status(404).json({ error: 'NotFound' });

  const maxAlerts = user.is_pro ? MAX_ALERTS_PRO : MAX_ALERTS_FREE;
  if (user.price_alert_count >= maxAlerts) {
    return res.status(403).json({
      error: 'LimitReached',
      code: 'price_alert_limit',
      message: user.is_pro ? `Pro plan limit is ${MAX_ALERTS_PRO} alerts` : 'Free plan allows 3 alerts. Upgrade to Pro for 50.',
      is_pro: user.is_pro,
    });
  }

  const { card_id, finish_id, target_price_eur } = parsed.data;

  const card = await queryOne('SELECT id, market_price_eur FROM cards WHERE id=$1', [card_id]);
  if (!card) return res.status(404).json({ error: 'NotFound', message: 'Card not found' });

  const alert = await queryOne(
    `INSERT INTO price_alerts (user_id, card_id, finish_id, target_price_eur, last_price_eur)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, card_id, finish_id) DO UPDATE
       SET target_price_eur = EXCLUDED.target_price_eur, last_price_eur = EXCLUDED.last_price_eur
     RETURNING *`,
    [req.userId, card_id, finish_id ?? null, target_price_eur, card.market_price_eur ?? null]
  );

  await query(
    `UPDATE users SET price_alert_count = (SELECT COUNT(*) FROM price_alerts WHERE user_id=$1) WHERE id=$1`,
    [req.userId]
  );

  return res.status(201).json(alert);
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const deleted = await queryOne(
    'DELETE FROM price_alerts WHERE id=$1 AND user_id=$2 RETURNING id',
    [req.params.id, req.userId]
  );
  if (!deleted) return res.status(404).json({ error: 'NotFound' });

  await query(
    `UPDATE users SET price_alert_count = (SELECT COUNT(*) FROM price_alerts WHERE user_id=$1) WHERE id=$1`,
    [req.userId]
  );
  return res.json({ ok: true });
});

export default router;
