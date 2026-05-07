import 'dotenv/config';
import { pool } from './client';

const schema = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  location GEOGRAPHY(POINT, 4326),
  location_label VARCHAR(100) NOT NULL DEFAULT '',
  reputation_score FLOAT DEFAULT 0,
  trade_count INTEGER DEFAULT 0,
  is_lgs BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_location_idx ON users USING GIST(location);

CREATE TABLE IF NOT EXISTS cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  game VARCHAR(20) NOT NULL CHECK (game IN ('pokemon', 'one_piece')),
  set_name VARCHAR(255) NOT NULL,
  set_code VARCHAR(50) NOT NULL,
  rarity VARCHAR(100) NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  market_price_eur INTEGER DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cards_name_idx ON cards USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS cards_game_idx ON cards(game);
CREATE INDEX IF NOT EXISTS cards_external_id_idx ON cards(external_id);

CREATE TABLE IF NOT EXISTS user_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  status VARCHAR(10) NOT NULL CHECK (status IN ('want', 'have')),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, card_id, status)
);

CREATE INDEX IF NOT EXISTS user_cards_user_status_idx ON user_cards(user_id, status);
CREATE INDEX IF NOT EXISTS user_cards_card_idx ON user_cards(card_id);

CREATE TABLE IF NOT EXISTS trade_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_a_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_type VARCHAR(20) NOT NULL CHECK (match_type IN ('perfect', 'partial', 'value_gap')),
  user_a_gets JSONB NOT NULL DEFAULT '[]',
  user_b_gets JSONB NOT NULL DEFAULT '[]',
  value_gap_eur INTEGER NOT NULL DEFAULT 0,
  distance_km FLOAT NOT NULL,
  last_computed TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_a_id, user_b_id)
);

CREATE INDEX IF NOT EXISTS trade_matches_user_a_idx ON trade_matches(user_a_id);
CREATE INDEX IF NOT EXISTS trade_matches_user_b_idx ON trade_matches(user_b_id);

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trade_match_id UUID REFERENCES trade_matches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS conv_participants_user_idx ON conversation_participants(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS trade_ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rater_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ratee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_match_id UUID NOT NULL REFERENCES trade_matches(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(rater_id, trade_match_id)
);

CREATE TABLE IF NOT EXISTS events (
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
  archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS events_location_idx ON events USING GIST(location);
CREATE INDEX IF NOT EXISTS events_starts_at_idx ON events(starts_at);

CREATE TABLE IF NOT EXISTS event_attendees (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rsvp_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens(user_id);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(schema);
    console.log('Migration complete');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
