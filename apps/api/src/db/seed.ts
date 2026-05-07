import 'dotenv/config';
import { pool } from './client';
import bcrypt from 'bcryptjs';

// All seed users have password: seed1234
// Located within 25km of Duisburg, DE (lat 51.4344, lng 6.7623)

const SEED_USERS = [
  { username: 'seed_Marco_TCG',     email: 'marco@seed.binder',     location_label: 'Duisburg, DE',   lat: 51.4344, lng: 6.7623, reputation_score: 4.9, trade_count: 34, is_lgs: false },
  { username: 'seed_PokeTrader_DE', email: 'poke@seed.binder',      location_label: 'Duisburg, DE',   lat: 51.4401, lng: 6.7701, reputation_score: 4.7, trade_count: 21, is_lgs: false },
  { username: 'seed_LuffyFan92',    email: 'luffy@seed.binder',     location_label: 'Essen, DE',      lat: 51.4556, lng: 7.0116, reputation_score: 5.0, trade_count: 8,  is_lgs: false },
  { username: 'seed_NamiCollector', email: 'nami@seed.binder',      location_label: 'Düsseldorf, DE', lat: 51.2217, lng: 6.7762, reputation_score: 4.6, trade_count: 15, is_lgs: false },
  { username: 'seed_ZoroMain',      email: 'zoro@seed.binder',      location_label: 'Oberhausen, DE', lat: 51.4963, lng: 6.8637, reputation_score: 4.8, trade_count: 29, is_lgs: false },
  { username: 'seed_PikachuGirl',   email: 'pikachu@seed.binder',   location_label: 'Mülheim, DE',    lat: 51.4305, lng: 6.8824, reputation_score: 4.5, trade_count: 11, is_lgs: false },
  { username: 'seed_GardeWatcher',  email: 'garde@seed.binder',     location_label: 'Krefeld, DE',    lat: 51.3388, lng: 6.5853, reputation_score: 4.9, trade_count: 44, is_lgs: false },
  { username: 'seed_CardHouseLGS',  email: 'cardhouse@seed.binder', location_label: 'Duisburg, DE',   lat: 51.4350, lng: 6.7640, reputation_score: 4.8, trade_count: 0,  is_lgs: true  },
  { username: 'seed_TCGArenaEssen', email: 'tcgarena@seed.binder',  location_label: 'Essen, DE',      lat: 51.4521, lng: 7.0131, reputation_score: 4.7, trade_count: 0,  is_lgs: true  },
  { username: 'seed_NewTrader99',   email: 'newtrader@seed.binder', location_label: 'Duisburg, DE',   lat: 51.4380, lng: 6.7550, reputation_score: null, trade_count: 0, is_lgs: false },
];

