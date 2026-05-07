import cron from 'node-cron';
import { query } from '../db/client';
import { createActivityEvent } from '../services/feedService';
import { runPriceSync } from './priceSync';

export function startJobs() {
  // Expire stale matches (hourly)
  cron.schedule('0 * * * *', async () => {
    try {
      const res = await query(`DELETE FROM trade_matches WHERE last_computed < NOW() - INTERVAL '24 hours'`);
      console.log('[jobs] Expired stale matches');
    } catch (err) {
      console.error('[jobs] match expiry error:', err);
    }
  });

  // Archive past events (daily 2am)
  cron.schedule('0 2 * * *', async () => {
    try {
      await query(`UPDATE events SET archived=TRUE WHERE starts_at < NOW() - INTERVAL '1 day' AND archived=FALSE`);
      console.log('[jobs] Archived past events');
    } catch (err) {
      console.error('[jobs] event cleanup error:', err);
    }
  });

  // Daily price sync (3am) — updates market_price_eur from Cardmarket via TCGdex for all languages
  cron.schedule('0 3 * * *', async () => {
    try {
      await runPriceSync();
    } catch (err) {
      console.error('[jobs] price sync error:', err);
    }
  });

  // Trend detection — hourly at :30 — fire new_match_area when card has ≥10 wants in 25km radius
  cron.schedule('30 * * * *', async () => {
    try {
      await detectTrends();
    } catch (err) {
      console.error('[jobs] trend detection error:', err);
    }
  });
}

async function detectTrends() {
  // Find cards with ≥10 new want entries in last hour, geo-clustered by user location
  const trendingCards = await query(`
    WITH recent_wants AS (
      SELECT uc.card_id, uc.user_id, uc.finish, u.location
      FROM user_cards uc
      JOIN users u ON u.id = uc.user_id
      WHERE uc.status = 'want'
        AND uc.created_at > NOW() - INTERVAL '1 hour'
        AND u.location IS NOT NULL
    )
    SELECT
      rw.card_id,
      c.name AS card_name,
      c.external_id,
      c.game,
      c.image_url,
      COUNT(*) AS want_count,
      ST_Y(ST_Centroid(ST_Collect(rw.location::geometry))) AS centroid_lat,
      ST_X(ST_Centroid(ST_Collect(rw.location::geometry))) AS centroid_lng
    FROM recent_wants rw
    JOIN cards c ON c.id = rw.card_id
    GROUP BY rw.card_id, c.name, c.external_id, c.game, c.image_url
    HAVING COUNT(*) >= 10
    LIMIT 5
  `);

  for (const trend of trendingCards) {
    // Build finish breakdown
    const finishRows = await query(
      `SELECT finish, COUNT(*) AS cnt FROM user_cards
       WHERE card_id=$1 AND status='want'
         AND created_at > NOW() - INTERVAL '1 hour'
         AND finish IS NOT NULL
       GROUP BY finish`,
      [trend.card_id]
    );
    const finish_breakdown: Record<string, number> = {};
    for (const r of finishRows) {
      if (r.finish) finish_breakdown[r.finish] = parseInt(r.cnt);
    }

    await createActivityEvent({
      type: 'new_match_area',
      actor_id: null,
      payload: {
        type: 'new_match_area',
        card_id: trend.card_id,
        card_name: trend.card_name,
        external_id: trend.external_id,
        game: trend.game,
        want_count: parseInt(trend.want_count),
        finish_breakdown,
      },
      lat: parseFloat(trend.centroid_lat),
      lng: parseFloat(trend.centroid_lng),
    });
  }

  if (trendingCards.length > 0) {
    console.log(`[jobs] Trend detection: ${trendingCards.length} trending cards`);
  }
}
