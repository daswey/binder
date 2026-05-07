/**
 * One Piece Sync — Bandai Official Source
 *
 * Scrapes en.onepiece-cardgame.com/cardlist/ as the canonical card list.
 * - Every DL item with id="OP01-120" or id="OP01-120_p1" becomes a card row.
 * - parallel_id is null for base cards, "p1"/"r1"/etc. for variants.
 * - variant_type is inferred: r* → manga_art, p* → alt_art, null → base.
 * - card_finishes are rebuilt from all variants per base card.
 * - Prices are NOT set here; use syncOnePiecePrices() from optcgapi.
 */

import 'dotenv/config';
import { pool } from '../db/client';

const BANDAI_BASE = 'https://en.onepiece-cardgame.com';
const CARDLIST_URL = `${BANDAI_BASE}/cardlist/`;
const CARD_IMAGE_BASE = `${BANDAI_BASE}/images/cardlist/card`;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Content-Type': 'application/x-www-form-urlencoded',
};

// Delay between series requests to be polite
const DELAY_MS = 800;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BandaiCard {
  /** Full Bandai card id e.g. "OP01-120" or "OP01-120_p1" */
  bandaiId: string;
  /** Base card number without parallel suffix e.g. "OP01-120" */
  externalId: string;
  /** Parallel suffix if present e.g. "p1", "r1", null for base */
  parallelId: string | null;
  /** Semantic variant type */
  variantType: string | null;
  name: string;
  rarity: string;
  cardType: string; // CHARACTER | LEADER | EVENT | STAGE
  color: string | null;
  setCode: string;    // e.g. "OP01"
  setName: string;    // from .getInfo
  cost: string | null;
  power: string | null;
  counter: string | null;
  life: string | null;
  attribute: string | null;
  feature: string | null; // sub-types / character types
  effectText: string | null;
  imageUrl: string;
  /** Human-readable finish label */
  finishLabel: string;
  /** finish_id for card_finishes */
  finishId: string;
}

interface SeriesOption {
  id: string;
  name: string;
  setCode: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Derive variant_type from the parallel suffix and rarity.
 * r*    = manga_art  (Premium Booster romance/manga art variants)
 * sp*   = sp         (SP gold explicit suffix)
 * p*    = alt_art    (standard parallel alt-art variants)
 * SP CARD rarity overrides → sp
 */
function inferVariantType(parallelId: string | null, rarity?: string): string | null {
  if (!parallelId) return null;
  if (/^r\d+$/.test(parallelId)) return 'manga_art';
  if (/^sp/i.test(parallelId)) return 'sp';
  if (rarity === 'SP CARD') return 'sp';
  if (/^p\d+$/.test(parallelId)) return 'alt_art';
  return 'alt_art'; // fallback for any unknown suffix
}

/**
 * Human-readable label for a parallel variant.
 */
function finishLabel(parallelId: string | null, variantType: string | null): string {
  if (!parallelId) return 'Standard';
  if (variantType === 'manga_art') return 'Manga Art';
  if (variantType === 'sp') return 'SP';
  // alt_art with numbered parallels (p1 = plain "Alt Art", p2+ = "Alt Art 2" etc.)
  const n = parseInt(parallelId.replace(/\D/g, ''), 10);
  return n > 1 ? `Alt Art ${n}` : 'Alt Art';
}

/** Extract set code from card external_id e.g. "OP01-120" → "OP01" */
function extractSetCode(externalId: string): string {
  return externalId.split('-')[0];
}

/** Strip HTML tags and decode common HTML entities */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

// ---------------------------------------------------------------------------
// HTML Parsing
// ---------------------------------------------------------------------------

/**
 * Parse all series options from the cardlist page HTML.
 * Returns series with known set codes (excludes non-standard series IDs).
 */
function parseSeriesOptions(html: string): SeriesOption[] {
  const options: SeriesOption[] = [];
  const regex = /<option\s+value="(\d+)"[^>]*>([^<]+)<\/option>/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const id = m[1];
    const rawName = m[2].trim();
    // Extract set code from brackets e.g. "[OP-01]" or "[ST-01]" or "[PRB-01]"
    const codeMatch = rawName.match(/\[([A-Z0-9\-]+)\]/);
    const setCode = codeMatch ? codeMatch[1].replace(/-/g, '') : '';
    options.push({ id, name: rawName, setCode });
  }
  return options;
}