// Cards: (is_seed: true, image from placehold.co)
const SEED_CARDS = [
  // One Piece OP01 Romance Dawn
  { external_id: 'OP01-060', name: 'Monkey D. Luffy',           game: 'one_piece', set_name: 'OP01 Romance Dawn',     set_code: 'OP01', rarity: 'Leader',     market_price_eur: 2800,
    finishes: [{ finish_id: 'standard', label: 'Standard', price: 2800 }, { finish_id: 'alt_art_holo', label: 'Alt Art Holo', price: 8500 }] },
  { external_id: 'OP01-016', name: 'Nami',                      game: 'one_piece', set_name: 'OP01 Romance Dawn',     set_code: 'OP01', rarity: 'Super Rare', market_price_eur: 1200,
    finishes: [{ finish_id: 'standard', label: 'Standard', price: 1200 }, { finish_id: 'holo', label: 'Holo', price: 1900 }] },
  { external_id: 'OP01-025', name: 'Roronoa Zoro',              game: 'one_piece', set_name: 'OP01 Romance Dawn',     set_code: 'OP01', rarity: 'Super Rare', market_price_eur: 900,
    finishes: [{ finish_id: 'standard', label: 'Standard', price: 900 }] },
  { external_id: 'OP01-002', name: 'Shanks',                    game: 'one_piece', set_name: 'OP01 Romance Dawn',     set_code: 'OP01', rarity: 'Secret Rare', market_price_eur: 14000,
    finishes: [{ finish_id: 'secret_rare', label: 'Secret Rare', price: 14000 }] },
  { external_id: 'OP01-120', name: 'Gum-Gum Pistol',            game: 'one_piece', set_name: 'OP01 Romance Dawn',     set_code: 'OP01', rarity: 'Uncommon',   market_price_eur: 150,
    finishes: [{ finish_id: 'standard', label: 'Standard', price: 150 }] },
  // One Piece OP02 Paramount War
  { external_id: 'OP02-001', name: 'Edward Newgate (Whitebeard)', game: 'one_piece', set_name: 'OP02 Paramount War', set_code: 'OP02', rarity: 'Leader',     market_price_eur: 3500,
    finishes: [{ finish_id: 'standard', label: 'Standard', price: 3500 }, { finish_id: 'alt_art_holo', label: 'Alt Art Holo', price: 9200 }] },
  { external_id: 'OP02-013', name: 'Portgas D. Ace',             game: 'one_piece', set_name: 'OP02 Paramount War', set_code: 'OP02', rarity: 'Super Rare', market_price_eur: 2200,
    finishes: [{ finish_id: 'standard', label: 'Standard', price: 2200 }, { finish_id: 'holo', label: 'Holo', price: 3100 }] },
  { external_id: 'OP02-099', name: 'Marco the Phoenix',          game: 'one_piece', set_name: 'OP02 Paramount War', set_code: 'OP02', rarity: 'Rare',       market_price_eur: 600,
    finishes: [{ finish_id: 'standard', label: 'Standard', price: 600 }] },
  // Pokemon SVI Scarlet & Violet
  { external_id: 'SVI-086', name: 'Gardevoir ex', game: 'pokemon', set_name: 'SVI Scarlet & Violet', set_code: 'SVI', rarity: 'Double Rare', market_price_eur: 1800,
    finishes: [{ finish_id: 'holo', label: 'Holo', price: 1800 }, { finish_id: 'full_art', label: 'Full Art', price: 4500 }] },
  { external_id: 'SVI-199', name: 'Charizard ex', game: 'pokemon', set_name: 'SVI Scarlet & Violet', set_code: 'SVI', rarity: 'Special Illustration Rare', market_price_eur: 9500,
    finishes: [{ finish_id: 'secret_rare', label: 'Special Illustration Rare', price: 9500 }, { finish_id: 'alt_art_holo', label: 'Alt Art Holo', price: 6200 }] },
  { external_id: 'SVI-012', name: 'Spidops ex',   game: 'pokemon', set_name: 'SVI Scarlet & Violet', set_code: 'SVI', rarity: 'Double Rare',   market_price_eur: 350,
    finishes: [{ finish_id: 'holo', label: 'Holo', price: 350 }] },
  { external_id: 'SVI-193', name: 'Arven',         game: 'pokemon', set_name: 'SVI Scarlet & Violet', set_code: 'SVI', rarity: 'Ultra Rare',    market_price_eur: 1100,
    finishes: [{ finish_id: 'full_art', label: 'Full Art', price: 1100 }, { finish_id: 'secret_rare', label: 'Rainbow Rare', price: 2800 }] },
  // Pokemon OBF Obsidian Flames
  { external_id: 'OBF-125', name: 'Charizard ex', game: 'pokemon', set_name: 'OBF Obsidian Flames', set_code: 'OBF', rarity: 'Double Rare', market_price_eur: 2200,
    finishes: [{ finish_id: 'holo', label: 'Holo', price: 2200 }, { finish_id: 'alt_art_holo', label: 'Special Illustration Rare', price: 12000 }] },
  { external_id: 'OBF-186', name: 'Pidgeot ex',   game: 'pokemon', set_name: 'OBF Obsidian Flames', set_code: 'OBF', rarity: 'Ultra Rare',   market_price_eur: 800,
    finishes: [{ finish_id: 'full_art', label: 'Full Art', price: 800 }] },
  { external_id: 'OBF-230', name: 'Charizard ex (HR)', game: 'pokemon', set_name: 'OBF Obsidian Flames', set_code: 'OBF', rarity: 'Hyper Rare', market_price_eur: 6800,
    finishes: [{ finish_id: 'secret_rare', label: 'Hyper Rare', price: 6800 }] },
];

