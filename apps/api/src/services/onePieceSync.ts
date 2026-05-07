import 'dotenv/config';
import { pool } from '../db/client';

const OPTCG_BASE = 'https://www.optcgapi.com/api';

interface OptcgCard {
  inventory_price: number | null;
  market_price: number | null;
  card_name: string;
  set_name: string;
  card_text: string | null;
  set_id: string;
  rarity: string;
  card_set_id: string;
  card_color: string | null;
  card_type: string | null;
  life: number | null;
  card_cost: string | null;
  card_power: string | null;
  sub_types: string | null;
  counter_amount: number | null;
  attribute: string | null;
  date_scraped: string;
  card_image_id: string;
  card_image: string | null;
}

interface OptcgSet {
  set_name: string;
  set_id: string;
}

interface OptcgDeck {
  structure_deck_name: string;
  structure_deck_id: string;
}

function normalizeSetCode(setId: string): string {
  // "OP-01" → "OP01", "ST-01" → "ST01", "OP14-EB04" → "OP14EB04"
  return setId.replace(/-/g, '');
}

/**
 * Parse a human-readable finish label from a One Piece card name.
 * Card names embed variant info in parentheses, e.g.:
 *   "Otama"                          → standard
 *   "Otama (Reprint)"                → reprint
 *   "Otama (Jolly Roger Foil)"       → foil
 *   "Otama (Alternate Art)"          → alt art
 *   "Monkey.D.Luffy (119)"           → standard (119 is disambiguation number)
 *   "Monkey.D.Luffy (119) (SP)"      → SP
 *   "Monkey.D.Luffy (119) (SP) (Gold)" → SP Gold
 *   "Monkey.D.Luffy (OP05-119) (Alternate Art)" → alt art (reprint source)
 */
function parseVariantLabel(cardName: string): string {
  const parens: string[] = [];
  cardName.replace(/\(([^)]+)\)/g, (_, inner: string) => {
    parens.push(inner.trim());
    return '';
  });

  // Strip card-number disambiguation (pure digits) and set-ID markers (e.g. "OP01-006")
  const variantParts = parens.filter(p => {
    if (/^\d+$/.test(p)) return false;
    if (/^[A-Z]{2,}\d{2}[-\d]/.test(p)) return false; // card IDs like OP01-006, ST18-004
    return true;
  });

  if (variantParts.length === 0) return 'Standard';

  const v = variantParts.join(' ').toLowerCase();
  if (v.includes('sp') && v.includes('gold')) return 'SP Gold';
  if (v === 'sp') return 'SP';
  if (v.includes('spr')) return 'SPR';
  if (v.includes('alternate art') && v.includes('manga')) return 'Alternate Art (Manga)';
  if (v.includes('alternate art')) return 'Alternate Art';
  if (v.includes('full art')) return 'Full Art';
  if (v.includes('manga')) return 'Manga';
  if (v === 'tr') return 'Treasure Rare';
  if (v.includes('foil')) return variantParts.find(p => p.toLowerCase().includes('foil')) ?? 'Foil';
  if (v.includes('parallel')) return 'Parallel';
  if (v.includes('gem')) return 'Gem';
  if (v.includes('wanted poster')) return 'Wanted Poster';
  if (v.includes('box topper')) return 'Box Topper';
  if (v.includes('dash pack')) return 'Dash Pack';
  if (v.includes('navy')) return 'Navy';
  if (v.includes('reprint')) return 'Reprint';

  // Anything else: use the raw variant string (handles character names, promo names, etc.)
  return variantParts.join(', ');
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