/**
 * Parse all card items from a cardlist HTML page for a given series.
 * Returns one BandaiCard per DL item (one per variant).
 */
function parseCardsFromHtml(html: string, seriesName: string): BandaiCard[] {
  const cards: BandaiCard[] = [];

  // Match each <dl ... id="CARD_ID"> ... </dl>
  const dlRegex = /<dl[^>]*\bid="([A-Z0-9]+-\d{3}[^"]*)"[^>]*>([\s\S]*?)<\/dl>/g;
  let m: RegExpExecArray | null;

  while ((m = dlRegex.exec(html)) !== null) {
    const bandaiId = m[1].trim();
    const content = m[2];

    // base card number vs parallel
    const underscoreIdx = bandaiId.indexOf('_');
    const externalId = underscoreIdx >= 0 ? bandaiId.slice(0, underscoreIdx) : bandaiId;
    const parallelId = underscoreIdx >= 0 ? bandaiId.slice(underscoreIdx + 1) : null;

    // Name from .cardName (decode HTML entities)
    const nameMatch = content.match(/<div[^>]*class="cardName"[^>]*>([^<]+)<\/div>/);
    const name = nameMatch ? stripTags(nameMatch[1]) : '';

    // infoCol spans: card_number | rarity | type
    const infoSpans = content.match(/<div[^>]*class="infoCol"[^>]*>([\s\S]*?)<\/div>/);
    const spans = infoSpans
      ? (infoSpans[1].match(/<span[^>]*>([^<]+)<\/span>/g) || []).map(s =>
          s.replace(/<[^>]+>/g, '').trim()
        )
      : [];
    const rarity = spans[1] ?? '';
    const cardType = spans[2] ?? '';

    // Rarity-aware variant type: SP CARD rarity overrides p* → sp
    const variantType = inferVariantType(parallelId, rarity);

    // Image URL
    const imgMatch = content.match(/data-src="\.\.\/images\/cardlist\/card\/([^"]+)"/);
    const imgFile = imgMatch ? imgMatch[1].split('?')[0] : `${bandaiId}.png`;
    const imageUrl = `${CARD_IMAGE_BASE}/${imgFile}`;

    // backCol fields
    const costMatch = content.match(/<div[^>]*class="cost"[^>]*>[\s\S]*?<\/h3>([\s\S]*?)<\/div>/);
    const cost = costMatch ? stripTags(costMatch[1]) : null;

    const powerMatch = content.match(/<div[^>]*class="power"[^>]*>[\s\S]*?<\/h3>([\s\S]*?)<\/div>/);
    const power = powerMatch ? stripTags(powerMatch[1]) : null;

    const counterMatch = content.match(/<div[^>]*class="counter"[^>]*>[\s\S]*?<\/h3>([\s\S]*?)<\/div>/);
    const counter = counterMatch ? stripTags(counterMatch[1]) : null;

    // Life (leaders have life instead of cost)
    const lifeMatch = content.match(/<div[^>]*class="cost"[^>]*>\s*<h3>Life<\/h3>([\s\S]*?)<\/div>/i);
    const life = lifeMatch ? stripTags(lifeMatch[1]) : null;

    // Color
    const colorMatch = content.match(/<div[^>]*class="color"[^>]*>[\s\S]*?<\/h3>([\s\S]*?)<\/div>/);
    const color = colorMatch ? stripTags(colorMatch[1]) : null;

    // Attribute (img alt text)
    const attrMatch = content.match(/<div[^>]*class="attribute"[^>]*>[\s\S]*?<img[^>]*alt="([^"]+)"/);
    const attribute = attrMatch ? attrMatch[1].trim() : null;

    // Feature (sub-types)
    const featureMatch = content.match(/<div[^>]*class="feature"[^>]*>[\s\S]*?<\/h3>([\s\S]*?)<\/div>/);
    const feature = featureMatch ? stripTags(featureMatch[1]) : null;

    // Effect text
    const textMatch = content.match(/<div[^>]*class="text"[^>]*>[\s\S]*?<\/h3>([\s\S]*?)<\/div>/);
    const effectText = textMatch ? stripTags(textMatch[1]) : null;

    // Set info from getInfo — e.g. "-ROMANCE DAWN- [OP01]"
    const getInfoMatch = content.match(/<div[^>]*class="getInfo"[^>]*>[\s\S]*?<\/h3>([\s\S]*?)<\/div>/);
    const setInfo = getInfoMatch ? stripTags(getInfoMatch[1]) : '';
    const setCodeFromCard = extractSetCode(externalId);
    // Try to get a nice set name from the getInfo text
    const setNameMatch = setInfo.match(/[-–](.+?)[-–]\s*\[/);
    const setName = setNameMatch
      ? setNameMatch[1].trim()
      : seriesName.replace(/\[.*?\]/g, '').trim();

    const fLabel = finishLabel(parallelId, variantType);
    const fId = parallelId ?? 'standard';

    if (!name || !externalId) continue; // skip malformed entries

    cards.push({
      bandaiId,
      externalId,
      parallelId,
      variantType,
      name,
      rarity,
      cardType,
      color,
      setCode: setCodeFromCard,
      setName,
      cost: cost === '-' ? null : cost,
      power: power === '-' ? null : power,
      counter: counter === '-' ? null : counter,
      life: life === '-' ? null : life,
      attribute,
      feature,
      effectText,
      imageUrl,
      finishLabel: fLabel,
      finishId: fId,
    });
  }

  return cards;
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

