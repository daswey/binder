import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/client';
import { createNotification } from './notifications';

const router = Router();

router.post('/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: any = req.body;

  // When we have a Stripe SDK wired up, verify signature here:
  // event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const stripeCustomerId = session.customer as string;
        const userId = session.metadata?.user_id as string | undefined;

        if (userId) {
          const expiresAt = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
          await query(
            `UPDATE users SET is_pro=true, pro_since=NOW(), pro_expires_at=$1, stripe_customer_id=$2
             WHERE id=$3`,
            [expiresAt, stripeCustomerId, userId]
          );
          await createNotification(
            userId,
            'pro_activated',
            'Welcome to Binder Pro ◆',
            'Your Pro subscription is now active. Enjoy unlimited radius, alerts, and more!',
            {}
          );
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const stripeCustomerId = sub.customer as string;
        const user = await queryOne(
          'SELECT id FROM users WHERE stripe_customer_id=$1',
          [stripeCustomerId]
        );
        if (user) {
          await query(
            `UPDATE users SET is_pro=false, pro_expires_at=NOW() WHERE id=$1`,
            [user.id]
          );
          await createNotification(
            user.id,
            'pro_expired',
            'Pro subscription ended',
            'Your Binder Pro subscription has been cancelled. You\'ve been moved to the free plan.',
            {}
          );
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const stripeCustomerId = invoice.customer as string;
        const user = await queryOne(
          'SELECT id FROM users WHERE stripe_customer_id=$1',
          [stripeCustomerId]
        );
        if (user) {
          const expiresAt = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
          await query(
            `UPDATE users SET is_pro=true, pro_expires_at=$1 WHERE id=$2`,
            [expiresAt, user.id]
          );
        }
        break;
      }

      default:
        break;
    }

    return res.json({ received: true });
  } catch (err: any) {
    console.error('[stripe webhook]', err?.message);
    return res.status(500).json({ error: 'WebhookError', message: err?.message });
  }
});

export default router;
