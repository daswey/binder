import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import archiver from 'archiver';
import { stringify } from 'csv-stringify/sync';
import { query, queryOne } from '../db/client';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

const registerSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(8),
  location_label: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  agreed_to_terms: z.boolean().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

function signTokens(userId: string) {
  const access_token = jwt.sign({ sub: userId }, process.env.JWT_SECRET!, { expiresIn: '15m' });
  const refresh_token = jwt.sign({ sub: userId }, process.env.JWT_REFRESH_SECRET!, { expiresIn: '30d' });
  return { access_token, refresh_token };
}

async function storeRefreshToken(userId: string, token: string) {
  const hash = await bcrypt.hash(token, 6);
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hash, expires]
  );
}

router.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation', message: parsed.error.message });

  const { username, email, password, location_label, latitude, longitude, agreed_to_terms } = parsed.data;

  const existing = await queryOne('SELECT id FROM users WHERE email=$1 OR username=$2', [email, username]);
  if (existing) return res.status(409).json({ error: 'Conflict', message: 'Email or username already taken' });

  const password_hash = await bcrypt.hash(password, 12);
  const locationParam = latitude != null && longitude != null
    ? `ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)`
    : 'NULL';
  const agreedAt = agreed_to_terms ? 'NOW()' : 'NULL';

  const user = await queryOne(
    `INSERT INTO users (username, email, password_hash, location_label, location, agreed_to_terms_at)
     VALUES ($1, $2, $3, $4, ${locationParam}, ${agreedAt})
     RETURNING id, username, email, avatar_url, bio, location_label, reputation_score, trade_count, is_lgs, created_at, last_active`,
    [username, email, password_hash, location_label ?? '']
  );

  const { access_token, refresh_token } = signTokens(user.id);
  await storeRefreshToken(user.id, refresh_token);

  return res.status(201).json({ user, access_token, refresh_token });
});

router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation', message: parsed.error.message });

  const { email, password } = parsed.data;
  const user = await queryOne(
    'SELECT * FROM users WHERE email=$1',
    [email]
  );
  if (!user) return res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });

  await query('UPDATE users SET last_active=NOW() WHERE id=$1', [user.id]);

  const { access_token, refresh_token } = signTokens(user.id);
  await storeRefreshToken(user.id, refresh_token);

  const { password_hash: _, ...safeUser } = user;
  return res.json({ user: safeUser, access_token, refresh_token });
});

router.post('/refresh', async (req: Request, res: Response) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'BadRequest', message: 'Missing refresh_token' });

  let payload: { sub: string };
  try {
    payload = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET!) as { sub: string };
  } catch {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid refresh token' });
  }

  const tokens = await query(
    'SELECT * FROM refresh_tokens WHERE user_id=$1 AND expires_at > NOW()',
    [payload.sub]
  );

  let valid = false;
  for (const t of tokens) {
    if (await bcrypt.compare(refresh_token, t.token_hash)) { valid = true; break; }
  }
  if (!valid) return res.status(401).json({ error: 'Unauthorized', message: 'Refresh token not found' });

  const { access_token, refresh_token: new_refresh } = signTokens(payload.sub);
  await storeRefreshToken(payload.sub, new_refresh);

  return res.json({ access_token, refresh_token: new_refresh });
});

router.post('/logout', requireAuth, async (req: AuthRequest, res: Response) => {
  await query('DELETE FROM refresh_tokens WHERE user_id=$1', [req.userId]);
  return res.json({ ok: true });
});

router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await queryOne(
      `SELECT id, username, email, avatar_url, bio, location_label, reputation_score, trade_count,
              is_lgs, is_pro, pro_expires_at, onboarding_completed, onboarding_step, games,
              price_alert_count, agreed_to_terms_at, created_at, last_active,
              (SELECT COUNT(*) FROM notifications WHERE user_id = u.id AND read_at IS NULL) AS unread_notifications
       FROM users u WHERE u.id=$1 AND u.deleted_at IS NULL`,
      [req.userId]
    );
    if (!user) return res.status(404).json({ error: 'NotFound', message: 'User not found' });
    return res.json({ ...user, unread_notifications: parseInt(user.unread_notifications ?? '0') });
  } catch (err: any) {
    console.error('[/me error]', err?.message);
    return res.status(500).json({ error: 'InternalError', message: err?.message ?? 'Unknown error' });
  }
});

const updateMeSchema = z.object({
  bio: z.string().max(500).optional(),
  location_label: z.string().max(100).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  avatar_url: z.string().url().optional(),
});

const onboardingSchema = z.object({
  step: z.number().int().min(0).max(3).optional(),
  games: z.array(z.string()).optional(),
  location_label: z.string().max(100).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  completed: z.boolean().optional(),
});

