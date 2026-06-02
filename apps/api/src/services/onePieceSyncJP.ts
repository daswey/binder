/**
 * One Piece JP Sync — Bandai Japan Official Source
 *
 * Scrapes www.onepiece-cardgame.com/cardlist/ (JP site).
 * Stores cards with language='JP'. EN name fallback is handled at query time.
 */

import 'dotenv/config';
import { pool } from '../db/client';

const BANDAI_JP_BASE = 'https://www.onepiece-cardgame.com';
const CARDLIST_URL = `${BANDAI_JP_BASE}/cardlist/`;
const CARD_IMAGE_BASE = `${BANDAI_JP_BASE}/images/cardlist/card`;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Content-Type': 'application/x-www-form-urlencoded',
};

const DELAY_MS = 800;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&apos;/g, "'")
    .trim();
}

function inferVariantType(parallelId: string | null, rarity?: string): string | null {
  if (!parallelId) return null;
  if (/^r\d+$/.test(parallelId)) return 'manga_art';
  if (/^sp/i.test(parallelId)) return 'sp';
  if (rarity === 'SP CARD') return 'sp';
  if (/^p\d+$/.test(parallelId)) return 'alt_art';
  return 'alt_art';
}

function finishLabel(parallelId: string | null, variantType: string | null): string {
  if (!parallelId) return 'Standard';
  if (variantType === 'manga_art') return 'Manga Art';
  if (variantType === 'sp') return 'SP';
  const n = parseInt(parallelId.replace(/\D/g, ''), 10);
  return n > 1 ? `Alt Art ${n}` : 'Alt Art';
}

interface SeriesOption { id: string; name: string; setCode: string; }

function parseSeriesOptions(html: string): SeriesOption[] {
  const options: SeriesOption[] = [];
  const regex = /<option\s+value="(\d+)"[^>]*>([^<]+)<\/option>/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const id = m[1];
    const rawName = m[2].trim();
    const codeMatch = rawName.match(/\[([A-Z0-9\-]+)\]/);
    const setCode = codeMatch ? codeMatch[1].replace(/-/g, '') : '';
    options.push({ id, name: rawName, setCode });
  }
  return options;
}

interface CardRow {
  externalId: string;
  parallelId: string | null;
  variantType: string | null;
  name: string;
  rarity: string;
  setCode: string;
  setName: string;
  imageUrl: string;
  finishId: string;
  fLabel: string;
}

function parseCardsFromHtml(html: string, seriesName: string): CardRow[] {
  const cards: CardRow[] = [];
  const dlRegex = /<dl[^>]*\bid="([A-Z0-9]+-\d{3}[^"]*)"[^>]*>([\s\S]*?)<\/dl>/g;
  let m: RegExpExecArray | null;

  while ((m = dlRegex.exec(html)) !== null) {
    const bandaiId = m[1].trim();
    const content = m[2];

    const underscoreIdx = bandaiId.indexOf('_');
    const externalId = underscoreIdx >= 0 ? bandaiId.slice(0, underscoreIdx) : bandaiId;
    const parallelId = underscoreIdx >= 0 ? bandaiId.slice(underscoreIdx + 1) : null;

    const nameMatch = content.match(/<div[^>]*class="cardName"[^>]*>([^<]+)<\/div>/);
    const name = nameMatch ? stripTags(nameMatch[1]) : '';

    const infoSpans = content.match(/<div[^>]*class="infoCol"[^>]*>([\s\S]*?)<\/div>/);
    const spans = infoSpans
      ? (infoSpans[1].match(/<span[^>]*>([^<]+)<\/span>/g) || []).map(s => s.replace(/<[^>]+>/g, '').trim())
      : [];
    const rarity = spans[1] ?? '';

    const variantType = inferVariantType(parallelId, rarity);

    const imgMatch = content.match(/data-src="\.\.\/images\/cardlist\/card\/([^"]+)"/);
    const imgFile = imgMatch ? imgMatch[1].split('?')[0] : `${bandaiId}.png`;
    const imageUrl = `${CARD_IMAGE_BASE}/${imgFile}`;

    const setCode = externalId.split('-')[0];
    const getInfoMatch = content.match(/<div[^>]*class="getInfo"[^>]*>[\s\S]*?<\/h3>([\s\S]*?)<\/div>/);
    const setInfo = getInfoMatch ? stripTags(getInfoMatch[1]) : '';
    const setNameMatch = setInfo.match(/[-–](.+?)[-–]\s*\[/);
    const setName = setNameMatch ? setNameMatch[1].trim() : seriesName.replace(/\[.*?\]/g, '').trim();

    const fLabel = finishLabel(parallelId, variantType);
    const finishId = parallelId ?? 'standard';

    if (!name || !externalId) continue;

    cards.push({ externalId, parallelId, variantType, name, rarity, setCode, setName, imageUrl, finishId, fLabel });
  }

  return cards;
}

