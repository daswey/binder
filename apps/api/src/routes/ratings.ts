import { Router, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/client';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

const ratingSchema = z.object({
  completed_trade_id: z.string().uuid(),
  score: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = ratingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation', message: parsed.error.message });

  const { completed_trade_id, score, comment } = parsed.data;
  const trade = await queryOne(
    'SELECT * FROM completed_trades WHERE id=$1 AND (user_a_id=$2 OR user_b_id=$2)',
    [completed_trade_id, req.userId]
  );
  if (!trade) return res.status(404).json({ error: 'NotFound', message: 'Trade not found' });

  const rateeId = trade.user_a_id === req.userId ? trade.user_b_id : trade.user_a_id;

  const existing = await queryOne(
    'SELECT id FROM trade_ratings WHERE rater_id=$1 AND completed_trade_id=$2',
    [req.userId, completed_trade_id]
  );
  if (existing) return res.status(409).json({ error: 'Conflict', message: 'Already rated this trade' });

  const rating = await queryOne(
    'INSERT INTO trade_ratings (rater_id, ratee_id, completed_trade_id, score, comment) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [req.userId, rateeId, completed_trade_id, score, comment ?? null]
  );

  // Update reputation: rolling average of last 20 ratings
  await query(
    `UPDATE users SET reputation_score = (
       SELECT AVG(score) FROM (
         SELECT score FROM trade_ratings WHERE ratee_id=$1 ORDER BY created_at DESC LIMIT 20
       ) recent
     ) WHERE id=$1`,
    [rateeId]
  );

  return res.status(201).json(rating);
});

router.get('/users/:id', async (req: any, res: Response) => {
  const ratings = await query(
    `SELECT tr.*, json_build_object(
       'id', u.id, 'username', u.username, 'avatar_url', u.avatar_url
     ) AS rater
     FROM trade_ratings tr
     JOIN users u ON u.id = tr.rater_id
     WHERE tr.ratee_id = $1
     ORDER BY tr.created_at DESC
     LIMIT 50`,
    [req.params.id]
  );
  return res.json(ratings);
});

export default router;
