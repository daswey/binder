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
