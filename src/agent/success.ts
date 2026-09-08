import type { NetworkEntry } from '../evidence/recorder.js';

// Bare short words are word-boundaried (\b) so they can't match as a substring of their own
// opposite — "saved" alone would otherwise match inside "unsaved", "added" inside "padded".
const SUCCESS_URL_PATTERN =
  /success|thank|complete|confirmation|confirmed|results|\bsaved\b|\bupdated\b|\badded\b|\buploaded\b/i;
// "no results found" is deliberately not a signal here: several personas' own instructions (e.g.
// noah) already treat landing on an empty state as an incomplete flow, not a success — matching it
// here would contradict that.
const SUCCESS_SNAPSHOT_PATTERN =
  /thank you for your|successfully (submitted|completed|placed|created|registered|saved|updated|added|uploaded|sent|subscribed)|(submitted|completed|placed|created|registered|saved|updated|added|uploaded|sent|subscribed) successfully|your order has been|order confirmed|registration (successful|complete)|(changes|settings|preferences) (have been |were )?saved|\d+\s+results?\s+found|signed in successfully|welcome back|added to (your |the )?(cart|list|favou?rites|wishlist|watchlist)|copied to clipboard|(message|email|invitation) sent|upload (complete|successful)/i;
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function looksLikeSuccessByUrl(url: string): boolean {
  return SUCCESS_URL_PATTERN.test(url);
}

export function looksLikeSuccessBySnapshot(snapshot: string): boolean {
  return SUCCESS_SNAPSHOT_PATTERN.test(snapshot);
}

// Restrict to same-origin requests so third-party ad/telemetry beacons can't count.
export function looksLikeSuccessByNetwork(network: NetworkEntry[], pageUrl: string): boolean {
  let origin: string;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return false;
  }

  return network.some((entry) => {
    if (!STATE_CHANGING_METHODS.has(entry.method)) return false;
    if (entry.status === undefined || entry.status < 200 || entry.status >= 400) return false;
    try {
      return new URL(entry.url).origin === origin;
    } catch {
      return false;
    }
  });
}

export function looksLikeSuccess(url: string, network: NetworkEntry[] = [], snapshot = ''): boolean {
  return looksLikeSuccessByUrl(url) || looksLikeSuccessByNetwork(network, url) || looksLikeSuccessBySnapshot(snapshot);
}
