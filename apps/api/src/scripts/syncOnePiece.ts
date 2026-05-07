import 'dotenv/config';
import { syncOnePieceBandai, syncOnePiecePricesFromOptcg } from '../services/onePieceSyncBandai';

const [,, command] = process.argv;

async function main() {
  if (!command || command === 'sync') {
    await syncOnePieceBandai();
  } else if (command === 'prices') {
    await syncOnePiecePricesFromOptcg();
  } else {
    console.error('Usage: syncOnePiece [sync|prices]');
    process.exit(1);
  }
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
