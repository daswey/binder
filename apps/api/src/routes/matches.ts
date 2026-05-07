import { Router, Response } from 'express';
import { query, queryOne } from '../db/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { computeMatchesForUser } from '../services/matchEngine';

const router = Router();
router.use(requireAuth);

function parseJson(v: any) {
  return typeof v === 'string' ? JSON.parse(v) : v;
}

const PUBLIC_USER = `json_build_object(
  'id', u.id, 'username', u.username, 'avatar_url', u.avatar_url,
  'bio', u.bio, 'location_label', u.location_label,
  'reputation_score', u.reputation_score, 'trade_count', u.trade_count,
  'is_lgs', u.is_lgs, 'is_pro', u.is_pro, 'created_at', u.created_at
)`;

router.get('/', async (req: AuthRequest, res: Response) => {
  const { radius_km = '25', game } = req.query as Record<string, string>;
  const userInfo = await queryOne('SELECT is_pro FROM users WHERE id=$1', [req.userId]);
  const maxRadius = userInfo?.is_pro ? 100 : 50;
  const radiusKm = Math.min(parseFloat(radius_km) || 25, maxRadius);

  const matches = await query(
    `SELECT
       tm.*,
       ${PUBLIC_USER} AS other_user
     FROM trade_matches tm
     JOIN users u ON u.id = CASE WHEN tm.user_a_id = $1 THEN tm.user_b_id ELSE tm.user_a_id END
     WHERE (tm.user_a_id = $1 OR tm.user_b_id = $1)
       AND tm.distance_km <= $2
     ORDER BY
       CASE tm.match_type WHEN 'perfect' THEN 1 WHEN 'partial' THEN 2 ELSE 3 END,
       tm.distance_km ASC`,
    [req.userId, radiusKm]
  );

  let result = matches.map((m: any) => ({
    ...m,
    user_a_gets: parseJson(m.user_a_gets),
    user_b_gets: parseJson(m.user_b_gets),
  }));

  if (game && game !== 'all') {
    result = result.filter((m: any) => {
      const cards = [...m.user_a_gets, ...m.user_b_gets];
      return cards.some((c: any) => c.game === game);
    });
  }

  return res.json(result);
});

router.get('/:match_id', async (req: AuthRequest, res: Response) => {
  const match = await queryOne(
    `SELECT tm.*, ${PUBLIC_USER} AS other_user
     FROM trade_matches tm
     JOIN users u ON u.id = CASE WHEN tm.user_a_id = $2 THEN tm.user_b_id ELSE tm.user_a_id END
     WHERE tm.id = $1 AND (tm.user_a_id = $2 OR tm.user_b_id = $2)`,
    [req.params.match_id, req.userId]
  );
  if (!match) return res.status(404).json({ error: 'NotFound', message: 'Match not found' });

  return res.json({
    ...match,
    user_a_gets: parseJson(match.user_a_gets),
    user_b_gets: parseJson(match.user_b_gets),
  });
});

router.post('/refresh', async (req: AuthRequest, res: Response) => {
  setImmediate(() => computeMatchesForUser(req.userId!));
  return res.json({ ok: true, message: 'Match recompute triggered' });
});

// Mark trade as completed
router.post('/:match_id/complete', async (req: AuthRequest, res: Response) => {
  const match = await queryOne(
    `SELECT * FROM trade_matches WHERE id=$1 AND (user_a_id=$2 OR user_b_id=$2)`,
    [req.params.match_id, req.userId]
  );
  if (!match) return res.status(404).json({ error: 'NotFound', message: 'Match not found' });

  const aGets = parseJson(match.user_a_gets);
  const bGets = parseJson(match.user_b_gets);

  const trade = await queryOne(
    `INSERT INTO completed_trades (user_a_id, user_b_id, a_gave, b_gave)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [match.user_a_id, match.user_b_id, JSON.stringify(bGets), JSON.stringify(aGets)]
  );

  // Update trade counts
  await query(
    'UPDATE users SET trade_count = trade_count + 1 WHERE id = ANY($1::uuid[])',
    [[match.user_a_id, match.user_b_id]]
  );

  // Remove the match
  await query('DELETE FROM trade_matches WHERE id=$1', [match.id]);

  return res.json({ ok: true, completed_trade_id: trade?.id });
});

export default router;