async function fetchCardlistPage(): Promise<string> {
  const res = await fetch(CARDLIST_URL, { method: 'GET', headers: HEADERS });
  if (!res.ok) throw new Error(`Bandai cardlist GET failed: ${res.status}`);
  return res.text();
}

async function fetchSeriesPage(seriesId: string): Promise<string> {
  const body = new URLSearchParams({ search: 'true', series: seriesId }).toString();
  const res = await fetch(CARDLIST_URL, {
    method: 'POST',
    headers: HEADERS,
    body,
  });
  if (!res.ok) throw new Error(`Bandai series ${seriesId} fetch failed: ${res.status}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

/** Upsert VARIANT cards (parallel_id IS NOT NULL). Uses the partial index on (external_id, parallel_id, language). */
async function upsertVariantCards(cards: BandaiCard[], client: any): Promise<void> {
  for (const card of cards) {
    if (card.parallelId === null) continue;
    await client.query(
      `INSERT INTO cards (
        external_id, parallel_id, variant_type,
        name, game, set_name, set_code, rarity,
        image_url, market_price_eur, is_seed, language
      ) VALUES (
        $1, $2, $3,
        $4, 'one_piece', $5, $6, $7,
        $8, NULL, true, 'EN'
      )
      ON CONFLICT (external_id, parallel_id, language)
        WHERE parallel_id IS NOT NULL
      DO UPDATE SET
        name         = EXCLUDED.name,
        variant_type = EXCLUDED.variant_type,
        set_name     = EXCLUDED.set_name,
        rarity       = EXCLUDED.rarity,
        image_url    = EXCLUDED.image_url,
        is_seed      = true
      `,
      [
        card.externalId,
        card.parallelId,
        card.variantType,
        card.name,
        card.setName,
        card.setCode,
        card.rarity,
        card.imageUrl,
      ]
    );
  }
}

/** Upsert BASE cards (parallel_id IS NULL). Uses the partial index on (external_id, language). */
async function upsertBaseCards(cards: BandaiCard[], client: any): Promise<void> {
  for (const card of cards) {
    if (card.parallelId !== null) continue;
    await client.query(
      `INSERT INTO cards (
        external_id, parallel_id, variant_type,
        name, game, set_name, set_code, rarity,
        image_url, market_price_eur, is_seed, language
      ) VALUES (
        $1, NULL, NULL,
        $2, 'one_piece', $3, $4, $5,
        $6, NULL, true, 'EN'
      )
      ON CONFLICT (external_id, language)
        WHERE parallel_id IS NULL
      DO UPDATE SET
        name      = EXCLUDED.name,
        set_name  = EXCLUDED.set_name,
        rarity    = EXCLUDED.rarity,
        image_url = EXCLUDED.image_url,
        is_seed   = true
      `,
      [
        card.externalId,
        card.name,
        card.setName,
        card.setCode,
        card.rarity,
        card.imageUrl,
      ]
    );
  }
}

/**
 * Rebuild card_finishes for each base card from all its variant cards.
 * One finish per variant (including the base "standard" finish).
 */
async function rebuildCardFinishes(cards: BandaiCard[], client: any): Promise<void> {
  // Group by externalId → list of all variants (including base)
  const byBase = new Map<string, BandaiCard[]>();
  for (const card of cards) {
    const list = byBase.get(card.externalId) ?? [];
    list.push(card);
    byBase.set(card.externalId, list);
  }

  for (const [externalId, variants] of byBase) {
    // Get the DB card id for the BASE card
    const baseRow = await client.query(
      `SELECT id FROM cards WHERE external_id=$1 AND parallel_id IS NULL AND language='EN' AND game='one_piece'`,
      [externalId]
    );
    if (baseRow.rows.length === 0) continue;
    const baseCardId = baseRow.rows[0].id;

    for (const v of variants) {
      await client.query(
        `INSERT INTO card_finishes (card_id, finish_id, label, image_url, language)
         VALUES ($1, $2, $3, $4, 'EN')
         ON CONFLICT (card_id, finish_id)
         DO UPDATE SET
           label     = EXCLUDED.label,
           image_url = EXCLUDED.image_url`,
        [baseCardId, v.finishId, v.finishLabel, v.imageUrl]
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Main sync entry points
// ---------------------------------------------------------------------------

export async function syncOnePieceBandai(): Promise<void> {
  console.log('[Bandai] Starting One Piece sync from official card list...');
  const client = await pool.connect();

  try {
    // 0. Clean stale card_finishes from previous optcgapi sync.
    //    Only removes finishes whose finish_id doesn't match known Bandai patterns
    //    (i.e., event-slug IDs like "cs_2023_celebration_pack", "judge_pack_vol_5", etc.)
    await client.query('BEGIN');
    const cleaned = await client.query(`
      DELETE FROM card_finishes cf
      USING cards c
      WHERE cf.card_id = c.id
        AND c.game = 'one_piece'
        AND cf.finish_id NOT IN ('standard')
        AND cf.finish_id NOT SIMILAR TO '[pr][0-9]+|sp[0-9]*'
    `);
    await client.query('COMMIT');
    console.log(`[Bandai] Cleaned ${cleaned.rowCount} stale optcgapi finishes`);

    // 1. Fetch series list
    const mainHtml = await fetchCardlistPage();
    const allSeries = parseSeriesOptions(mainHtml);
    console.log(`[Bandai] Found ${allSeries.length} series`);

    let totalCards = 0;
    let totalVariants = 0;

    for (const series of allSeries) {
      const label = `${series.setCode || series.id} (${series.name.slice(0, 40)})`;
      console.log(`[Bandai] Fetching series ${label}...`);

      let html: string;
      try {
        html = await fetchSeriesPage(series.id);
      } catch (err) {
        console.warn(`[Bandai] Failed to fetch series ${label}: ${err}`);
        await sleep(DELAY_MS);
        continue;
      }

      const cards = parseCardsFromHtml(html, series.name);
      const bases = cards.filter(c => c.parallelId === null);
      const variants = cards.filter(c => c.parallelId !== null);

      console.log(`  → ${bases.length} base cards, ${variants.length} variants`);

      await client.query('BEGIN');
      try {
        await upsertBaseCards(cards, client);
        await upsertVariantCards(cards, client);
        await rebuildCardFinishes(cards, client);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[Bandai] Error on series ${label}:`, err);
      }

      totalCards += bases.length;
      totalVariants += variants.length;

      await sleep(DELAY_MS);
    }

    console.log(`[Bandai] Sync complete. ${totalCards} base cards, ${totalVariants} variants.`);
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Sync prices only — fetches from optcgapi and updates market_price_eur
 * on both base cards and variant cards matched by external_id.
 */
