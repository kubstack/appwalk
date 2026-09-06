const WEB_PROTOCOLS = new Set(['http:', 'https:']);

/** Returns true only for absolute web URLs that Playwright can navigate to. */
export function isValidWebUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  try {
    const parsed = new URL(value);
    return WEB_PROTOCOLS.has(parsed.protocol) && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

export function assertValidWebUrl(value: unknown, label = 'URL'): asserts value is string {
  if (!isValidWebUrl(value)) {
    throw new Error(`${label} must be a valid absolute http or https URL.`);
  }
}

// Reserved same-origin paths a hosting/CDN provider injects into every site it fronts — a RUM
// beacon, a bot-challenge endpoint, whatever — regardless of what the application itself defines.
// Same-origin filtering alone (as looksLikeSuccessByNetwork already does) can't catch these: the
// provider serves them from the app's own origin on purpose. One entry per provider actually
// observed doing this on a real target; add another pattern here rather than guessing ahead of
// evidence which of the many other hosting providers might do the same.
const INFRASTRUCTURE_URL_PATTERNS: RegExp[] = [
  /^\/cdn-cgi\//i, // Cloudflare's reserved path (RUM analytics, speculation-rules pings, bot challenge).
];

/** True for same-origin infrastructure traffic that isn't part of the target application itself —
 * worth excluding from coverage, findings evidence, and safety-block summaries alike, since it
 * would otherwise inflate all three with noise no application decision ever produced. */
export function isInfrastructureUrl(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    return INFRASTRUCTURE_URL_PATTERNS.some((pattern) => pattern.test(pathname));
  } catch {
    return false;
  }
}
