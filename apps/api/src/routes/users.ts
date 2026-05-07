import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/client';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

const PUBLIC_USER_FIELDS = `id, username, avatar_url, bio, location_label, reputation_score, trade_count, is_lgs, created_at`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/:id', async (req: Request, res: Response) => {
  let user: any = null;
  if (UUID_RE.test(req.params.id)) {
    user = await queryOne(
      `SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id=$1`,
      [req.params.id]
    );
  }
  if (!user) {
    const byUsername = await queryOne(
      `SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE username=$1`,
      [req.params.id]
    );
    if (!byUsername) return res.status(404).json({ error: 'NotFound', message: 'User not found' });
    return res.json(byUsername);
  }
  return res.json(user);
});

router.get('/:id/binder', async (req: Request, res: Response) => {
  const entries = await query(
    `SELECT uc.id, uc.status, uc.quantity, uc.condition, uc.language, uc.edition, uc.finish, uc.notes, uc.created_at,
            json_build_object(
              'id', c.id, 'external_id', c.external_id, 'name', c.name,
              'game', c.game, 'set_name', c.set_name, 'set_code', c.set_code,
              'rarity', c.rarity, 'image_url', c.image_url, 'market_price_eur', c.market_price_eur,
              'is_seed', c.is_seed,
              'available_finishes', COALESCE((
                SELECT json_agg(json_build_object('finish_id', cf.finish_id, 'label', cf.label,
                               'image_url', cf.image_url, 'market_price_eur', cf.market_price_eur))
                FROM card_finishes cf WHERE cf.card_id = c.id
              ), '[]'::json)
            ) AS card
     FROM user_cards uc
     JOIN cards c ON c.id = uc.card_id
     WHERE uc.user_id = $1
     ORDER BY uc.status DESC, uc.created_at DESC`,
    [req.params.id]
  );
  return res.json(entries);
});

router.get('/:id/ratings', async (req: Request, res: Response) => {
  const ratings = await query(
    `SELECT tr.id, tr.score, tr.comment, tr.created_at,
            json_build_object('id', u.id, 'username', u.username, 'avatar_url', u.avatar_url) AS rater
     FROM trade_ratings tr
     JOIN users u ON u.id = tr.rater_id
     WHERE tr.ratee_id = $1
     ORDER BY tr.created_at DESC
     LIMIT 50`,
    [req.params.id]
  );
  return res.json(ratings);
});

router.get('/:id/trades', async (req: Request, res: Response) => {
  const userId = req.params.id;
  const trades = await query(
    `SELECT ct.*,
            json_build_object(
              'id', u.id, 'username', u.username, 'avatar_url', u.avatar_url,
              'location_label', u.location_label, 'reputation_score', u.reputation_score,
              'trade_count', u.trade_count, 'is_lgs', u.is_lgs, 'created_at', u.created_at
            ) AS other_user
     FROM completed_trades ct
     JOIN users u ON u.id = CASE WHEN ct.user_a_id=$1 THEN ct.user_b_id ELSE ct.user_a_id END
     WHERE ct.user_a_id=$1 OR ct.user_b_id=$1
     ORDER BY ct.completed_at DESC
     LIMIT 50`,
    [userId]
  );
  return res.json(trades.map((t: any) => ({
    ...t,
    a_gave: typeof t.a_gave === 'string' ? JSON.parse(t.a_gave) : t.a_gave,
    b_gave: typeof t.b_gave === 'string' ? JSON.parse(t.b_gave) : t.b_gave,
  })));
});

export default router;
