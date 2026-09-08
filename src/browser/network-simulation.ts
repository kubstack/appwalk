import type { Page, Route } from 'playwright';
import { toStepResult } from './snapshot.js';
import type { StepResult } from '../types.js';
import { evaluateSafetyRequest, safePath, type SafetyRequestOptions } from '../safety/guard.js';

type TransientRouteArm = {
  urlPattern: string;
  handler: (route: Route) => Promise<void>;
  consumed: boolean;
  settled: boolean;
};

// A route arm belongs to the page and is consumed by one matching request or discarded
// after the next tool action. Keeping this state here gives all callers one
// cleanup path instead of leaving page routes to live for the rest of a run.
const pendingRouteArms = new WeakMap<Page, Set<TransientRouteArm>>();

function rememberRouteArm(page: Page, arm: TransientRouteArm): void {
  let arms = pendingRouteArms.get(page);
  if (!arms) {
    arms = new Set();
    pendingRouteArms.set(page, arms);
  }
  arms.add(arm);
}

function forgetRouteArm(page: Page, arm: TransientRouteArm): void {
  const arms = pendingRouteArms.get(page);
  if (!arms) return;
  arms.delete(arm);
  if (arms.size === 0) pendingRouteArms.delete(page);
}

async function unrouteArm(page: Page, arm: TransientRouteArm): Promise<boolean> {
  try {
    await page.unroute(arm.urlPattern, arm.handler);
    forgetRouteArm(page, arm);
    return true;
  } catch {
    // Keep the arm registered so a later cleanup attempt can retry. A closing page
    // is harmless; its weak-map entry disappears with the page.
    return false;
  }
}

async function registerRouteArm(page: Page, arm: TransientRouteArm): Promise<void> {
  rememberRouteArm(page, arm);
  try {
    await page.route(arm.urlPattern, arm.handler);
  } catch (error) {
    forgetRouteArm(page, arm);
    throw error;
  }
}

/** Removes network arms that were not consumed by the immediately following action. */
export async function clearUnusedRouteHandlers(page: Page): Promise<number> {
  const arms = pendingRouteArms.get(page);
  if (!arms) return 0;
  let cleaned = 0;
  for (const arm of [...arms]) {
    // Do not unroute a handler while its request is still being settled. Its
    // finally block owns cleanup in that case.
    if (arm.consumed && !arm.settled) continue;
    if (await unrouteArm(page, arm)) cleaned++;
  }
  return cleaned;
}

export type FailureMode = '500' | '503' | '404' | 'malformed' | 'offline' | 'connectionReset' | 'timeout';
const FAILURE_MODES = new Set<string>(['500', '503', '404', 'malformed', 'offline', 'connectionReset', 'timeout']);

/** Arms the next request matching `urlPattern` to fail in a specific way — call before the action
 * expected to trigger it, same pattern as `handleDialog`. One-shot: unroutes itself after firing.
 *
 * `500`/`503`/`404`/`malformed` fabricate a response; the real server never sees the request.
 * `offline`/`connectionReset` abort before any response reaches the server.
 * `timeout` is the exception: the request genuinely completes via `route.fetch()`, only the response is
 * hidden from the page — the shape most likely to expose an idempotency bug on retry. */
export async function simulateFailure(page: Page, urlPattern: string, mode: FailureMode): Promise<void> {
  if (!FAILURE_MODES.has(mode)) {
    throw new Error(`simulateFailure: unknown mode "${mode}" — expected one of ${[...FAILURE_MODES].join(', ')}.`);
  }
  // Unroute happens *after* the route settles, not before — unrouting mid-flight (before fulfill/abort
  // resolves) makes Playwright treat the route as already handled and throw on the fulfill/abort call
  // that was actually meant to settle it.
  const handler = async (route: Route) => {
    if (arm.consumed) {
      await route.continue();
      return;
    }
    arm.consumed = true;
    try {
      switch (mode) {
        case '500':
        case '503':
        case '404':
          await route.fulfill({
            status: Number(mode),
            contentType: 'application/json',
            body: '{"error":"simulated failure"}',
          });
          break;
        case 'malformed':
          await route.fulfill({ status: 200, contentType: 'application/json', body: '{not valid json' });
          break;
        case 'offline':
          await route.abort('internetdisconnected');
          break;
        case 'connectionReset':
          await route.abort('connectionreset');
          break;
        case 'timeout':
          await route.fetch();
          await route.abort('timedout');
          break;
      }
    } finally {
      arm.settled = true;
      await unrouteArm(page, arm);
    }
  };
  const arm: TransientRouteArm = { urlPattern, handler, consumed: false, settled: false };
  await registerRouteArm(page, arm);
}

