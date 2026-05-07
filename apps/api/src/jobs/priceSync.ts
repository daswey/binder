import TCGdex from '@tcgdex/sdk';
import { pool } from '../db/client';

const LANG_MAP = { EN: 'en', DE: 'de', JP: 'ja' } as const;
type DbLang = keyof typeof LANG_MAP;

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function runPriceSync(): Promise<void> {
  const counts: Record<DbLang, number> = { EN: 0, DE: 0, JP: 0 };

  for (const dbLang of ['EN', 'DE', 'JP'] as DbLang[]) {
    const sdkLang = LANG_MAP[dbLang];
    const tcgdex = new TCGdex(sdkLang);

    // Fetch all pokemon cards for this language that have a tcgdex_id
    const { rows } = await pool.query(
      `SELECT id, tcgdex_id, tcgdex_set_id, local_id FROM cards
       WHERE game='pokemon' AND language=$1 AND tcgdex_id IS NOT NULL AND local_id IS NOT NULL`,
      [dbLang]
    );

    for (const row of rows) {
      await delay(100);
      try {
        // New SDK: tcgdex.card.get(tcgdexId)
        const card = await tcgdex.card.get(row.tcgdex_id);
        if (!card) continue;

        const priceFloat = (card as any).pricing?.cardmarket?.avg ?? null;
        if (priceFloat == null) continue;

        const priceEur = Math.round(priceFloat * 100);

        await pool.query(
          `UPDATE cards SET market_price_eur=$1, updated_at=NOW() WHERE id=$2`,
          [priceEur, row.id]
        );

        // Update finish prices too
        await pool.query(
          `UPDATE card_finishes SET market_price_eur=$1 WHERE card_id=$2`,
          [priceEur, row.id]
        );

        counts[dbLang]++;
      } catch {
        // Non-fatal — skip individual card failures
      }
    }
  }

  console.log(
    `[priceSync] updated ${counts.EN.toLocaleString()} EN cards · ` +
    `${counts.DE.toLocaleString()} DE cards · ` +
    `${counts.JP.toLocaleString()} JP cards`
  );
}