export async function syncOnePiecePricesFromOptcg(): Promise<void> {
  console.log('[optcgapi] Syncing One Piece prices...');
  const OPTCG_BASE = 'https://www.optcgapi.com/api';
  const client = await pool.connect();

  try {
    // Fetch all set IDs from optcgapi
    const setsRes = await fetch(`${OPTCG_BASE}/getAllSets/`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!setsRes.ok) throw new Error(`getAllSets failed: ${setsRes.status}`);
    const sets = (await setsRes.json()) as Array<{ set_id: string }>;

    let updated = 0;

    for (const { set_id } of sets) {
      let cards: any[];
      try {
        const res = await fetch(`${OPTCG_BASE}/allSetCards/${set_id}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (!res.ok) continue;
        cards = (await res.json()) as any[];
      } catch {
        continue;
      }

      await client.query('BEGIN');
      try {
        for (const card of cards) {
          const imgId: string = card.card_image_id ?? card.card_set_id ?? '';
          if (!imgId) continue;

          // Derive external_id and parallel_id from imgId
          const underscoreIdx = imgId.indexOf('_');
          const extId = underscoreIdx >= 0 ? imgId.slice(0, underscoreIdx) : imgId;
          const parId = underscoreIdx >= 0 ? imgId.slice(underscoreIdx + 1) : null;

          const priceEur = card.market_price != null
            ? parseFloat(card.market_price) * 0.92
            : null;
          if (priceEur == null) continue;

          if (parId) {
            // Update variant card
            await client.query(
              `UPDATE cards SET market_price_eur=$1
               WHERE external_id=$2 AND parallel_id=$3 AND language='EN'`,
              [priceEur, extId, parId]
            );
            // Also update the corresponding card_finish row on the base card
            await client.query(
              `UPDATE card_finishes cf SET market_price_eur=$1
               FROM cards c
               WHERE cf.card_id=c.id AND c.external_id=$2 AND c.parallel_id IS NULL
                 AND cf.finish_id=$3 AND c.language='EN'`,
              [priceEur, extId, parId]
            );
          } else {
            // Update base card
            await client.query(
              `UPDATE cards SET market_price_eur=$1
               WHERE external_id=$2 AND parallel_id IS NULL AND language='EN'`,
              [priceEur, extId]
            );
            // Update standard finish
            await client.query(
              `UPDATE card_finishes cf SET market_price_eur=$1
               FROM cards c
               WHERE cf.card_id=c.id AND c.external_id=$2 AND c.parallel_id IS NULL
                 AND cf.finish_id='standard' AND c.language='EN'`,
              [priceEur, extId]
            );
          }
          updated++;
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[optcgapi] Price update error for set ${set_id}:`, err);
      }

      await sleep(300);
    }

    console.log(`[optcgapi] Prices updated for ${updated} entries`);
  } finally {
    client.release();
    await pool.end();
  }
}
