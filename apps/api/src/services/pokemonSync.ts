import 'dotenv/config';
import TCGdex from '@tcgdex/sdk';
import { pool } from '../db/client';

const LANG_MAP = { en: 'EN', de: 'DE', ja: 'JP' } as const;
type TcgLang = 'en' | 'de' | 'ja';

// Language matching: a JP Charizard ex and an EN Charizard ex are treated as distinct
// tradeable items. They share the same card name but are separate rows in the cards table.
// A want entry with language: null will match either.

const VARIANT_FINISH_MAP: Record<string, { finish_id: string; label: string }> = {
  normal:       { finish_id: 'standard',      label: 'Standard' },
  holo:         { finish_id: 'holo',          label: 'Holo' },
  reverse:      { finish_id: 'reverse_holo',  label: 'Reverse Holo' },
  firstEdition: { finish_id: 'first_edition', label: '1st Edition' },
  wPromo:       { finish_id: 'promo',         label: 'Promo' },
};

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function syncSet(lang: TcgLang, setId: string): Promise<void> {
  const langLabel = LANG_MAP[lang];
  const tcgdex = new TCGdex(lang);
  const client = await pool.connect();

  try {
    // New SDK: tcgdex.set.get(id)
    const set = await tcgdex.set.get(setId);
    if (!set) {
      console.warn(`[pokemonSync] ${langLabel} ${setId} — set not found, skipping`);
      return;
    }

    const cardBriefs = set.cards ?? [];
    const totalCards = cardBriefs.length;

    await client.query(
      `INSERT INTO card_sets (id, name, series, language, card_count, release_date, logo_url, symbol_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id, language) DO UPDATE
         SET name=$2, series=$3, card_count=$5, release_date=$6, logo_url=$7, symbol_url=$8`,
      [
        setId,
        set.name,
        (set as any).serie?.name ?? null,
        langLabel,
        (set as any).cardCount?.official ?? totalCards,
        (set as any).releaseDate ?? null,
        (set as any).logo ?? null,
        (set as any).symbol ?? null,
      ]
    );

    let cardsDone = 0;
    for (let i = 0; i < cardBriefs.length; i++) {
      const brief = cardBriefs[i];
      const tcgdexId: string = (brief as any).id ?? '';
      const localId: string = String((brief as any).localId ?? '');
      if (!tcgdexId || !localId) continue;

      await delay(100);

      if ((i + 1) % 50 === 0 || i === 0) {
        console.log(`[pokemonSync] ${langLabel} ${setId} — ${i + 1}/${totalCards} cards`);
      }

      try {
        // New SDK: use getCard() on the brief object, or tcgdex.card.get(tcgdexId)
        const card = await (brief as any).getCard?.() ?? await tcgdex.card.get(tcgdexId);
        if (!card) continue;

        const externalId = `${setId.toUpperCase()}-${localId}`;
        // New SDK: card.getImageURL('high', 'webp') — guard against null image property
        const rawImage = (card as any).image;
        let imageUrl: string | null = null;
        if (rawImage) {
          const built = typeof card.getImageURL === 'function'
            ? card.getImageURL('high', 'webp')
            : `${rawImage}/high.webp`;
          // Discard URLs that contain the literal string "undefined" (SDK bug for missing images)
          imageUrl = built && !String(built).includes('undefined') ? built : null;
        }

        const priceFloat = (card as any).pricing?.cardmarket?.avg ?? null;
        const priceEur = priceFloat != null ? Math.round(priceFloat * 100) : null;

        const legalStandard = (card as any).legal?.standard === true;
        const legalExpanded = (card as any).legal?.expanded === true;

        const cardRow = await client.query(
          `INSERT INTO cards (
             external_id, name, game, set_name, set_code, rarity, image_url,
             market_price_eur, is_seed, language, tcgdex_id, tcgdex_set_id, local_id,
             illustrator, category, hp, regulation_mark, legal_standard, legal_expanded
           ) VALUES ($1,$2,'pokemon',$3,$4,$5,$6,$7,false,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           ON CONFLICT (external_id, language) DO UPDATE SET
             name=$2, set_name=$3, set_code=$4, rarity=$5, image_url=$6,
             market_price_eur=$7, tcgdex_id=$9, tcgdex_set_id=$10, local_id=$11,
             illustrator=$12, category=$13, hp=$14, regulation_mark=$15,
             legal_standard=$16, legal_expanded=$17, updated_at=NOW(),
             name_en = COALESCE(cards.name_en, (
               SELECT en.name FROM cards en
               WHERE en.external_id = EXCLUDED.external_id AND en.language = 'EN' LIMIT 1
             ))
           RETURNING id`,
          [
            externalId,
            card.name,
            set.name,
            setId.toUpperCase(),
            (card as any).rarity ?? '',
            imageUrl,
            priceEur,
            langLabel,
            tcgdexId,
            setId,
            localId,
            (card as any).illustrator ?? null,
            (card as any).category ?? null,
            (card as any).hp ?? null,
            (card as any).regulationMark ?? null,
            legalStandard,
            legalExpanded,
          ]
        );

        const cardId = cardRow.rows[0]?.id;
        if (!cardId) continue;

        const variants = (card as any).variants ?? {};
        for (const [flag, mapping] of Object.entries(VARIANT_FINISH_MAP)) {
          if (!variants[flag]) continue;

          await client.query(
            `INSERT INTO card_finishes (card_id, finish_id, label, image_url, market_price_eur, language)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (card_id, finish_id) DO UPDATE
               SET label=$3, image_url=$4, market_price_eur=$5, language=$6`,
            [cardId, mapping.finish_id, mapping.label, imageUrl, priceEur, langLabel]
          );
        }

        cardsDone++;
      } catch (cardErr) {
        console.warn(`[pokemonSync] ${langLabel} ${setId}/${tcgdexId} — ${(cardErr as Error).message}`);
      }
    }

    await client.query(
      `UPDATE card_sets SET synced_at=NOW() WHERE id=$1 AND language=$2`,
      [setId, langLabel]
    );

    console.log(`[pokemonSync] ${langLabel} ${setId} — complete (${cardsDone}/${totalCards} cards)`);
  } finally {
    client.release();
  }
}

