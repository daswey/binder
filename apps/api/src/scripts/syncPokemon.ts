import { syncAll, syncLanguage, syncSet } from '../services/pokemonSync';

const [,, lang, setId] = process.argv;

async function main() {
  if (!lang || lang === 'all') {
    await syncAll();
  } else if (['en', 'de', 'ja'].includes(lang)) {
    if (setId) {
      await syncSet(lang as 'en' | 'de' | 'ja', setId);
    } else {
      await syncLanguage(lang as 'en' | 'de' | 'ja');
    }
  } else {
    console.error('Usage: syncPokemon [en|de|ja|all] [setId?]');
    process.exit(1);
  }
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