router.patch('/me/onboarding', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = onboardingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation', message: parsed.error.message });

  const { step, games, location_label, latitude, longitude, completed } = parsed.data;
  const updates: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (step !== undefined) { updates.push(`onboarding_step=$${idx++}`); values.push(step); }
  if (games !== undefined) { updates.push(`games=$${idx++}`); values.push(games); }
  if (location_label !== undefined) { updates.push(`location_label=$${idx++}`); values.push(location_label); }
  if (latitude != null && longitude != null) {
    updates.push(`location=ST_SetSRID(ST_MakePoint($${idx++}, $${idx++}), 4326)`);
    values.push(longitude, latitude);
  }
  if (completed !== undefined) { updates.push(`onboarding_completed=$${idx++}`); values.push(completed); }

  if (updates.length === 0) return res.status(400).json({ error: 'BadRequest', message: 'No fields to update' });

  values.push(req.userId);
  const user = await queryOne(
    `UPDATE users SET ${updates.join(', ')} WHERE id=$${idx}
     RETURNING id, username, email, avatar_url, bio, location_label, reputation_score, trade_count,
               is_lgs, onboarding_completed, onboarding_step, games, created_at, last_active`,
    values
  );
  return res.json(user);
});

router.get('/me/export', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await queryOne(
      `SELECT id, username, email, bio, location_label, reputation_score, trade_count,
              is_lgs, is_pro, created_at, last_active
       FROM users WHERE id=$1`,
      [req.userId]
    );
    if (!user) return res.status(404).json({ error: 'NotFound', message: 'User not found' });

    const [binderEntries, trades, ratingsGiven, ratingsReceived] = await Promise.all([
      query(
        `SELECT uc.status, uc.quantity, uc.condition, uc.language, uc.edition, uc.finish,
                uc.notes, uc.created_at,
                c.name AS card_name, c.external_id AS card_id, c.game,
                c.set_name, c.rarity, c.market_price_eur
         FROM user_cards uc
         JOIN cards c ON c.id = uc.card_id
         WHERE uc.user_id = $1
         ORDER BY uc.status, c.game, c.set_name, c.external_id`,
        [req.userId]
      ),
      query(
        `SELECT ct.completed_at,
                ua.username AS traded_with,
                (ct.user_a_id = $1) AS i_was_user_a,
                ct.a_gave, ct.b_gave
         FROM completed_trades ct
         JOIN users ua ON ua.id = CASE
           WHEN ct.user_a_id = $1 THEN ct.user_b_id
           ELSE ct.user_a_id
         END
         WHERE ct.user_a_id = $1 OR ct.user_b_id = $1
         ORDER BY ct.completed_at DESC`,
        [req.userId]
      ),
      query(
        `SELECT tr.score, tr.comment, tr.created_at, u.username AS rated_user
         FROM trade_ratings tr
         JOIN users u ON u.id = tr.ratee_id
         WHERE tr.rater_id = $1
         ORDER BY tr.created_at DESC`,
        [req.userId]
      ),
      query(
        `SELECT tr.score, tr.comment, tr.created_at, u.username AS rated_user
         FROM trade_ratings tr
         JOIN users u ON u.id = tr.rater_id
         WHERE tr.ratee_id = $1
         ORDER BY tr.created_at DESC`,
        [req.userId]
      ),
    ]);

    const exportDate = new Date().toISOString().split('T')[0];
    const filename = `binder-export-${user.username}-${exportDate}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(res);

    // ── profile.csv ──────────────────────────────────────────────────────
    const profileCsv = stringify([
      ['Field', 'Value'],
      ['Username',         user.username],
      ['Email',            user.email],
      ['Location',         user.location_label || '—'],
      ['Bio',              user.bio || '—'],
      ['Member since',     exportFormatDate(user.created_at)],
      ['Last active',      exportFormatDate(user.last_active)],
      ['Reputation score', user.reputation_score != null ? Number(user.reputation_score).toFixed(1) : 'No ratings yet'],
      ['Trades completed', user.trade_count ?? 0],
      ['Account type',     user.is_pro ? 'Binder Pro' : 'Free'],
      ['Exported at',      exportFormatDate(new Date())],
    ]);
    archive.append(profileCsv, { name: 'profile.csv' });

    // ── binder.csv ───────────────────────────────────────────────────────
    const binderRows = binderEntries.map((row: any) => ({
      'Status':       row.status === 'have' ? 'Have (trade bait)' : 'Want',
      'Card name':    row.card_name,
      'Card ID':      row.card_id,
      'Game':         row.game === 'pokemon' ? 'Pokémon TCG' : 'One Piece TCG',
      'Set':          row.set_name,
      'Rarity':       row.rarity || '—',
      'Quantity':     row.quantity,
      'Condition':    row.condition || '—',
      'Language':     row.language || '—',
      'Edition':      row.edition || '—',
      'Finish':       exportFormatFinish(row.finish),
      'Price (EUR)':  row.market_price_eur != null ? `€${(row.market_price_eur / 100).toFixed(2)}` : '—',
      'Notes':        row.notes || '—',
      'Added on':     exportFormatDate(row.created_at),
    }));
    const binderCsv = binderRows.length > 0
      ? stringify(binderRows, { header: true })
      : stringify([['No cards in binder yet']]);
    archive.append(binderCsv, { name: 'binder.csv' });

    // ── trades.csv ───────────────────────────────────────────────────────
    const tradeRows = trades.map((row: any) => {
      const iWasA = row.i_was_user_a;
      const iGave     = (typeof row.a_gave === 'string' ? JSON.parse(row.a_gave) : (row.a_gave ?? [])) as any[];
      const iReceived = (typeof row.b_gave === 'string' ? JSON.parse(row.b_gave) : (row.b_gave ?? [])) as any[];
      const myGave     = iWasA ? iGave : iReceived;
      const myReceived = iWasA ? iReceived : iGave;
      return {
        'Date':         exportFormatDate(row.completed_at),
        'Traded with':  row.traded_with,
        'I gave':       myGave.map((c: any) => `${c.name} (${c.external_id}) · ${exportFormatFinish(c.finish)} · ${c.language || '—'} · ${c.condition || '—'}`).join(' | ') || '—',
        'I received':   myReceived.map((c: any) => `${c.name} (${c.external_id}) · ${exportFormatFinish(c.finish)} · ${c.language || '—'} · ${c.condition || '—'}`).join(' | ') || '—',
      };
    });
    const tradesCsv = tradeRows.length > 0
      ? stringify(tradeRows, { header: true })
      : stringify([['No completed trades yet']]);
    archive.append(tradesCsv, { name: 'trades.csv' });

    // ── ratings.csv ──────────────────────────────────────────────────────
    const ratingRows = [
      ...ratingsGiven.map((row: any) => ({ ...row, direction: 'given' })),
      ...ratingsReceived.map((row: any) => ({ ...row, direction: 'received' })),
    ]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map((row: any) => ({
        'Direction': row.direction === 'given' ? 'I rated them' : 'They rated me',
        'User':      row.rated_user,
        'Score':     `${row.score}/5`,
        'Stars':     '★'.repeat(row.score) + '☆'.repeat(5 - row.score),
        'Comment':   row.comment || '—',
        'Date':      exportFormatDate(row.created_at),
      }));
    const ratingsCsv = ratingRows.length > 0
      ? stringify(ratingRows, { header: true })
      : stringify([['No ratings yet']]);
    archive.append(ratingsCsv, { name: 'ratings.csv' });

    await archive.finalize();
  } catch (err: any) {
    console.error('[export]', err);
    if (!res.headersSent) res.status(500).json({ error: 'InternalError', message: err?.message });
  }
});

function exportFormatDate(date: Date | string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function exportFormatFinish(finish: string | null): string {
  const labels: Record<string, string> = {
    standard: 'Standard', holo: 'Holo', reverse_holo: 'Reverse Holo',
    full_art: 'Full Art', secret_rare: 'Secret Rare', alt_art_holo: 'Alt Art Holo',
    manga_art: 'Manga Art', first_edition: '1st Edition', promo: 'Promo',
  };
  return finish ? (labels[finish] ?? finish) : '—';
}

router.delete('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { confirm } = req.body;
    if (confirm !== 'DELETE') {
      return res.status(400).json({ error: 'BadRequest', message: 'Must send { confirm: "DELETE" }' });
    }
    // Soft-delete: anonymise PII, set deleted_at
    await query(
      `UPDATE users SET
         email = 'deleted_' || id || '@binder.deleted',
         username = 'deleted_' || LEFT(id::text, 8),
         password_hash = '',
         avatar_url = NULL,
         bio = NULL,
         location_label = NULL,
         location = NULL,
         deleted_at = NOW()
       WHERE id=$1`,
      [req.userId]
    );
    // Invalidate all sessions
    await query('DELETE FROM refresh_tokens WHERE user_id=$1', [req.userId]);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'InternalError', message: err?.message });
  }
});

router.patch('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation', message: parsed.error.message });

  const { bio, location_label, latitude, longitude, avatar_url } = parsed.data;
  const updates: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (bio !== undefined) { updates.push(`bio=$${idx++}`); values.push(bio); }
  if (location_label !== undefined) { updates.push(`location_label=$${idx++}`); values.push(location_label); }
  if (avatar_url !== undefined) { updates.push(`avatar_url=$${idx++}`); values.push(avatar_url); }
  if (latitude != null && longitude != null) {
    updates.push(`location=ST_SetSRID(ST_MakePoint($${idx++}, $${idx++}), 4326)`);
    values.push(longitude, latitude);
  }

  if (updates.length === 0) return res.status(400).json({ error: 'BadRequest', message: 'No fields to update' });

  values.push(req.userId);
  const user = await queryOne(
    `UPDATE users SET ${updates.join(', ')}, last_active=NOW() WHERE id=$${idx}
     RETURNING id, username, email, avatar_url, bio, location_label, reputation_score, trade_count, is_lgs, created_at, last_active`,
    values
  );
  return res.json(user);
});

export default router;
