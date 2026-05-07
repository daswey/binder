import { query, queryOne } from '../db/client';
import { getIO } from '../sockets/io';

const DEFAULT_RADIUS_KM = 25;

// null on a want = "any" — always matches
// Condition rank: index 0 = best (NM), 4 = worst (Damaged)
const CONDITION_RANK: Record<string, number> = {
  NM: 0, LP: 1, MP: 2, HP: 3, Damaged: 4,
};

// A want with condition C accepts have with condition <= C (same or better)
// If want.condition is null → accept any condition
function conditionAccepted(wantCond: string | null, haveCond: string | null): boolean {
  if (!wantCond) return true; // null want = any
  if (!haveCond) return false; // have must have a condition
  return (CONDITION_RANK[haveCond] ?? 99) <= (CONDITION_RANK[wantCond] ?? 99);
}

function attrAccepted(wantVal: string | null, haveVal: string | null): boolean {
  if (!wantVal) return true; // null want = any
  if (!haveVal) return false;
  return wantVal === haveVal;
}

// Language matching: a JP Charizard ex and an EN Charizard ex are treated as distinct
// tradeable items. They share the same card name but are separate rows in the cards table.
// A want entry with language: null will match either.

function entryMatches(want: any, have: any): boolean {
  if (want.card_id !== have.card_id) return false;
  if (!attrAccepted(want.language, have.language)) return false;
  if (!attrAccepted(want.finish, have.finish)) return false;
  if (!attrAccepted(want.edition, have.edition)) return false;
  if (!conditionAccepted(want.condition, have.condition)) return false;
  return true;
}

export async function computeMatchesForUser(userId: string, radiusKm = DEFAULT_RADIUS_KM) {
  const user = await queryOne(
    'SELECT id, location FROM users WHERE id=$1 AND location IS NOT NULL',
    [userId]
  );
  if (!user) return;

  const nearbyUsers = await query(
    `SELECT id FROM users
     WHERE id != $1
       AND location IS NOT NULL
       AND ST_DWithin(location::geography, (SELECT location FROM users WHERE id=$1)::geography, $2)`,
    [userId, radiusKm * 1000]
  );

  for (const other of nearbyUsers) {
    await computePairMatch(userId, other.id);
  }
}

async function getUserCards(userId: string, status: 'want' | 'have') {
  return query(
    `SELECT uc.id AS entry_id, uc.card_id, uc.condition, uc.language, uc.finish, uc.edition, uc.quantity,
            c.id, c.name, c.game, c.set_name, c.set_code, c.rarity, c.image_url, c.market_price_eur, c.external_id
     FROM user_cards uc JOIN cards c ON c.id = uc.card_id
     WHERE uc.user_id=$1 AND uc.status=$2
       AND (uc.is_graded = false OR uc.include_in_trades = true)`,
    [userId, status]
  );
}

async function computePairMatch(userAId: string, userBId: string) {
  const [aWants, aHaves, bWants, bHaves] = await Promise.all([
    getUserCards(userAId, 'want'),
    getUserCards(userAId, 'have'),
    getUserCards(userBId, 'want'),
    getUserCards(userBId, 'have'),
  ]);

  // A gets: what A wants that B has
  const aGets = aWants.flatMap(want => {
    const matching = bHaves.filter(have => entryMatches(want, have));
    return matching.map(have => ({
      ...have,
      condition: have.condition,
      language: have.language,
      finish: have.finish,
      edition: have.edition,
      quantity: Math.min(want.quantity, have.quantity),
    }));
  });

  // B gets: what B wants that A has
  const bGets = bWants.flatMap(want => {
    const matching = aHaves.filter(have => entryMatches(want, have));
    return matching.map(have => ({
      ...have,
      condition: have.condition,
      language: have.language,
      finish: have.finish,
      edition: have.edition,
      quantity: Math.min(want.quantity, have.quantity),
    }));
  });

  if (aGets.length === 0 && bGets.length === 0) {
    await query(
      'DELETE FROM trade_matches WHERE (user_a_id=$1 AND user_b_id=$2) OR (user_a_id=$2 AND user_b_id=$1)',
      [userAId, userBId]
    );
    return;
  }

  const distRow = await queryOne<{ dist: number }>(
    `SELECT ST_Distance(
       (SELECT location FROM users WHERE id=$1)::geography,
       (SELECT location FROM users WHERE id=$2)::geography
     ) / 1000 AS dist`,
    [userAId, userBId]
  );
  const distanceKm = distRow?.dist ?? 0;

  const aValue = aGets.reduce((s: number, c: any) => s + (c.market_price_eur ?? 0) * c.quantity, 0);
  const bValue = bGets.reduce((s: number, c: any) => s + (c.market_price_eur ?? 0) * c.quantity, 0);
  const valueGap = aValue - bValue;

  let matchType: 'perfect' | 'partial' | 'value_gap';
  if (aGets.length > 0 && bGets.length > 0) {
    matchType = Math.abs(valueGap) > 500 ? 'value_gap' : 'perfect';
  } else {
    matchType = 'partial';
  }

  const existing = await queryOne(
    'SELECT id FROM trade_matches WHERE (user_a_id=$1 AND user_b_id=$2) OR (user_a_id=$2 AND user_b_id=$1)',
    [userAId, userBId]
  );
  const isNew = !existing;

  await query(
    `INSERT INTO trade_matches (user_a_id, user_b_id, match_type, user_a_gets, user_b_gets, value_gap_eur, distance_km)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_a_id, user_b_id)
     DO UPDATE SET match_type=$3, user_a_gets=$4, user_b_gets=$5, value_gap_eur=$6, distance_km=$7, last_computed=NOW()`,
    [userAId, userBId, matchType, JSON.stringify(aGets), JSON.stringify(bGets), valueGap, distanceKm]
  );

  // Notify via socket on new match
  if (isNew) {
    const io = getIO();
    if (io) {
      io.to(`user:${userAId}`).emit('match_update');
      io.to(`user:${userBId}`).emit('match_update');
    }
  }
}
