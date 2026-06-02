/**
 * Bandai's CDN blocks hotlinking without a Referer header.
 * Route their card images through our API proxy so they load in the browser.
 */
const BANDAI_PREFIX = 'https://en.onepiece-cardgame.com/images/';

export function cardImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith(BANDAI_PREFIX)) {
    return `/api/img/bandai?url=${encodeURIComponent(url)}`;
  }
  return url;
}

/**
 * Format card number as "016/162" using local_id and set_card_count.
 * Falls back to the number part of external_id if local_id is missing.
 */
export function formatCardNumber(
  externalId: string,
  localId?: string | null,
  setCardCount?: number | null
): string {
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
