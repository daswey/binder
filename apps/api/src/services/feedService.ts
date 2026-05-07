import { query, queryOne } from '../db/client';
import { getIO } from '../sockets/io';

// ngeohash may not be installed — we'll inline a simple geohash encoder
function encodeGeohash(lat: number, lng: number, precision = 4): string {
  const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let idx = 0, bit = 0, evenBit = true, geohash = '';
  let minLat = -90, maxLat = 90, minLng = -180, maxLng = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      const mid = (minLng + maxLng) / 2;
      if (lng >= mid) { idx = idx * 2 + 1; minLng = mid; }
      else { idx = idx * 2; maxLng = mid; }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) { idx = idx * 2 + 1; minLat = mid; }
      else { idx = idx * 2; maxLat = mid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) { geohash += BASE32[idx]; bit = 0; idx = 0; }
  }
  return geohash;
}

export interface CreateActivityEventArgs {
  type: string;
  actor_id?: string | null;
  payload: Record<string, any>;
  lat: number;
  lng: number;
}

export async function createActivityEvent(args: CreateActivityEventArgs) {
  const { type, actor_id = null, payload, lat, lng } = args;

  const event = await queryOne(
    `INSERT INTO activity_events (type, actor_id, payload, geo_point)
     VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326))
     RETURNING id, type, actor_id, payload, created_at,
               ST_Y(geo_point::geometry) AS geo_lat,
               ST_X(geo_point::geometry) AS geo_lng`,
    [type, actor_id, JSON.stringify(payload), lng, lat]
  );

  // Broadcast to geohash room (precision 4 ≈ 40km cells)
  const io = getIO();
  if (io && event) {
    const geohash = encodeGeohash(lat, lng, 4);
    io.to(`geo:${geohash}`).emit('activity_event', { ...event, payload });
  }

  return event;
}

export interface FeedQuery {
  lat: number;
  lng: number;
  radiusKm?: number;
  limit?: number;
  cursor?: string;
}

export async function getFeed({ lat, lng, radiusKm = 25, limit = 20, cursor }: FeedQuery) {
  const params: any[] = [lng, lat, radiusKm * 1000, limit + 1];
  let cursorClause = '';

  if (cursor) {
    params.push(cursor);
    cursorClause = `AND ae.created_at < $${params.length}`;
  }

  const rows = await query(
    `SELECT ae.id, ae.type, ae.actor_id, ae.payload, ae.created_at,
            ST_Y(ae.geo_point::geometry) AS geo_lat,
            ST_X(ae.geo_point::geometry) AS geo_lng
     FROM activity_events ae
     WHERE ST_DWithin(ae.geo_point::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
       ${cursorClause}
     ORDER BY ae.created_at DESC
     LIMIT $4`,
    params
  );

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const next_cursor = hasMore ? data[data.length - 1]?.created_at ?? null : null;

  return {
    data: data.map((r: any) => ({
      ...r,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
    })),
    next_cursor,
  };
}