// Binder entries: [username, status, external_id, finish, language, condition, edition, qty]
type BEntry = [string, 'want'|'have', string, string|null, string|null, string|null, string|null, number];
const SEED_BINDER: BEntry[] = [
  // seed_Marco_TCG
  ['seed_Marco_TCG', 'have', 'OP01-016', 'standard',     'EN', 'NM', 'unlimited', 2],
  ['seed_Marco_TCG', 'have', 'SVI-199',  'alt_art_holo', 'EN', 'NM', 'unlimited', 1],
  ['seed_Marco_TCG', 'have', 'OBF-186',  'full_art',     'EN', 'LP', 'unlimited', 1],
  ['seed_Marco_TCG', 'want', 'OP01-060', 'alt_art_holo', 'JP', 'NM', '1st_ed',   1],
  ['seed_Marco_TCG', 'want', 'SVI-086',  null,            'EN', null, null,        2], // any finish/cond
  ['seed_Marco_TCG', 'want', 'OP02-013', null,            null, null, null,        1], // any all

  // seed_LuffyFan92 — PERFECT MATCH with Marco
  ['seed_LuffyFan92', 'have', 'OP01-060', 'alt_art_holo', 'JP', 'NM', '1st_ed',   2],
  ['seed_LuffyFan92', 'have', 'SVI-086',  'holo',         'EN', 'NM', 'unlimited', 2],
  ['seed_LuffyFan92', 'want', 'OP01-016', null,            'EN', null, null,        1],
  ['seed_LuffyFan92', 'want', 'SVI-199',  null,            'EN', null, null,        1],

  // seed_PokeTrader_DE — PARTIAL MATCH with Marco
  ['seed_PokeTrader_DE', 'have', 'SVI-086',  'holo',     'EN', 'NM', 'unlimited', 1],
  ['seed_PokeTrader_DE', 'have', 'OBF-125',  'holo',     'EN', 'NM', 'unlimited', 1],
  ['seed_PokeTrader_DE', 'want', 'OP01-016', null,        null, null, null,        1],
  ['seed_PokeTrader_DE', 'want', 'OBF-230',  'secret_rare','EN','NM', null,        1],

  // seed_GardeWatcher — VALUE GAP with Marco
  ['seed_GardeWatcher', 'have', 'OP02-013', 'holo',     'EN', 'NM', 'unlimited', 1],
  ['seed_GardeWatcher', 'want', 'OBF-186',  null,        'EN', null, null,        1],
  ['seed_GardeWatcher', 'want', 'SVI-193',  'full_art',  'EN', 'NM', null,        1],

  // seed_ZoroMain
  ['seed_ZoroMain', 'have', 'OP01-025', 'standard',     'EN', 'NM', 'unlimited', 3],
  ['seed_ZoroMain', 'have', 'OBF-125',  'alt_art_holo', 'EN', 'LP', 'unlimited', 1],
  ['seed_ZoroMain', 'want', 'OP02-001', 'alt_art_holo', null, 'NM', null,        1],
  ['seed_ZoroMain', 'want', 'SVI-199',  null,            'EN', null, null,        1],

  // seed_NamiCollector
  ['seed_NamiCollector', 'have', 'OP02-001', 'alt_art_holo', 'JP', 'NM', '1st_ed',   1],
  ['seed_NamiCollector', 'have', 'SVI-193',  'full_art',     'EN', 'NM', 'unlimited', 2],
  ['seed_NamiCollector', 'want', 'OP01-025', null,            null, null, null,        2],
  ['seed_NamiCollector', 'want', 'OBF-125',  'holo',         'EN', 'NM', null,        1],

  // seed_PikachuGirl
  ['seed_PikachuGirl', 'have', 'OP01-002', 'secret_rare', 'EN', 'LP', 'unlimited', 1],
  ['seed_PikachuGirl', 'have', 'SVI-086',  'full_art',    'EN', 'NM', 'unlimited', 1],
  ['seed_PikachuGirl', 'want', 'OP02-099', null,           null, null, null,        2],
  ['seed_PikachuGirl', 'want', 'OBF-230',  'secret_rare', 'EN', 'NM', null,        1],

  // seed_NewTrader99
  ['seed_NewTrader99', 'have', 'OP01-120', 'standard', 'EN', 'NM', 'unlimited', 1],
  ['seed_NewTrader99', 'want', 'OP01-060', null,        null, null, null,        1],
];

