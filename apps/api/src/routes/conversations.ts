import { Router, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getIO } from '../sockets/io';
import { createNotification } from './notifications';

const router = Router();
router.use(requireAuth);

// ── helpers ───────────────────────────────────────────────────────────────────

async function getConvParticipant(convId: string, userId: string) {
  return queryOne(
    'SELECT 1 FROM conversation_participants WHERE conversation_id=$1 AND user_id=$2',
    [convId, userId]
  );
}

async function getConv(convId: string) {
  return queryOne<any>('SELECT * FROM conversations WHERE id=$1', [convId]);
}

async function otherParticipant(convId: string, myId: string) {
  return queryOne<{ user_id: string }>(
    'SELECT user_id FROM conversation_participants WHERE conversation_id=$1 AND user_id!=$2 LIMIT 1',
    [convId, myId]
  );
}

async function insertMessage(convId: string, senderId: string, body: string, type: string, payload: any) {
  const msg = await queryOne(
    `INSERT INTO messages (conversation_id, sender_id, body, type, payload)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [convId, senderId, body, type, payload ? JSON.stringify(payload) : null]
  );
  getIO()?.to(`conv:${convId}`).emit('message', msg);
  return msg;
}

// ── GET /conversations ────────────────────────────────────────────────────────

router.get('/', async (req: AuthRequest, res: Response) => {
  const convs = await query(
    `SELECT
       c.id, c.trade_match_id, c.status, c.trade_proposal, c.meetup_location, c.meetup_time,
       c.completed_by_a, c.completed_by_b, c.created_at,
       (SELECT array_agg(cp.user_id) FROM conversation_participants cp WHERE cp.conversation_id = c.id) AS participant_ids,
       (SELECT row_to_json(u) FROM users u
        JOIN conversation_participants cp ON cp.user_id = u.id
        WHERE cp.conversation_id = c.id AND u.id != $1 LIMIT 1) AS other_participant,
       (SELECT row_to_json(msg) FROM (
          SELECT id, sender_id, body, type, read_at, created_at FROM messages
          WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
        ) msg) AS last_message,
       (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != $1 AND m.read_at IS NULL) AS unread_count
     FROM conversations c
     JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $1
     ORDER BY (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) DESC NULLS LAST`,
    [req.userId]
  );
  return res.json(convs);
});

// ── GET /conversations/:id ────────────────────────────────────────────────────

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const ok = await getConvParticipant(req.params.id, req.userId!);
  if (!ok) return res.status(403).json({ error: 'Forbidden' });

  const conv = await queryOne(
    `SELECT c.*,
       (SELECT row_to_json(u) FROM users u
        JOIN conversation_participants cp ON cp.user_id = u.id
        WHERE cp.conversation_id = c.id AND u.id != $2 LIMIT 1) AS other_participant,
       (SELECT row_to_json(tm) FROM trade_matches tm WHERE tm.id = c.trade_match_id LIMIT 1) AS trade_match
     FROM conversations c WHERE c.id=$1`,
    [req.params.id, req.userId]
  );
  if (!conv) return res.status(404).json({ error: 'NotFound' });
  return res.json(conv);
});

// ── GET /conversations/:id/messages ──────────────────────────────────────────

router.get('/:id/messages', async (req: AuthRequest, res: Response) => {
  const ok = await getConvParticipant(req.params.id, req.userId!);
  if (!ok) return res.status(403).json({ error: 'Forbidden', message: 'Not a participant' });

  const { before, limit = '50' } = req.query as Record<string, string>;
  const messages = await query(
    `SELECT m.*, row_to_json(u) AS sender
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = $1 ${before ? `AND m.created_at < $3` : ''}
     ORDER BY m.created_at DESC LIMIT $2`,
    before ? [req.params.id, parseInt(limit), before] : [req.params.id, parseInt(limit)]
  );
  return res.json(messages.reverse());
});

// ── POST /conversations ───────────────────────────────────────────────────────

const newConvSchema = z.object({
  match_id: z.string().uuid().optional(),
  trade_match_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
});

router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = newConvSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation', message: parsed.error.message });

  const { user_id } = parsed.data;
  const match_id = parsed.data.match_id ?? parsed.data.trade_match_id;
  let otherUserId = user_id;

  if (match_id) {
    const match = await queryOne(
      'SELECT * FROM trade_matches WHERE id=$1 AND (user_a_id=$2 OR user_b_id=$2)',
      [match_id, req.userId]
    );
    if (!match) return res.status(404).json({ error: 'NotFound', message: 'Match not found' });
    otherUserId = match.user_a_id === req.userId ? match.user_b_id : match.user_a_id;

    const existing = await queryOne(
      `SELECT c.id FROM conversations c
       JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = $1
       JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = $2`,
      [req.userId, otherUserId]
    );
    if (existing) return res.json(existing);
  }

  if (!otherUserId) return res.status(400).json({ error: 'BadRequest', message: 'Provide match_id or user_id' });

  const conv = await queryOne(
    'INSERT INTO conversations (trade_match_id) VALUES ($1) RETURNING *',
    [match_id ?? null]
  );
  await query(
    'INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1,$2),($1,$3)',
    [conv.id, req.userId, otherUserId]
  );

  return res.status(201).json(conv);
});

// ── POST /conversations/:id/messages ─────────────────────────────────────────

router.post('/:id/messages', async (req: AuthRequest, res: Response) => {
  const ok = await getConvParticipant(req.params.id, req.userId!);
  if (!ok) return res.status(403).json({ error: 'Forbidden', message: 'Not a participant' });

  const { body, type = 'text', payload } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'BadRequest', message: 'Message body required' });

  const message = await insertMessage(req.params.id, req.userId!, body.trim(), type, payload);
  return res.status(201).json(message);
});

// ── PATCH /conversations/:id/read ─────────────────────────────────────────────

router.patch('/:id/read', async (req: AuthRequest, res: Response) => {
  const ok = await getConvParticipant(req.params.id, req.userId!);
  if (!ok) return res.status(403).json({ error: 'Forbidden', message: 'Not a participant' });

  await query(
    `UPDATE messages SET read_at=NOW() WHERE conversation_id=$1 AND sender_id != $2 AND read_at IS NULL`,
    [req.params.id, req.userId]
  );
  return res.json({ ok: true });
});

// ── POST /conversations/:id/proposal ─────────────────────────────────────────

const proposalItemSchema = z.object({
  card_id: z.string(),
  external_id: z.string(),
  name: z.string(),
  image_url: z.string().optional(),
  finish: z.string().optional(),
  quantity: z.number().int().min(1).default(1),
});

const proposalSchema = z.object({
  items_i_give: z.array(proposalItemSchema).min(0),
  items_you_give: z.array(proposalItemSchema).min(0),
  message: z.string().max(500).optional(),
});

router.post('/:id/proposal', async (req: AuthRequest, res: Response) => {
  const ok = await getConvParticipant(req.params.id, req.userId!);
  if (!ok) return res.status(403).json({ error: 'Forbidden' });

  const parsed = proposalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation', message: parsed.error.message });

  const conv = await getConv(req.params.id);
  if (!conv) return res.status(404).json({ error: 'NotFound' });
  if (conv.status === 'completed') return res.status(409).json({ error: 'Conflict', message: 'Trade already completed' });

  const proposal = { ...parsed.data, proposed_by: req.userId, status: 'pending' };

  await query(
    `UPDATE conversations SET trade_proposal=$1, status='proposal_sent' WHERE id=$2`,
    [JSON.stringify(proposal), req.params.id]
  );

  const me = await queryOne<{ username: string }>('SELECT username FROM users WHERE id=$1', [req.userId]);
  const msg = await insertMessage(
    req.params.id, req.userId!,
    parsed.data.message ? `${me?.username} proposed a trade: "${parsed.data.message}"` : `${me?.username} proposed a trade`,
    'trade_proposal',
    proposal
  );

  const other = await otherParticipant(req.params.id, req.userId!);
  if (other) {
    await createNotification(
      other.user_id, 'trade_proposal',
      'Trade Proposal',
      `${me?.username} sent you a trade proposal`,
      { conversation_id: req.params.id }
    );
  }

  getIO()?.to(`conv:${req.params.id}`).emit('conversation_updated', {
    id: req.params.id, status: 'proposal_sent', trade_proposal: proposal,
  });

  return res.status(201).json(msg);
});

// ── PATCH /conversations/:id/proposal ────────────────────────────────────────

const proposalActionSchema = z.object({
  action: z.enum(['accept', 'reject', 'counter']),
  counter_proposal: z.object({
    items_i_give: z.array(proposalItemSchema),
    items_you_give: z.array(proposalItemSchema),
    message: z.string().max(500).optional(),
  }).optional(),
});

router.patch('/:id/proposal', async (req: AuthRequest, res: Response) => {
  const ok = await getConvParticipant(req.params.id, req.userId!);
  if (!ok) return res.status(403).json({ error: 'Forbidden' });

  const parsed = proposalActionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation', message: parsed.error.message });

  const conv = await getConv(req.params.id);
  if (!conv) return res.status(404).json({ error: 'NotFound' });
  if (conv.status !== 'proposal_sent') return res.status(409).json({ error: 'Conflict', message: 'No pending proposal' });

  const { action, counter_proposal } = parsed.data;
  const me = await queryOne<{ username: string }>('SELECT username FROM users WHERE id=$1', [req.userId]);
  const other = await otherParticipant(req.params.id, req.userId!);

  if (action === 'accept') {
    const updatedProposal = { ...(conv.trade_proposal ?? {}), status: 'accepted' };
    await query(
      `UPDATE conversations SET trade_proposal=$1, status='proposal_accepted' WHERE id=$2`,
      [JSON.stringify(updatedProposal), req.params.id]
    );
    await insertMessage(req.params.id, req.userId!, `${me?.username} accepted the trade proposal`, 'system', { text: 'proposal_accepted' });
    if (other) {
      await createNotification(other.user_id, 'proposal_accepted', 'Proposal Accepted', `${me?.username} accepted your trade proposal`, { conversation_id: req.params.id });
    }
    getIO()?.to(`conv:${req.params.id}`).emit('conversation_updated', { id: req.params.id, status: 'proposal_accepted', trade_proposal: updatedProposal });

  } else if (action === 'reject') {
    const updatedProposal = { ...(conv.trade_proposal ?? {}), status: 'rejected' };
    await query(
      `UPDATE conversations SET trade_proposal=$1, status='active' WHERE id=$2`,
      [JSON.stringify(updatedProposal), req.params.id]
    );
    await insertMessage(req.params.id, req.userId!, `${me?.username} declined the trade proposal`, 'system', { text: 'proposal_rejected' });
    getIO()?.to(`conv:${req.params.id}`).emit('conversation_updated', { id: req.params.id, status: 'active', trade_proposal: updatedProposal });

  } else if (action === 'counter' && counter_proposal) {
    const newProposal = { ...counter_proposal, proposed_by: req.userId, status: 'pending' };
    await query(
      `UPDATE conversations SET trade_proposal=$1, status='proposal_sent' WHERE id=$2`,
      [JSON.stringify(newProposal), req.params.id]
    );
    await insertMessage(req.params.id, req.userId!, `${me?.username} sent a counter-proposal`, 'trade_proposal', newProposal);
    if (other) {
      await createNotification(other.user_id, 'trade_proposal', 'Counter Proposal', `${me?.username} sent a counter-proposal`, { conversation_id: req.params.id });
    }
    getIO()?.to(`conv:${req.params.id}`).emit('conversation_updated', { id: req.params.id, status: 'proposal_sent', trade_proposal: newProposal });
  }

  const updated = await getConv(req.params.id);
  return res.json(updated);
});

// ── POST /conversations/:id/meetup ────────────────────────────────────────────

const meetupSchema = z.object({
  location: z.string().min(1).max(300),
  time: z.string(), // ISO datetime
  message: z.string().max(300).optional(),
});

router.post('/:id/meetup', async (req: AuthRequest, res: Response) => {
  const ok = await getConvParticipant(req.params.id, req.userId!);
  if (!ok) return res.status(403).json({ error: 'Forbidden' });

  const parsed = meetupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation', message: parsed.error.message });

  const conv = await getConv(req.params.id);
  if (!conv) return res.status(404).json({ error: 'NotFound' });
  if (conv.status === 'completed') return res.status(409).json({ error: 'Conflict', message: 'Trade already completed' });

  const { location, time, message } = parsed.data;
  await query(
    `UPDATE conversations SET meetup_location=$1, meetup_time=$2, status='meetup_set' WHERE id=$3`,
    [location, time, req.params.id]
  );

  const me = await queryOne<{ username: string }>('SELECT username FROM users WHERE id=$1', [req.userId]);
  const payload = { location, time, proposed_by: req.userId };
  await insertMessage(
    req.params.id, req.userId!,
    message ?? `${me?.username} suggested a meetup: ${location}`,
    'meetup_proposal', payload
  );

  const other = await otherParticipant(req.params.id, req.userId!);
  if (other) {
    await createNotification(other.user_id, 'meetup_proposal', 'Meetup Proposed', `${me?.username} suggested a meeting place`, { conversation_id: req.params.id });
  }

  getIO()?.to(`conv:${req.params.id}`).emit('conversation_updated', {
    id: req.params.id, status: 'meetup_set', meetup_location: location, meetup_time: time,
  });

  return res.json({ ok: true, meetup_location: location, meetup_time: time });
});

// ── POST /conversations/:id/complete ─────────────────────────────────────────

router.post('/:id/complete', async (req: AuthRequest, res: Response) => {
  const ok = await getConvParticipant(req.params.id, req.userId!);
  if (!ok) return res.status(403).json({ error: 'Forbidden' });

  const conv = await getConv(req.params.id);
  if (!conv) return res.status(404).json({ error: 'NotFound' });
  if (conv.status === 'completed') return res.status(409).json({ error: 'Conflict', message: 'Already completed' });

  // Determine if we're user_a or user_b in the trade match
  const participants = await query<{ user_id: string }>(
    'SELECT user_id FROM conversation_participants WHERE conversation_id=$1 ORDER BY user_id',
    [req.params.id]
  );
  const [pA, pB] = participants;
  const isA = pA?.user_id === req.userId;

  const colToSet = isA ? 'completed_by_a' : 'completed_by_b';
  await query(`UPDATE conversations SET ${colToSet}=true WHERE id=$1`, [req.params.id]);

  const refreshed = await getConv(req.params.id);
  const nowA = isA ? true : refreshed.completed_by_a;
  const nowB = !isA ? true : refreshed.completed_by_b;

  const me = await queryOne<{ username: string }>('SELECT username FROM users WHERE id=$1', [req.userId]);
  const other = await otherParticipant(req.params.id, req.userId!);

  if (nowA && nowB) {
    await query(`UPDATE conversations SET status='completed' WHERE id=$1`, [req.params.id]);
    await insertMessage(req.params.id, req.userId!, 'Trade completed! Thanks for trading.', 'system', { text: 'trade_completed' });

    if (other) {
      await createNotification(other.user_id, 'trade_completed', 'Trade Complete!', `Your trade with ${me?.username} is complete. Rate your experience!`, { conversation_id: req.params.id });
    }
    getIO()?.to(`conv:${req.params.id}`).emit('conversation_updated', { id: req.params.id, status: 'completed' });
    return res.json({ ok: true, status: 'completed' });
  }

  // Waiting for other side
  if (other) {
    await createNotification(other.user_id, 'complete_pending', 'Mark Trade Complete', `${me?.username} marked the trade as done — confirm your side!`, { conversation_id: req.params.id });
  }
  getIO()?.to(`conv:${req.params.id}`).emit('conversation_updated', { id: req.params.id, completed_by_a: nowA, completed_by_b: nowB });

  return res.json({ ok: true, status: 'waiting_for_other' });
});

export default router;
