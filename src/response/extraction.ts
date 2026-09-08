import type { EvidenceEntry } from '../evidence/log.js';
import { defaultRedactor, type Redactor } from '../security/redaction.js';
import { jsonClone, type ResponseFixture } from './types.js';

function sameOrigin(url: string, applicationUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(applicationUrl).origin;
  } catch {
    return false;
  }
}

function isAuthenticationEndpoint(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return /(^|\/)(auth|login|logout|refresh|token)(\/|$)/.test(pathname);
  } catch {
    return false;
  }
}

function isDynamicPathSegment(segment: string): boolean {
  const decoded = decodeURIComponent(segment);
  return /^\d+$/.test(decoded) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(decoded) || /^[0-9a-f]{16,}$/i.test(decoded);
}

/** Returns a replay glob for resource URLs such as `/orders/920`, while keeping collection URLs exact. */
export function responseFixtureUrlPattern(url: string): string {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/');
    let changed = false;
    parsed.pathname = pathParts
      .map((part) => {
        if (!part || !isDynamicPathSegment(part)) return part;
        changed = true;
        return '*';
      })
      .join('/');
    for (const [key, value] of parsed.searchParams.entries()) {
      if (!isDynamicPathSegment(value)) continue;
      parsed.searchParams.set(key, '*');
      changed = true;
    }
    return changed ? parsed.toString() : url;
  } catch {
    return url;
  }
}

/** Extracts bounded, replayable JSON responses observed during a flow. */
export function extractResponseFixtures(
  entries: EvidenceEntry[],
  applicationUrl: string,
  maxFixtureBytes?: number,
  redactor: Redactor = defaultRedactor,
): ResponseFixture[] {
  const fixtures: ResponseFixture[] = [];
  const occurrences = new Map<string, number>();
  for (const entry of entries) {
    for (const response of entry.network) {
      if (response.status === undefined || response.status < 200 || response.status >= 400) continue;
      if (response.body === undefined || !sameOrigin(response.url, applicationUrl)) continue;
      // Authentication responses can contain bearer tokens or session material. They are
      // never needed to replay an already authenticated flow and must not enter generated code.
      if (isAuthenticationEndpoint(response.url) || redactor.hasSensitiveData(response.body)) continue;
      const fixtureKey = `${response.method} ${response.url}`;
      let serialized: string;
      try {
        serialized = JSON.stringify(response.body);
      } catch {
        continue;
      }
      if (maxFixtureBytes !== undefined && serialized.length > maxFixtureBytes) continue;
      const occurrence = (occurrences.get(fixtureKey) ?? 0) + 1;
      occurrences.set(fixtureKey, occurrence);
      const urlPattern = responseFixtureUrlPattern(response.url);
      fixtures.push({
        method: response.method,
        url: response.url,
        occurrence,
        urlPattern: urlPattern === response.url ? undefined : urlPattern,
        status: response.status,
        body: jsonClone(redactor.redact(response.body)),
      });
    }
  }
  return fixtures;
}
