import { Router, Response } from 'express';
import webpush from 'web-push';
import { query, queryOne } from '../db/client';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

// GET /api/push/vapid-public-key — return public key for client subscription
router.get('/vapid-public-key', (_req, res: Response) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

// POST /api/push/subscribe — save a push subscription for the current user
router.post('/subscribe', requireAuth, async (req: AuthRequest, res: Response) => {
  const { endpoint, keys, userAgent } = req.body as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    userAgent?: string;
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Missing subscription fields' });
  }

  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh=$3, auth=$4, user_agent=$5`,
    [req.userId!, endpoint, keys.p256dh, keys.auth, userAgent ?? null],
  );

  res.json({ ok: true });
});

// DELETE /api/push/subscribe — remove a push subscription
router.delete('/subscribe', requireAuth, async (req: AuthRequest, res: Response) => {
  const { endpoint } = req.body as { endpoint: string };
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });

  await query(
    'DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2',
    [req.userId!, endpoint],
  );

  res.json({ ok: true });
});

// Exported helper — called internally to deliver a push notification to a user
export async function sendPushToUser(userId: string, payload: object) {
  const subs = await query<{ endpoint: string; p256dh: string; auth: string }>(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=$1',
    [userId],
  );

  const body = JSON.stringify(payload);

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
      } catch (err: any) {
        // 410 Gone = subscription expired; clean it up
        if (err.statusCode === 410) {
          await query('DELETE FROM push_subscriptions WHERE endpoint=$1', [sub.endpoint]);
        }
      }
    }),
  );
}

export default router;
