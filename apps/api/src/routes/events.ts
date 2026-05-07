import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { createActivityEvent } from '../services/feedService';

const router = Router();

const PUBLIC_ORGANIZER = `json_build_object(
  'id', u.id, 'username', u.username, 'avatar_url', u.avatar_url,
  'bio', u.bio, 'location_label', u.location_label,
  'reputation_score', u.reputation_score, 'trade_count', u.trade_count,
  'is_lgs', u.is_lgs, 'created_at', u.created_at
)`;

router.get('/', async (req: Request, res: Response) => {
  const {
    lat, lng, radius_km = '25',
    game, from, to, free_only,
    page = '1', limit = '20'
  } = req.query as Record<string, string>;

  const params: any[] = [];
  const conditions: string[] = ['e.archived = FALSE', "e.starts_at >= NOW() - INTERVAL '2 hours'"];
  let idx = 1;

  if (lat && lng) {
    conditions.push(`ST_DWithin(e.location::geography, ST_SetSRID(ST_MakePoint($${idx++}, $${idx++}), 4326)::geography, $${idx++})`);
    params.push(parseFloat(lng), parseFloat(lat), parseFloat(radius_km) * 1000);
  }
  if (game && game !== 'all') { conditions.push(`e.game IN ($${idx++}, 'all')`); params.push(game); }
  if (from) { conditions.push(`e.starts_at >= $${idx++}`); params.push(from); }
  if (to) { conditions.push(`e.starts_at <= $${idx++}`); params.push(to); }
  if (free_only === 'true') { conditions.push(`e.entry_fee_eur = 0`); }

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const where = `WHERE ${conditions.join(' AND ')}`;

  // Auth user id for is_attending
  const userId = (req as AuthRequest).userId;

  const distanceSelect = lat && lng
    ? `, ST_Distance(e.location::geography, ST_SetSRID(ST_MakePoint(${parseFloat(lng)}, ${parseFloat(lat)}), 4326)::geography) / 1000 AS distance_km`
    : '';

  const attendingSelect = userId
    ? `, EXISTS(SELECT 1 FROM event_attendees ea WHERE ea.event_id = e.id AND ea.user_id = '${userId}') AS is_attending`
    : ', FALSE AS is_attending';

  const events = await query(
    `SELECT e.*,
       ${PUBLIC_ORGANIZER} AS organizer,
       (SELECT COUNT(*) FROM event_attendees ea WHERE ea.event_id = e.id)::int AS attendee_count,
       ST_Y(e.location::geometry) AS latitude,
       ST_X(e.location::geometry) AS longitude
       ${distanceSelect}${attendingSelect}
     FROM events e
     JOIN users u ON u.id = e.organizer_id
     ${where}
     ORDER BY e.starts_at ASC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, parseInt(limit), offset]
  );

  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) FROM events e ${where}`,
    params
  );

  return res.json({
    data: events,
    total: parseInt(countResult?.count ?? '0'),
    page: parseInt(page),
    limit: parseInt(limit),
  });
});

router.get('/:id', async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).userId;

  const attendingSelect = userId
    ? `, EXISTS(SELECT 1 FROM event_attendees ea WHERE ea.event_id = e.id AND ea.user_id = '${userId}') AS is_attending`
    : ', FALSE AS is_attending';

  const event = await queryOne(
    `SELECT e.*,
       ${PUBLIC_ORGANIZER} AS organizer,
       (SELECT COUNT(*) FROM event_attendees ea WHERE ea.event_id = e.id)::int AS attendee_count,
       ST_Y(e.location::geometry) AS latitude,
       ST_X(e.location::geometry) AS longitude
       ${attendingSelect}
     FROM events e
     JOIN users u ON u.id = e.organizer_id
     WHERE e.id = $1`,
    [req.params.id]
  );
  if (!event) return res.status(404).json({ error: 'NotFound', message: 'Event not found' });
  return res.json(event);
});

const createSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().max(2000).optional(),
  game: z.enum(['pokemon', 'one_piece', 'all']),
  event_type: z.enum(['tournament', 'locals', 'trade_table', 'casual']),
  address: z.string().min(5),
  latitude: z.number(),
  longitude: z.number(),
  starts_at: z.string(),
  ends_at: z.string().optional(),
  entry_fee_eur: z.number().int().min(0).default(0),
  max_attendees: z.number().int().positive().optional(),
  recurring: z.enum(['none', 'weekly', 'biweekly', 'monthly']).default('none'),
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation', message: parsed.error.message });

  const { title, description, game, event_type, address, latitude, longitude,
    starts_at, ends_at, entry_fee_eur, max_attendees, recurring } = parsed.data;

  const event = await queryOne(
    `INSERT INTO events (organizer_id, title, description, game, event_type, location, address,
       starts_at, ends_at, entry_fee_eur, max_attendees, recurring)
     VALUES ($1,$2,$3,$4,$5,ST_SetSRID(ST_MakePoint($6,$7),4326),$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [req.userId, title, description ?? null, game, event_type, longitude, latitude,
      address, starts_at, ends_at ?? null, entry_fee_eur, max_attendees ?? null, recurring]
  );

  const organizer = await queryOne<{ username: string }>('SELECT username FROM users WHERE id=$1', [req.userId]);

  // Fire feed event
  setImmediate(() => createActivityEvent({
    type: 'event_created',
    actor_id: req.userId,
    payload: {
      type: 'event_created',
      event_id: event.id,
      title,
      organizer: organizer?.username ?? '',
      event_type,
      starts_at,
      distance_km: 0,
      entry_fee_eur,
      game,
    },
    lat: latitude,
    lng: longitude,
  }));

  return res.status(201).json(event);
});

const updateSchema = createSchema.partial();

router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const event = await queryOne('SELECT * FROM events WHERE id=$1', [req.params.id]);
  if (!event) return res.status(404).json({ error: 'NotFound', message: 'Event not found' });
  if (event.organizer_id !== req.userId) return res.status(403).json({ error: 'Forbidden' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation', message: parsed.error.message });

  const fields = parsed.data;
  const updates: string[] = [];
  const values: any[] = [];
  let idx = 1;

  const fieldMap: Record<string, string> = {
    title: 'title', description: 'description', game: 'game',
    event_type: 'event_type', address: 'address',
    starts_at: 'starts_at', ends_at: 'ends_at',
    entry_fee_eur: 'entry_fee_eur', max_attendees: 'max_attendees', recurring: 'recurring',
  };

  for (const [key, col] of Object.entries(fieldMap)) {
    if ((fields as any)[key] !== undefined) {
      updates.push(`${col}=$${idx++}`);
      values.push((fields as any)[key]);
    }
  }

  if (fields.latitude != null && fields.longitude != null) {
    updates.push(`location=ST_SetSRID(ST_MakePoint($${idx++}, $${idx++}), 4326)`);
    values.push(fields.longitude, fields.latitude);
  }

  if (updates.length === 0) return res.status(400).json({ error: 'BadRequest', message: 'No fields to update' });

  values.push(req.params.id);
  const updated = await queryOne(
    `UPDATE events SET ${updates.join(', ')} WHERE id=$${idx} RETURNING *`,
    values
  );
  return res.json(updated);
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const event = await queryOne('SELECT organizer_id FROM events WHERE id=$1', [req.params.id]);
  if (!event) return res.status(404).json({ error: 'NotFound', message: 'Event not found' });
  if (event.organizer_id !== req.userId) return res.status(403).json({ error: 'Forbidden' });
  await query('UPDATE events SET archived=TRUE WHERE id=$1', [req.params.id]);
  return res.json({ ok: true });
});

router.post('/:id/rsvp', requireAuth, async (req: AuthRequest, res: Response) => {
  const event = await queryOne('SELECT id, max_attendees FROM events WHERE id=$1 AND archived=FALSE', [req.params.id]);
  if (!event) return res.status(404).json({ error: 'NotFound', message: 'Event not found' });

  if (event.max_attendees) {
    const count = await queryOne<{ count: string }>(
      'SELECT COUNT(*) FROM event_attendees WHERE event_id=$1',
      [req.params.id]
    );
    if (parseInt(count?.count ?? '0') >= event.max_attendees) {
      return res.status(409).json({ error: 'Conflict', message: 'Event is full' });
    }
  }

  await query(
    'INSERT INTO event_attendees (event_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
    [req.params.id, req.userId]
  );
  return res.json({ ok: true });
});

router.delete('/:id/rsvp', requireAuth, async (req: AuthRequest, res: Response) => {
  await query(
    'DELETE FROM event_attendees WHERE event_id=$1 AND user_id=$2',
    [req.params.id, req.userId]
  );
  return res.json({ ok: true });
});

router.get('/:id/attendees', async (req: Request, res: Response) => {
  const attendees = await query(
    `SELECT u.id, u.username, u.avatar_url, u.reputation_score, u.trade_count, u.location_label
     FROM event_attendees ea
     JOIN users u ON u.id = ea.user_id
     WHERE ea.event_id = $1
     ORDER BY ea.rsvp_at ASC`,
    [req.params.id]
  );
  return res.json(attendees);
});

export default router;
