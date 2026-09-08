import type { ResponseFixture } from './types.js';

function compactPromptValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return {
      __preview: 'array',
      length: value.length,
      sample: value.length > 0 ? [compactPromptValue(value[0])] : [],
    };
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, compactPromptValue(entry)]));
  }
  if (typeof value === 'string' && value.length > 500) {
    return `${value.slice(0, 500)}… [truncated]`;
  }
  return value;
}

function compactPromptFixtures(fixtures: ResponseFixture[]): Array<Record<string, unknown>> {
  return fixtures.map((fixture) => ({
    method: fixture.method,
    url: fixture.url,
    occurrence: fixture.occurrence,
    status: fixture.status,
    bodyPreview: compactPromptValue(fixture.body),
  }));
}

export function responseVariantPrompt(
  flowName: string,
  fixtures: ResponseFixture[],
  maxVariants: number,
  finalSnapshot = '',
  replayTimeline: Array<{ url: string; snapshot: string }> = [],
): string {
  const timeline = replayTimeline.length
    ? replayTimeline
        .map((step, index) => `${index + 1}. URL: ${step.url}\n${step.snapshot.slice(0, 1200)}`)
        .join('\n\n')
    : '(No replay timeline was available.)';
  /* eslint-disable no-useless-escape -- the escaped quotes below are literal example JSON content for the
     model to read, not JS string syntax; removing them would show an invalid JSON example. */
  return `You are designing a small set of deterministic UI scenarios from one verified browser flow.

Flow: ${flowName}
Observed same-origin JSON responses (method and exact URL matter):
${JSON.stringify(compactPromptFixtures(fixtures), null, 2)}

The bodyPreview values are structural previews, not replacement bodies. Patch paths must still refer to existing paths in the real captured response.
For an array preview, the sample marker is only an example: use the real path such as $.orders[0].status, never $.orders.sample[0].status.

Replay timeline (each snapshot is after one original browser action):
${timeline}

Observed final UI snapshot for the original flow:
${finalSnapshot}

Return ONLY a JSON object with a "variants" array containing at most ${maxVariants} useful variants and a "reason" string. Each item must have:
{"name":"short scenario name","sourceMethod":"POST","sourceUrl":"exact URL from the input","sourceOccurrence":1,"patches":[{"path":"$.existing.path","value": "new JSON value"}],"expectation":{"assertion":"containsText","locator":"role=heading[name=\"Pending\"]","value":"Pending"},"reason":"why this is a useful UI scenario"}

Rules:
- Patch only existing JSON object properties or existing array elements. Never add or remove fields.
- Keep the response valid and preserve its general shape.
- Prefer meaningful business states visible in the UI: alternate status, empty/non-empty collection, boundary quantity or total.
- Do not patch IDs, timestamps, tokens, credentials, URLs, or pagination cursors unless there is no other meaningful field.
- Do not invent a response URL. Use one of the exact URLs above.
- Always include the exact response method from the input as sourceMethod, because one URL can serve multiple methods.
- Always include sourceOccurrence from the input when the same method and URL appear more than once, so the patch targets the intended response in the captured sequence.
- Do not repeat the original response or produce cosmetic duplicates.
- Include one concrete expectation that should be observable after the selected source response is applied during the same flow, using only visible/hidden/containsText/urlContains/urlEquals. Do not guess a signal unrelated to the response.
- If no meaningful variant is possible, return {"variants":[],"reason":"briefly explain why no reliable observable scenario can be derived"}.`;
  /* eslint-enable no-useless-escape */
}
