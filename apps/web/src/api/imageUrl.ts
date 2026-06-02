/**
 * Bandai's CDN blocks hotlinking without a Referer header.
 * Route their card images through our API proxy so they load in the browser.
 */
const BANDAI_EN_PREFIX = 'https://en.onepiece-cardgame.com/images/';
const BANDAI_JP_PREFIX = 'https://www.onepiece-cardgame.com/images/';

export function cardImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith(BANDAI_EN_PREFIX) || url.startsWith(BANDAI_JP_PREFIX)) {
    return `/api/img/bandai?url=${encodeURIComponent(url)}`;
  }
  return url;
}

/**
 * Format card number based on game:
 * - One Piece: use external_id directly (e.g. "OP01-001")
 * - Pokémon: "016/162" format using local_id and set_card_count
 */
export function formatCardNumber(
  externalId: string,
  localId?: string | null,
  setCardCount?: number | null,
  game?: string | null
): string {
  // One Piece: use external_id as the number, append set total if available (OP01-001/121)
  if (game === 'one_piece') {
    return setCardCount ? `${externalId}/${setCardCount}` : externalId;
  }

  // Get the raw number — prefer local_id, fall back to parsing external_id
  const raw = localId ?? externalId.split('-').pop() ?? externalId;

  // If we have a set total, pad and format as "016/162"
  if (setCardCount) {
    const digits = String(setCardCount).length;
    const padded = raw.padStart(digits, '0');
    return `${padded}/${setCardCount}`;
  }

  // No set total — just return the raw number
  return raw;
}