async function seed() {
  const client = await pool.connect();

  try {
    console.log('🌱 Starting seed...');
    const passwordHash = await bcrypt.hash('seed1234', 12);

    // ─── Users ───────────────────────────────────────────────
    const userIds: Record<string, string> = {};
    for (const u of SEED_USERS) {
      const row = await client.query(
        `INSERT INTO users (username, email, password_hash, location, location_label, reputation_score, trade_count, is_lgs)
         VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, $7, $8, $9)
         ON CONFLICT (username) DO UPDATE SET
           email=EXCLUDED.email, location=EXCLUDED.location,
           location_label=EXCLUDED.location_label, reputation_score=EXCLUDED.reputation_score,
           trade_count=EXCLUDED.trade_count, is_lgs=EXCLUDED.is_lgs
         RETURNING id`,
        [u.username, u.email, passwordHash, u.lng, u.lat, u.location_label, u.reputation_score, u.trade_count, u.is_lgs]
      );
      userIds[u.username] = row.rows[0].id;
      process.stdout.write('.');
    }
    console.log('\n✅ Users seeded');

    // ─── Cards + Finishes ─────────────────────────────────────
    const cardIds: Record<string, string> = {};
    for (const c of SEED_CARDS) {
      const imageUrl = `https://placehold.co/245x342?text=${encodeURIComponent(c.external_id)}`;
      const row = await client.query(
        `INSERT INTO cards (external_id, name, game, set_name, set_code, rarity, image_url, market_price_eur, is_seed)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
         ON CONFLICT (external_id) DO UPDATE SET
           name=EXCLUDED.name, game=EXCLUDED.game, set_name=EXCLUDED.set_name,
           market_price_eur=EXCLUDED.market_price_eur, is_seed=TRUE
         RETURNING id`,
        [c.external_id, c.name, c.game, c.set_name, c.set_code, c.rarity, imageUrl, c.market_price_eur]
      );
      const cardId = row.rows[0].id;
      cardIds[c.external_id] = cardId;

      // Insert finishes
      for (const f of c.finishes) {
        await client.query(
          `INSERT INTO card_finishes (card_id, finish_id, label, image_url, market_price_eur)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (card_id, finish_id) DO UPDATE SET label=EXCLUDED.label, market_price_eur=EXCLUDED.market_price_eur`,
          [cardId, f.finish_id, f.label, imageUrl, f.price]
        );
      }
      process.stdout.write('.');
    }
    console.log('\n✅ Cards + finishes seeded');

    // ─── Binder entries ──────────────────────────────────────
    for (const [username, status, extId, finish, lang, cond, edition, qty] of SEED_BINDER) {
      const userId = userIds[username];
      const cardId = cardIds[extId];
      if (!userId || !cardId) { console.warn(`  Skip binder entry: ${username} / ${extId}`); continue; }

      await client.query(
        `INSERT INTO user_cards (user_id, card_id, status, quantity, finish, language, condition, edition)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT DO NOTHING`,
        [userId, cardId, status, qty, finish, lang, cond, edition]
      );
      process.stdout.write('.');
    }
    console.log('\n✅ Binder entries seeded');

    // ─── Completed trades ────────────────────────────────────
    const TRADES = [
      {
        a: 'seed_ZoroMain', b: 'seed_NamiCollector',
        a_gave: [{ external_id: 'OP01-025', name: 'Roronoa Zoro', finish: 'standard', language: 'EN', condition: 'NM' }],
        b_gave: [{ external_id: 'SVI-193',  name: 'Arven',        finish: 'full_art', language: 'EN', condition: 'NM' }],
        daysAgo: 3,
        ratings: [
          { rater: 'seed_ZoroMain',      ratee: 'seed_NamiCollector', score: 5, comment: 'Super fast, cards exactly as described!' },
          { rater: 'seed_NamiCollector', ratee: 'seed_ZoroMain',      score: 5, comment: 'Great trade.' },
        ],
      },
      {
        a: 'seed_GardeWatcher', b: 'seed_PikachuGirl',
        a_gave: [{ external_id: 'SVI-086', name: 'Gardevoir ex', finish: 'holo', language: 'EN', condition: 'NM' }],
        b_gave: [{ external_id: 'OBF-125', name: 'Charizard ex', finish: 'holo', language: 'EN', condition: 'NM' }],
        daysAgo: 5,
        ratings: [
          { rater: 'seed_GardeWatcher', ratee: 'seed_PikachuGirl', score: 4, comment: 'Good trade, card was LP not NM but fine.' },
          { rater: 'seed_PikachuGirl',  ratee: 'seed_GardeWatcher', score: 5, comment: null },
        ],
      },
      {
        a: 'seed_PokeTrader_DE', b: 'seed_Marco_TCG',
        a_gave: [{ external_id: 'OP02-099', name: 'Marco the Phoenix', finish: 'standard', language: 'EN', condition: 'NM' }],
        b_gave: [{ external_id: 'OBF-186',  name: 'Pidgeot ex',        finish: 'full_art', language: 'EN', condition: 'LP' }],
        daysAgo: 10,
        ratings: [
          { rater: 'seed_PokeTrader_DE', ratee: 'seed_Marco_TCG',    score: 5, comment: 'Pleasure to trade with!' },
          { rater: 'seed_Marco_TCG',     ratee: 'seed_PokeTrader_DE', score: 4, comment: 'Quick meetup, good condition.' },
        ],
      },
    ];

    for (const t of TRADES) {
      const aId = userIds[t.a];
      const bId = userIds[t.b];
      const completedAt = new Date(Date.now() - t.daysAgo * 86400000).toISOString();

      const tradeRow = await client.query(
        `INSERT INTO completed_trades (user_a_id, user_b_id, a_gave, b_gave, completed_at)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [aId, bId, JSON.stringify(t.a_gave), JSON.stringify(t.b_gave), completedAt]
      );
      const tradeId = tradeRow.rows[0].id;

      for (const r of t.ratings) {
        await client.query(
          `INSERT INTO trade_ratings (rater_id, ratee_id, completed_trade_id, score, comment)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [userIds[r.rater], userIds[r.ratee], tradeId, r.score, r.comment]
        );
      }
      process.stdout.write('.');
    }

    // Recalculate reputation from ratings
    await client.query(`
      UPDATE users SET reputation_score = (
        SELECT AVG(score) FROM (
          SELECT score FROM trade_ratings WHERE ratee_id=users.id ORDER BY created_at DESC LIMIT 20
        ) r
      )
      WHERE id IN (SELECT DISTINCT ratee_id FROM trade_ratings)
    `);
    console.log('\n✅ Completed trades + ratings seeded');

    // ─── Events ──────────────────────────────────────────────
    function nextWeekday(day: number, hour: number) {
      // day: 0=Sun, 1=Mon, ... 5=Fri, 6=Sat
      const now = new Date();
      const d = new Date(now);
      d.setHours(hour, 0, 0, 0);
      const diff = (day - now.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      return d.toISOString();
    }

    const EVENTS = [
      {
        organizer: 'seed_CardHouseLGS', title: 'Friday Night Pokémon',
        game: 'pokemon', event_type: 'locals',
        address: 'Königstraße 14, 47051 Duisburg', lat: 51.4350, lng: 6.7640,
        starts_at: nextWeekday(5, 18), ends_at: nextWeekday(5, 21),
        fee: 0, max: 24, recurring: 'weekly',
        rsvps: ['seed_Marco_TCG', 'seed_PokeTrader_DE', 'seed_PikachuGirl', 'seed_GardeWatcher'],
      },
      {
        organizer: 'seed_TCGArenaEssen', title: 'One Piece TCG Locals',
        game: 'one_piece', event_type: 'locals',
        address: 'Rüttenscheider Str. 32, 45130 Essen', lat: 51.4521, lng: 7.0131,
        starts_at: nextWeekday(6, 14), ends_at: nextWeekday(6, 18),
        fee: 500, max: 16, recurring: 'weekly',
        rsvps: ['seed_LuffyFan92', 'seed_ZoroMain', 'seed_NamiCollector'],
      },
      {
        organizer: 'seed_CardHouseLGS', title: 'Open Trade Table Sunday',
        game: 'all', event_type: 'trade_table',
        address: 'Königstraße 14, 47051 Duisburg', lat: 51.4350, lng: 6.7640,
        starts_at: nextWeekday(0, 12), ends_at: nextWeekday(0, 16),
        fee: 0, max: null, recurring: 'weekly',
        rsvps: ['seed_Marco_TCG', 'seed_NewTrader99', 'seed_PikachuGirl'],
      },
      {
        organizer: 'seed_ZoroMain', title: 'Casual One Piece Afternoon',
        game: 'one_piece', event_type: 'casual',
        address: 'Oberhausen, DE', lat: 51.4963, lng: 6.8637,
        starts_at: nextWeekday(6, 15), ends_at: null,
        fee: 0, max: 6, recurring: 'none',
        rsvps: ['seed_NamiCollector', 'seed_LuffyFan92'],
      },
    ];

    const eventIds: Record<string, string> = {};
    for (const ev of EVENTS) {
      const row = await client.query(
        `INSERT INTO events (organizer_id, title, game, event_type, location, address, starts_at, ends_at, entry_fee_eur, max_attendees, recurring)
         VALUES ($1,$2,$3,$4,ST_SetSRID(ST_MakePoint($5,$6),4326),$7,$8,$9,$10,$11,$12)
         RETURNING id`,
        [userIds[ev.organizer], ev.title, ev.game, ev.event_type, ev.lng, ev.lat,
         ev.address, ev.starts_at, ev.ends_at, ev.fee, ev.max, ev.recurring]
      );
      const eventId = row.rows[0].id;
      eventIds[ev.title] = eventId;

      for (const username of ev.rsvps) {
        await client.query(
          'INSERT INTO event_attendees (event_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [eventId, userIds[username]]
        );
      }
      process.stdout.write('.');
    }
    console.log('\n✅ Events seeded');

    // ─── Activity feed events ────────────────────────────────
    const FEED_EVENTS = [
      {
        type: 'trade_completed', actor: 'seed_ZoroMain',
        payload: { type: 'trade_completed', username_a: 'seed_ZoroMain', username_b: 'seed_NamiCollector',
          avatar_a: null, avatar_b: null, card_name: 'Roronoa Zoro OP01-025', game: 'one_piece', finish: 'standard', condition: 'NM' },
        lat: 51.4963, lng: 6.8637, hoursAgo: 3,
      },
      {
        type: 'new_member', actor: 'seed_NewTrader99',
        payload: { type: 'new_member', username: 'seed_NewTrader99', avatar_url: null, location_label: 'Duisburg, DE', games: ['one_piece'] },
        lat: 51.4380, lng: 6.7550, hoursAgo: 6,
      },
      {
        type: 'event_created', actor: 'seed_CardHouseLGS',
        payload: { type: 'event_created', event_id: '', title: 'Friday Night Pokémon',
          organizer: 'seed_CardHouseLGS', event_type: 'locals', starts_at: nextWeekday(5, 18),
          distance_km: 0.3, entry_fee_eur: 0, game: 'pokemon' },
        lat: 51.4350, lng: 6.7640, hoursAgo: 12,
      },
      {
        type: 'trade_completed', actor: 'seed_GardeWatcher',
        payload: { type: 'trade_completed', username_a: 'seed_GardeWatcher', username_b: 'seed_PikachuGirl',
          avatar_a: null, avatar_b: null, card_name: 'Gardevoir ex SVI-086', game: 'pokemon', finish: 'holo', condition: 'NM' },
        lat: 51.3388, lng: 6.5853, hoursAgo: 18,
      },
      {
        type: 'new_match_area', actor: null,
        payload: { type: 'new_match_area', card_id: '', card_name: 'Monkey D. Luffy', external_id: 'OP01-060',
          game: 'one_piece', want_count: 14, finish_breakdown: { alt_art_holo: 9, standard: 5 } },
        lat: 51.4344, lng: 6.7623, hoursAgo: 24,
      },
      {
        type: 'event_created', actor: 'seed_TCGArenaEssen',
        payload: { type: 'event_created', event_id: '', title: 'One Piece TCG Locals',
          organizer: 'seed_TCGArenaEssen', event_type: 'locals', starts_at: nextWeekday(6, 14),
          distance_km: 18.4, entry_fee_eur: 500, game: 'one_piece' },
        lat: 51.4521, lng: 7.0131, hoursAgo: 30,
      },
      {
        type: 'trade_completed', actor: 'seed_PokeTrader_DE',
        payload: { type: 'trade_completed', username_a: 'seed_PokeTrader_DE', username_b: 'seed_Marco_TCG',
          avatar_a: null, avatar_b: null, card_name: 'Marco the Phoenix OP02-099', game: 'one_piece', finish: 'standard', condition: 'NM' },
        lat: 51.4401, lng: 6.7701, hoursAgo: 48,
      },
    ];

    // Patch event_ids into payloads
    FEED_EVENTS[2].payload.event_id = eventIds['Friday Night Pokémon'] ?? '';
    FEED_EVENTS[5].payload.event_id = eventIds['One Piece TCG Locals'] ?? '';
    FEED_EVENTS[4].payload.card_id  = cardIds['OP01-060'] ?? '';

    for (const fe of FEED_EVENTS) {
      const createdAt = new Date(Date.now() - fe.hoursAgo * 3600000).toISOString();
      await client.query(
        `INSERT INTO activity_events (type, actor_id, payload, geo_point, created_at)
         VALUES ($1,$2,$3,ST_SetSRID(ST_MakePoint($4,$5),4326),$6)`,
        [fe.type, fe.actor ? userIds[fe.actor] : null, JSON.stringify(fe.payload), fe.lng, fe.lat, createdAt]
      );
      process.stdout.write('.');
    }
    console.log('\n✅ Activity feed events seeded');

    // ─── Pre-compute matches for seed_Marco_TCG ──────────────
    // Insert trade matches directly to demonstrate the 3 match types
    const marco = userIds['seed_Marco_TCG'];
    const luffy = userIds['seed_LuffyFan92'];
    const poke  = userIds['seed_PokeTrader_DE'];
    const garde = userIds['seed_GardeWatcher'];

    const distRows = await client.query(`
      SELECT
        ST_Distance(
          (SELECT location FROM users WHERE id=$1)::geography,
          (SELECT location FROM users WHERE id=$2)::geography
        ) / 1000 AS d1,
        ST_Distance(
          (SELECT location FROM users WHERE id=$1)::geography,
          (SELECT location FROM users WHERE id=$3)::geography
        ) / 1000 AS d2,
        ST_Distance(
          (SELECT location FROM users WHERE id=$1)::geography,
          (SELECT location FROM users WHERE id=$4)::geography
        ) / 1000 AS d3
    `, [marco, luffy, poke, garde]);

    const { d1, d2, d3 } = distRows.rows[0];

    const op01060 = cardIds['OP01-060'];
    const svi086  = cardIds['SVI-086'];
    const op01016 = cardIds['OP01-016'];
    const svi199  = cardIds['SVI-199'];
    const op02013 = cardIds['OP02-013'];
    const obf186  = cardIds['OBF-186'];
    const svi193  = cardIds['SVI-193'];

    // Perfect: Marco gets OP01-060 alt_art_holo JP NM + SVI-086 holo EN NM; Luffy gets OP01-016 + SVI-199
    await client.query(
      `INSERT INTO trade_matches (user_a_id, user_b_id, match_type, user_a_gets, user_b_gets, value_gap_eur, distance_km)
       VALUES ($1,$2,'perfect',$3,$4,$5,$6) ON CONFLICT (user_a_id, user_b_id) DO UPDATE
       SET match_type=EXCLUDED.match_type, user_a_gets=EXCLUDED.user_a_gets, user_b_gets=EXCLUDED.user_b_gets,
           value_gap_eur=EXCLUDED.value_gap_eur, distance_km=EXCLUDED.distance_km`,
      [marco, luffy,
       JSON.stringify([{ id: op01060, name: 'Monkey D. Luffy', external_id: 'OP01-060', game: 'one_piece', set_name: 'OP01 Romance Dawn', set_code: 'OP01', rarity: 'Leader', image_url: `https://placehold.co/245x342?text=OP01-060`, market_price_eur: 8500, finish: 'alt_art_holo', language: 'JP', condition: 'NM', edition: '1st_ed', quantity: 1 }, { id: svi086, name: 'Gardevoir ex', external_id: 'SVI-086', game: 'pokemon', set_name: 'SVI Scarlet & Violet', set_code: 'SVI', rarity: 'Double Rare', image_url: `https://placehold.co/245x342?text=SVI-086`, market_price_eur: 1800, finish: 'holo', language: 'EN', condition: 'NM', edition: 'unlimited', quantity: 1 }]),
       JSON.stringify([{ id: op01016, name: 'Nami', external_id: 'OP01-016', game: 'one_piece', set_name: 'OP01 Romance Dawn', set_code: 'OP01', rarity: 'Super Rare', image_url: `https://placehold.co/245x342?text=OP01-016`, market_price_eur: 1200, finish: 'standard', language: 'EN', condition: 'NM', edition: 'unlimited', quantity: 1 }, { id: svi199, name: 'Charizard ex', external_id: 'SVI-199', game: 'pokemon', set_name: 'SVI Scarlet & Violet', set_code: 'SVI', rarity: 'Special Illustration Rare', image_url: `https://placehold.co/245x342?text=SVI-199`, market_price_eur: 6200, finish: 'alt_art_holo', language: 'EN', condition: 'NM', edition: 'unlimited', quantity: 1 }]),
       0, parseFloat(d1)]
    );

    // Partial: Marco gets SVI-086 holo; PokeTrader gets OP01-016
    await client.query(
      `INSERT INTO trade_matches (user_a_id, user_b_id, match_type, user_a_gets, user_b_gets, value_gap_eur, distance_km)
       VALUES ($1,$2,'partial',$3,$4,$5,$6) ON CONFLICT (user_a_id, user_b_id) DO UPDATE
       SET match_type=EXCLUDED.match_type, user_a_gets=EXCLUDED.user_a_gets, user_b_gets=EXCLUDED.user_b_gets,
           value_gap_eur=EXCLUDED.value_gap_eur, distance_km=EXCLUDED.distance_km`,
      [marco, poke,
       JSON.stringify([{ id: svi086, name: 'Gardevoir ex', external_id: 'SVI-086', game: 'pokemon', set_name: 'SVI Scarlet & Violet', set_code: 'SVI', rarity: 'Double Rare', image_url: `https://placehold.co/245x342?text=SVI-086`, market_price_eur: 1800, finish: 'holo', language: 'EN', condition: 'NM', edition: 'unlimited', quantity: 1 }]),
       JSON.stringify([{ id: op01016, name: 'Nami', external_id: 'OP01-016', game: 'one_piece', set_name: 'OP01 Romance Dawn', set_code: 'OP01', rarity: 'Super Rare', image_url: `https://placehold.co/245x342?text=OP01-016`, market_price_eur: 1200, finish: 'standard', language: 'EN', condition: 'NM', edition: 'unlimited', quantity: 2 }]),
       600, parseFloat(d2)]
    );

    // Value gap: Marco gets OP02-013 holo (~€3100); GardeWatcher gets OBF-186 full_art (~€800)
    await client.query(
      `INSERT INTO trade_matches (user_a_id, user_b_id, match_type, user_a_gets, user_b_gets, value_gap_eur, distance_km)
       VALUES ($1,$2,'value_gap',$3,$4,$5,$6) ON CONFLICT (user_a_id, user_b_id) DO UPDATE
       SET match_type=EXCLUDED.match_type, user_a_gets=EXCLUDED.user_a_gets, user_b_gets=EXCLUDED.user_b_gets,
           value_gap_eur=EXCLUDED.value_gap_eur, distance_km=EXCLUDED.distance_km`,
      [marco, garde,
       JSON.stringify([{ id: op02013, name: 'Portgas D. Ace', external_id: 'OP02-013', game: 'one_piece', set_name: 'OP02 Paramount War', set_code: 'OP02', rarity: 'Super Rare', image_url: `https://placehold.co/245x342?text=OP02-013`, market_price_eur: 3100, finish: 'holo', language: 'EN', condition: 'NM', edition: 'unlimited', quantity: 1 }]),
       JSON.stringify([{ id: obf186, name: 'Pidgeot ex', external_id: 'OBF-186', game: 'pokemon', set_name: 'OBF Obsidian Flames', set_code: 'OBF', rarity: 'Ultra Rare', image_url: `https://placehold.co/245x342?text=OBF-186`, market_price_eur: 800, finish: 'full_art', language: 'EN', condition: 'LP', edition: 'unlimited', quantity: 1 }]),
       2300, parseFloat(d3)]
    );

    console.log('✅ Pre-computed trade matches seeded (perfect/partial/value_gap for seed_Marco_TCG)');
    console.log('\n🎉 Seed complete!');
    console.log('  Login: any seed_* user, password: seed1234');
    console.log('  Dev account: seed_Marco_TCG / seed1234');

  } catch (err) {
    console.error('❌ Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(e => { console.error(e); process.exit(1); });
