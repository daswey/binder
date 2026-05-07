import 'dotenv/config';
import { pool } from './client';

// Drop all and recreate with v3 schema (correct attribute enums, card_finishes, activity_events)
const schema = `
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

-- Drop in reverse dependency order
DROP TABLE IF EXISTS activity_events CASCADE;
DROP TABLE IF EXISTS event_attendees CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS trade_ratings CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversation_participants CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS trade_matches CASCADE;
DROP TABLE IF EXISTS completed_trades CASCADE;
DROP TABLE IF EXISTS user_cards CASCADE;
DROP TABLE IF EXISTS card_finishes CASCADE;
DROP TABLE IF EXISTS cards CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  location GEOGRAPHY(POINT, 4326),
  location_label VARCHAR(100) NOT NULL DEFAULT '',
  reputation_score FLOAT DEFAULT NULL,
  trade_count INTEGER NOT NULL DEFAULT 0,
  is_lgs BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX users_location_gist ON users USING GIST(location);

-- Cards
CREATE TABLE cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  game VARCHAR(20) NOT NULL CHECK (game IN ('pokemon', 'one_piece')),
  set_name VARCHAR(255) NOT NULL DEFAULT '',
  set_code VARCHAR(50) NOT NULL DEFAULT '',
  rarity VARCHAR(100) NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  market_price_eur INTEGER DEFAULT NULL,
  is_seed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX cards_name_fts ON cards USING gin(to_tsvector('simple', name || ' ' || external_id));
CREATE INDEX cards_game_idx ON cards(game);
CREATE INDEX cards_external_id_idx ON cards(external_id);

-- Card finishes (per-card finish variants with optional different art/price)
CREATE TABLE card_finishes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  finish_id VARCHAR(30) NOT NULL CHECK (finish_id IN ('standard','holo','reverse_holo','full_art','secret_rare','alt_art_holo')),
  label VARCHAR(100) NOT NULL,
  image_url TEXT NOT NULL DEFAULT '',
  market_price_eur INTEGER DEFAULT NULL,
  UNIQUE(card_id, finish_id)
);

CREATE INDEX card_finishes_card_idx ON card_finishes(card_id);

-- User binder entries (want/have lists)
CREATE TABLE user_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  status VARCHAR(10) NOT NULL CHECK (status IN ('want', 'have')),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1 AND quantity <= 10),
  -- null = "any" on want entries; must be set on have entries
  condition VARCHAR(10) CHECK (condition IN ('NM','LP','MP','HP','Damaged')),
  language VARCHAR(5) CHECK (language IN ('EN','JP','DE','FR','ES','IT','PT','KO','ZH')),
  edition VARCHAR(20) CHECK (edition IN ('1st_ed','unlimited','alt_art','promo','reprint')),
  finish VARCHAR(20) CHECK (finish IN ('standard','holo','reverse_holo','full_art','secret_rare','alt_art_holo')),
  notes VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX user_cards_user_status ON user_cards(user_id, status);
CREATE INDEX user_cards_card_id ON user_cards(card_id);

-- Trade matches (cached, expires 24h)
CREATE TABLE trade_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_a_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_type VARCHAR(20) NOT NULL CHECK (match_type IN ('perfect', 'partial', 'value_gap')),
  user_a_gets JSONB NOT NULL DEFAULT '[]',
  user_b_gets JSONB NOT NULL DEFAULT '[]',
  value_gap_eur INTEGER NOT NULL DEFAULT 0,
  distance_km FLOAT NOT NULL,
  last_computed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_a_id, user_b_id)
);

CREATE INDEX trade_matches_user_a ON trade_matches(user_a_id);
CREATE INDEX trade_matches_user_b ON trade_matches(user_b_id);
CREATE INDEX trade_matches_computed ON trade_matches(last_computed);

-- Completed trades (permanent record after trade_match is resolved)
CREATE TABLE completed_trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_a_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  a_gave JSONB NOT NULL DEFAULT '[]',
  b_gave JSONB NOT NULL DEFAULT '[]',
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX completed_trades_user_a ON completed_trades(user_a_id);
CREATE INDEX completed_trades_user_b ON completed_trades(user_b_id);

-- Conversations (DMs, optionally linked to a trade match)
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trade_match_id UUID REFERENCES trade_matches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE conversation_participants (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX conv_participants_user_idx ON conversation_participants(user_id);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX messages_conversation_idx ON messages(conversation_id, created_at DESC);

-- Trade ratings
CREATE TABLE trade_ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rater_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ratee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_trade_id UUID NOT NULL REFERENCES completed_trades(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rater_id, completed_trade_id)
);

-- Events
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organizer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  game VARCHAR(20) NOT NULL CHECK (game IN ('pokemon', 'one_piece', 'all')),
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('tournament', 'locals', 'trade_table', 'casual')),
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  address TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  entry_fee_eur INTEGER NOT NULL DEFAULT 0,
  max_attendees INTEGER,
  recurring VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (recurring IN ('none', 'weekly', 'biweekly', 'monthly')),
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX events_location_gist ON events USING GIST(location);
CREATE INDEX events_starts_at_idx ON events(starts_at);

CREATE TABLE event_attendees (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rsvp_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

-- Activity feed events (geo-tagged)
CREATE TABLE activity_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(30) NOT NULL CHECK (type IN ('trade_completed','new_member','event_created','new_match_area')),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  geo_point GEOGRAPHY(POINT, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX activity_events_geo_gist ON activity_events USING GIST(geo_point);
CREATE INDEX activity_events_created ON activity_events(created_at DESC);

-- Refresh tokens
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX refresh_tokens_user_idx ON refresh_tokens(user_id);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(schema);
    console.log('v3 migration complete');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(e => { console.error(e); process.exit(1); });