export async function syncOnePiece(): Promise<void> {
  const client = await pool.connect();
  try {
    // ── 1. Fetch everything from the bulk endpoints ──────────────────────────
    console.log('[onePieceSync] Fetching set metadata...');
    const [sets, decks] = await Promise.all([
      fetchJson<OptcgSet[]>(`${OPTCG_BASE}/allSets/`),
      fetchJson<OptcgDeck[]>(`${OPTCG_BASE}/allDecks/`),
    ]);

    console.log('[onePieceSync] Fetching card data (set cards, ST cards, promos)...');
    const [setCards, stCards, promoCards] = await Promise.all([
      fetchJson<OptcgCard[]>(`${OPTCG_BASE}/allSetCards/`),
      fetchJson<OptcgCard[]>(`${OPTCG_BASE}/allSTCards/`),
      fetchJson<OptcgCard[]>(`${OPTCG_BASE}/allPromos/`),
    ]);

    const allCards: OptcgCard[] = [...setCards, ...stCards, ...promoCards];
    console.log(`[onePieceSync] ${allCards.length} total card entries, ${sets.length} sets, ${decks.length} decks`);

    // ── 2. Upsert card_sets ──────────────────────────────────────────────────
    for (const s of sets) {
      await client.query(
        `INSERT INTO card_sets (id, name, series, language, card_count, release_date, logo_url, symbol_url)
         VALUES ($1,$2,'One Piece','EN',0,NULL,NULL,NULL)
         ON CONFLICT (id, language) DO UPDATE SET name=$2`,
        [normalizeSetCode(s.set_id), s.set_name]
      );
    }
    for (const d of decks) {
      await client.query(
        `INSERT INTO card_sets (id, name, series, language, card_count, release_date, logo_url, symbol_url)
         VALUES ($1,$2,'One Piece','EN',0,NULL,NULL,NULL)
         ON CONFLICT (id, language) DO UPDATE SET name=$2`,
        [normalizeSetCode(d.structure_deck_id), d.structure_deck_name]
      );
    }

    // ── 3. Group card entries by card_set_id ─────────────────────────────────
    // Each card_set_id may have multiple variants. We pick the "base" entry
    // (where card_image_id === card_set_id) as the canonical card row.
    // Filter out malformed entries where card_set_id is not a valid card ID
    // (e.g. some promo entries have card_set_id = "Blue Green Purple Red Black Yellow")
    const VALID_CARD_ID = /^[A-Z0-9]+-\d{3}$/;
    const groups = new Map<string, OptcgCard[]>();
    let skipped = 0;
    for (const card of allCards) {
      if (!card.card_set_id || !VALID_CARD_ID.test(card.card_set_id)) {
        skipped++;
        continue;
      }
      if (!groups.has(card.card_set_id)) groups.set(card.card_set_id, []);
      groups.get(card.card_set_id)!.push(card);
    }
    if (skipped > 0) console.log(`[onePieceSync] Skipped ${skipped} malformed card entries`);
    console.log(`[onePieceSync] ${groups.size} unique cards to upsert`);

    // ── 4. Upsert cards + finishes ───────────────────────────────────────────
    let done = 0;
    for (const [cardSetId, variants] of groups) {
      // Base card: prefer the entry whose image ID matches the card_set_id
      const base = variants.find(v => v.card_image_id === cardSetId) ?? variants[0];

      const setCode = normalizeSetCode(base.set_id).slice(0, 32);
      // local_id = the number part after the first dash-group, e.g. "OP01-006" → "006"
      const dashIdx = cardSetId.lastIndexOf('-');
      const localId = dashIdx >= 0 ? cardSetId.slice(dashIdx + 1) : cardSetId;
      const priceEur = base.market_price != null ? Math.round(base.market_price * 100) : null;

      const cardRow = await client.query(
        `INSERT INTO cards (
           external_id, name, game, set_name, set_code, rarity, image_url,
           market_price_eur, is_seed, language, tcgdex_id, tcgdex_set_id, local_id,
           illustrator, category, hp, regulation_mark, legal_standard, legal_expanded
         ) VALUES (
           $1,$2,'one_piece',$3,$4,$5,$6,$7,
           false,'EN',$8,$9,$10,
           NULL,$11,NULL,NULL,false,false
         )
         ON CONFLICT (external_id, language) DO UPDATE SET
           name        = EXCLUDED.name,
           set_name    = EXCLUDED.set_name,
           set_code    = EXCLUDED.set_code,
           rarity      = EXCLUDED.rarity,
           image_url   = COALESCE(EXCLUDED.image_url, cards.image_url),
           market_price_eur = COALESCE(EXCLUDED.market_price_eur, cards.market_price_eur),
           category    = EXCLUDED.category,
           updated_at  = NOW()
         RETURNING id`,
        [
          cardSetId,
          base.card_name,
          base.set_name,
          setCode,
          base.rarity ?? '',
          base.card_image ?? null,
          priceEur,
          base.card_image_id,   // tcgdex_id (re-used as OPTCG image ID)
          setCode,               // tcgdex_set_id (re-used as set code)
          localId,
          base.card_type ?? null,
        ]
      );

      const cardId = cardRow.rows[0]?.id;
      if (!cardId) continue;

      // ── 5. Upsert finishes for every variant ─────────────────────────────
      // finish_id = image-ID suffix (unique per variant), e.g. "p1", "r1", "standard"
      // label     = human-readable name parsed from card_name parentheticals
      for (const variant of variants) {
        const finishLabel = parseVariantLabel(variant.card_name);
        let finishId: string;

        if (variant.card_image_id) {
          // Derive finish_id from the image ID suffix (unique per variant)
          const rawSuffix = variant.card_image_id.startsWith(cardSetId + '_')
            ? variant.card_image_id.slice(cardSetId.length + 1)
            : variant.card_image_id === cardSetId
            ? ''
            : variant.card_image_id;
          finishId = (rawSuffix || 'standard').replace(/\.jpg$/, '');
        } else {
          // No image ID (promo cards, event cards) — use the label as a slug
          finishId = finishLabel === 'Standard'
            ? 'standard'
            : finishLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30);
        }
        const variantPrice = variant.market_price != null
          ? Math.round(variant.market_price * 100)
          : null;

        await client.query(
          `INSERT INTO card_finishes (card_id, finish_id, label, image_url, market_price_eur, language)
           VALUES ($1,$2,$3,$4,$5,'EN')
           ON CONFLICT (card_id, finish_id) DO UPDATE
             SET label=$3, image_url=COALESCE(EXCLUDED.image_url, card_finishes.image_url),
                 market_price_eur=COALESCE(EXCLUDED.market_price_eur, card_finishes.market_price_eur)`,
          [cardId, finishId, finishLabel, variant.card_image ?? null, variantPrice]
        );
      }

      done++;
      if (done % 500 === 0 || done === groups.size) {
        console.log(`[onePieceSync] ${done}/${groups.size} cards processed`);
      }
    }

    // ── 6. Mark sets as synced ───────────────────────────────────────────────
    for (const s of sets) {
      await client.query(
        `UPDATE card_sets SET synced_at=NOW(), card_count=(
           SELECT COUNT(*) FROM cards WHERE set_code=$1 AND game='one_piece' AND language='EN'
         ) WHERE id=$1 AND language='EN'`,
        [normalizeSetCode(s.set_id)]
      );
    }

    console.log(`[onePieceSync] Done — ${done} cards synced`);
  } finally {
    client.release();
  }
}