export async function syncLanguage(lang: TcgLang): Promise<void> {
  const langLabel = LANG_MAP[lang];
  const tcgdex = new TCGdex(lang);

  // New SDK: tcgdex.set.list()
  const sets = await tcgdex.set.list();
  if (!sets?.length) {
    console.warn(`[pokemonSync] ${langLabel} — no sets returned`);
    return;
  }

  console.log(`[pokemonSync] ${langLabel} — ${sets.length} sets to process`);

  const { rows: syncedRows } = await pool.query(
    `SELECT id FROM card_sets WHERE language=$1 AND synced_at IS NOT NULL`,
    [langLabel]
  );
  const synced = new Set(syncedRows.map((r: any) => r.id));

  let setsDone = 0;
  for (const setRef of sets) {
    const setId = (setRef as any).id;
    setsDone++;

    if (synced.has(setId)) {
      console.log(`[pokemonSync] ${langLabel} ${setId} — ${setsDone}/${sets.length} sets — skipping (already synced)`);
      continue;
    }

    console.log(`[pokemonSync] ${langLabel} ${setId} — ${setsDone}/${sets.length} sets — syncing…`);
    try {
      await syncSet(lang, setId);
    } catch (err) {
      console.error(`[pokemonSync] ${langLabel} ${setId} — ${(err as Error).message}`);
    }
  }

  console.log(`[pokemonSync] ${langLabel} — complete`);
}

export async function syncAll(): Promise<void> {
  for (const lang of ['en', 'de', 'ja'] as TcgLang[]) {
    await syncLanguage(lang);
  }
  console.log('[pokemonSync] All languages synced');
}
