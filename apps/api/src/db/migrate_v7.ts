/**
 * Migration v7: Onboarding flow + Trade chat overhaul
 *
 * - users: onboarding_completed, onboarding_step, games[]
 * - conversations: status, trade_proposal, meetup_location, meetup_time, completed_by_a, completed_by_b
 * - messages: type, payload
 * - notifications table
 */
import 'dotenv/config';
import { pool } from './client';

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── users ──────────────────────────────────────────────────────────────
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS onboarding_step INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS games TEXT[] NOT NULL DEFAULT '{}'
    `);
    console.log('users: added onboarding_completed, onboarding_step, games');

    // ── conversations ──────────────────────────────────────────────────────
    await client.query(`
      ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS trade_proposal JSONB,
        ADD COLUMN IF NOT EXISTS meetup_location TEXT,
        ADD COLUMN IF NOT EXISTS meetup_time TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS completed_by_a BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS completed_by_b BOOLEAN NOT NULL DEFAULT false
    `);
    console.log('conversations: added status, trade_proposal, meetup_location, meetup_time, completed_by_a, completed_by_b');

    // ── messages ──────────────────────────────────────────────────────────
    await client.query(`
      ALTER TABLE messages
        ADD COLUMN IF NOT EXISTS type VARCHAR(32) NOT NULL DEFAULT 'text',
        ADD COLUMN IF NOT EXISTS payload JSONB
    `);
    console.log('messages: added type, payload');

    // ── notifications ─────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(64) NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        payload JSONB,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON notifications(user_id) WHERE read_at IS NULL`);
    console.log('notifications table created');

    await client.query('COMMIT');
    console.log('Migration v7 complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