async function fetchCardlistPage(): Promise<string> {
  const res = await fetch(CARDLIST_URL, { method: 'GET', headers: HEADERS });
  if (!res.ok) throw new Error(`JP cardlist GET failed: ${res.status}`);
  return res.text();
}

async function fetchSeriesPage(seriesId: string): Promise<string> {
  const body = new URLSearchParams({ search: 'true', series: seriesId }).toString();
  const res = await fetch(CARDLIST_URL, { method: 'POST', headers: HEADERS, body });
  if (!res.ok) throw new Error(`JP series ${seriesId} failed: ${res.status}`);
  return res.text();
}

export async function syncOnePieceJP(): Promise<void> {
  console.log('[BandaiJP] Starting One Piece JP sync...');
  const client = await pool.connect();

  try {
    const mainHtml = await fetchCardlistPage();
    const allSeries = parseSeriesOptions(mainHtml);
    console.log(`[BandaiJP] Found ${allSeries.length} series`);

    let totalBase = 0;

    for (const series of allSeries) {
      const label = `${series.setCode || series.id} (${series.name.slice(0, 40)})`;
      console.log(`[BandaiJP] Fetching ${label}...`);

      let html: string;
      try {
        html = await fetchSeriesPage(series.id);
      } catch (err) {
        console.warn(`[BandaiJP] Failed ${label}: ${err}`);
        await sleep(DELAY_MS);
        continue;
      }

      const cards = parseCardsFromHtml(html, series.name);
      const bases = cards.filter(c => c.parallelId === null);
      const variants = cards.filter(c => c.parallelId !== null);

      console.log(`  → ${bases.length} base, ${variants.length} variants`);

      await client.query('BEGIN');
      try {
        // Upsert base cards
        for (const card of bases) {
          await client.query(
            `INSERT INTO cards (external_id, parallel_id, name, game, set_name, set_code, rarity, image_url, is_seed, language)
             VALUES ($1, NULL, $2, 'one_piece', $3, $4, $5, $6, true, 'JP')
             ON CONFLICT (external_id, language) WHERE parallel_id IS NULL
             DO UPDATE SET name=EXCLUDED.name, set_name=EXCLUDED.set_name, rarity=EXCLUDED.rarity, image_url=EXCLUDED.image_url`,
            [card.externalId, card.name, card.setName, card.setCode, card.rarity, card.imageUrl]
          );
        }

        // Upsert variant cards
        for (const card of variants) {
          await client.query(
            `INSERT INTO cards (external_id, parallel_id, variant_type, name, game, set_name, set_code, rarity, image_url, is_seed, language)
             VALUES ($1, $2, $3, $4, 'one_piece', $5, $6, $7, $8, true, 'JP')
             ON CONFLICT (external_id, parallel_id, language) WHERE parallel_id IS NOT NULL
             DO UPDATE SET name=EXCLUDED.name, variant_type=EXCLUDED.variant_type, set_name=EXCLUDED.set_name, rarity=EXCLUDED.rarity, image_url=EXCLUDED.image_url`,
            [card.externalId, card.parallelId, card.variantType, card.name, card.setName, card.setCode, card.rarity, card.imageUrl]
          );
        }

        // Upsert card_sets
        if (bases.length > 0) {
          const first = bases[0];
          await client.query(
            `INSERT INTO card_sets (id, name, language, card_count)
             VALUES ($1, $2, 'JP', $3)
             ON CONFLICT (id, language) DO UPDATE SET name=EXCLUDED.name, card_count=EXCLUDED.card_count`,
            [first.setCode, first.setName, bases.length]
          );
        }

        // Rebuild finishes for base cards
        const byBase = new Map<string, CardRow[]>();
        for (const card of cards) {
          const list = byBase.get(card.externalId) ?? [];
          list.push(card);
          byBase.set(card.externalId, list);
        }

        for (const [extId, variants] of byBase) {
          const baseRow = await client.query(
            `SELECT id FROM cards WHERE external_id=$1 AND parallel_id IS NULL AND language='JP' AND game='one_piece'`,
            [extId]
          );
          if (baseRow.rows.length === 0) continue;
          const baseId = baseRow.rows[0].id;

          for (const v of variants) {
            await client.query(
              `INSERT INTO card_finishes (card_id, finish_id, label, image_url, language)
               VALUES ($1, $2, $3, $4, 'JP')
               ON CONFLICT (card_id, finish_id) DO UPDATE SET label=EXCLUDED.label, image_url=EXCLUDED.image_url`,
              [baseId, v.finishId, v.fLabel, v.imageUrl]
            );
          }
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[BandaiJP] Error on ${label}:`, err);
      }

      totalBase += bases.length;
      await sleep(DELAY_MS);
    }

    console.log(`[BandaiJP] Sync complete. ${totalBase} base cards.`);
  } finally {
    client.release();
  }
}