/** Arms the next request matching a URL pattern to wait before continuing. This is intentionally
 * one-shot, so a broad pattern cannot slow every later flow in the session. */
export async function simulateLatency(page: Page, urlPattern: string, delayMs: number): Promise<void> {
  if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 60_000) {
    throw new Error('simulateLatency: delayMs must be a finite number between 0 and 60000.');
  }
  const handler = async (route: Route) => {
    if (arm.consumed) {
      await route.continue();
      return;
    }
    arm.consumed = true;
    try {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      await route.continue();
    } finally {
      arm.settled = true;
      await unrouteArm(page, arm);
    }
  };
  const arm: TransientRouteArm = { urlPattern, handler, consumed: false, settled: false };
  await registerRouteArm(page, arm);
}

/** Toggles genuine context-wide offline: unlike `simulateFailure`'s `offline` mode, which fails
 * only the one armed request that matches its URL pattern, this drops network for every request on
 * every page in the context — new ones included — the same way a real dropped connection does. */
export async function setOffline(page: Page, offline: boolean): Promise<StepResult> {
  await page.context().setOffline(offline);
  return toStepResult(page);
}

const API_REQUEST_BODY_PREVIEW_MAX_CHARS = 2000;

/** Sends a real request straight through Playwright's `APIRequestContext`, using the current
 * session's cookies — reaches the API layer directly instead of only what a rendered page happens
 * to link to. GET/HEAD only: `page.request` is a separate HTTP client that bypasses
 * `context.route()` entirely, so it evaluates the shared safety policy explicitly before sending
 * the request. Restricting this tool to read-only methods preserves its read-only contract while
 * URL block/allow rules still apply consistently with normal browser-driven requests. */
export async function apiRequest(
  page: Page,
  method: 'GET' | 'HEAD',
  url: string,
  headers?: Record<string, string>,
  safety?: SafetyRequestOptions,
): Promise<StepResult> {
  // The tool schema's enum is a request to the model, not an enforcement mechanism — a malformed
  // or non-conforming tool call still reaches this function directly, so the read-only restriction
  // that keeps this tool from bypassing the destructive-action guard has to be checked here too,
  // not just declared in JSON schema.
  if (method !== 'GET' && method !== 'HEAD') {
    throw new Error(
      `apiRequest: method must be GET or HEAD, got "${method}". This tool is read-only by design — it bypasses the safety guard, so it can't be used for mutating requests.`,
    );
  }
  if (safety) {
    const decision = evaluateSafetyRequest(method, url, safety);
    if (decision.blocked) {
      safety.onBlocked?.({ method, url: safePath(url) });
      throw new Error(`apiRequest: blocked by safety policy: ${method} ${safePath(url)}`);
    }
  }
  const response = await page.request.fetch(url, { method, headers });
  const status = response.status();
  const contentType = response.headers()['content-type'] ?? '(unknown content type)';
  let bodyPreview: string;
  try {
    const text = await response.text();
    bodyPreview =
      text.length > API_REQUEST_BODY_PREVIEW_MAX_CHARS
        ? `${text.slice(0, API_REQUEST_BODY_PREVIEW_MAX_CHARS)}... [truncated, ${text.length} bytes total]`
        : text;
  } catch {
    bodyPreview = '(could not read response body)';
  }
  const result = await toStepResult(page);
  return {
    ...result,
    snapshot: `${result.snapshot}\n\nAPI ${method} ${url} -> ${status} (${contentType})\n${bodyPreview}`,
  };
}