export async function syncOnePiecePrices(): Promise<void> {
  const client = await pool.connect();
  try {
    console.log('[onePieceSync:prices] Fetching latest card prices...');
    const [setCards, stCards] = await Promise.all([
      fetchJson<OptcgCard[]>(`${OPTCG_BASE}/allSetCards/`),
      fetchJson<OptcgCard[]>(`${OPTCG_BASE}/allSTCards/`),
    ]);

    const allCards = [...setCards, ...stCards];
    const byImageId = new Map<string, number | null>();
    for (const card of allCards) {
      if (card.market_price != null) {
        byImageId.set(card.card_image_id, Math.round(card.market_price * 100));
      }
    }

    let updated = 0;
    for (const [imageId, priceEur] of byImageId) {
      // Update base card price (image_id matches external_id)
      const r1 = await client.query(
        `UPDATE cards SET market_price_eur=$1, updated_at=NOW()
         WHERE tcgdex_id=$2 AND game='one_piece' AND language='EN'`,
        [priceEur, imageId]
      );
      // Update finish price
      await client.query(
        `UPDATE card_finishes cf
         SET market_price_eur=$1
         FROM cards c
         WHERE c.id=cf.card_id
           AND c.game='one_piece'
           AND cf.image_url LIKE $2`,
        [priceEur, `%${imageId}%`]
      );
      updated += r1.rowCount ?? 0;
    }
    console.log(`[onePieceSync:prices] Updated ${updated} card prices`);
  } finally {
    client.release();
  }
}
