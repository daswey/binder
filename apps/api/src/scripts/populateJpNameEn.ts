import 'dotenv/config';
import { pool } from '../db/client';
import { jpNameToEn } from '../data/katakanaToEn';

async function run() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, name FROM cards WHERE language = 'JP' AND name_en IS NULL`
    );
    console.log(`Processing ${rows.length} JP cards...`);

    let matched = 0;
    const updates: { id: string; name_en: string }[] = [];

    for (const row of rows) {
      const enName = jpNameToEn(row.name);
      if (enName) {
        updates.push({ id: row.id, name_en: enName });
        matched++;
      }
    }

    // Batch update
    for (let i = 0; i < updates.length; i += 500) {
      const batch = updates.slice(i, i + 500);
      const values = batch.map((u, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2})`).join(', ');
      const params = batch.flatMap(u => [u.id, u.name_en]);
      await client.query(
        `UPDATE cards SET name_en = v.name_en
         FROM (VALUES ${values}) AS v(id, name_en)
         WHERE cards.id::text = v.id`,
        params
      );
      console.log(`Updated batch ${i / 500 + 1} (${Math.min(i + 500, updates.length)}/${updates.length})`);
    }

    console.log(`Done: ${matched}/${rows.length} JP cards matched to English names`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => { console.error(e); process.exit(1); });
