import { Router, Response } from 'express';
import { query, queryOne } from '../db/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getIO } from '../sockets/io';
import { sendPushToUser } from './push';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response) => {
  const { limit = '30', offset = '0' } = req.query as Record<string, string>;
  const notifications = await query(
    `SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [req.userId, parseInt(limit), parseInt(offset)]
  );
  return res.json(notifications);
});

router.post('/:id/read', async (req: AuthRequest, res: Response) => {
  const notif = await queryOne(
    'SELECT id FROM notifications WHERE id=$1 AND user_id=$2',
    [req.params.id, req.userId]
  );
  if (!notif) return res.status(404).json({ error: 'NotFound' });
  await query('UPDATE notifications SET read_at=NOW() WHERE id=$1', [req.params.id]);
  return res.json({ ok: true });
});

router.post('/read-all', async (req: AuthRequest, res: Response) => {
  await query(
    'UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL',
    [req.userId]
  );
  return res.json({ ok: true });
});

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  payload: any = null
) {
  const notif = await queryOne(
    `INSERT INTO notifications (user_id, type, title, body, payload)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [userId, type, title, body, payload ? JSON.stringify(payload) : null]
  );
  getIO()?.to(`user:${userId}`).emit('notification', notif);
  // Best-effort push — don't await, don't fail the caller
  sendPushToUser(userId, { title, body, type, payload }).catch(() => {});
  return notif;
}

export default router;
