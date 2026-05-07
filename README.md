# Binder

A mobile-first web app for local TCG (Pokémon + One Piece) trade matching and event discovery.

## Card database setup

Binder uses TCGdex (https://tcgdex.dev) as its Pokémon card data source — free, no API key required.

### First-time setup

After running migrations, populate the card database:

```bash
# Sync all three languages (EN + DE + JP) — takes ~15–30 min on first run
npm run pokemon:sync

# Or sync one language at a time
npm run pokemon:sync:en
npm run pokemon:sync:de
npm run pokemon:sync:ja
```

The sync is resumable — if interrupted, re-run the same command and it will skip already-synced sets.

### What gets imported

| Language | Sets | Approx. cards |
|---|---|---|
| English (EN) | All sets from Base Set to current | ~15,000+ |
| German (DE) | All officially released DE sets | ~12,000+ |
| Japanese (JP) | All JP sets including JP-exclusive | ~18,000+ |

### Price data

Market prices (EUR, from Cardmarket) are embedded in the sync and updated daily by the `priceSync` background job. Prices may be null for very old or JP-only cards where Cardmarket data is unavailable.

### Resetting card data

```bash
# Wipe all non-seed card data (keeps seed placeholder cards)
psql $DATABASE_URL -c "DELETE FROM cards WHERE is_seed=false AND game='pokemon'"

# Then re-sync from scratch
npm run pokemon:sync
```

## Migrations

```bash
npm run migrate:v3   # full schema rebuild (drops all tables)
npm run migrate:v4   # adds TCGdex fields, card_sets table, language column
```

## Development

```bash
npm run dev          # start API with hot reload
npm run db:seed      # seed 10 test users + 15 placeholder cards + matches
npm run db:seed:reset
```
