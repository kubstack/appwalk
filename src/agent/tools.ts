import type { Page } from 'playwright';
import * as actions from '../browser/actions.js';
import { ACTION_TIMEOUT_MS } from '../browser/actions.js';
import { toStepResult } from '../browser/snapshot.js';
import { resolveLocator } from '../browser/locator.js';
import type { ToolCall } from '../providers/provider.js';
import type { ExpectationAssertion, ExpectationObservation, StepResult } from '../types.js';
import type { SafetyRequestOptions } from '../safety/guard.js';
import { validateToolInput } from './validation.js';
import { TOOL_DEFINITIONS } from './tool-definitions.js';

export { TOOL_DEFINITIONS };

/** `activePage` is set only by actions that replace the browser's active page (a new tab, a
 * reopened browser) — the caller (agent loop, replay) must switch to it for subsequent actions. */
export interface ToolCallResult extends StepResult {
  activePage?: Page;
}

const EXPECTATION_POLL_INTERVAL_MS = 100;

/** Repeatedly evaluates `read` until `isMet` accepts its result or `timeoutMs` elapses, instead of
 * checking once — the raw Locator methods used below (isVisible/textContent/inputValue/...) have
 * no built-in retry, unlike Playwright's own `expect(locator).toBeVisible()` and friends. Without
 * this, a condition that's genuinely about to become true (an async fetch that hasn't rendered
 * yet) reads as violated purely because the check ran a beat too early — appwalk's own timing, not
 * the app's behavior. A transient error mid-poll (the element briefly detached during a re-render)
 * is treated as "not yet met" and retried; only if every attempt errored is the last error
 * rethrown, so a genuine failure still reaches the caller's "unknown" handling instead of being
 * silently reported as a confident false. */
export async function pollUntil<T>(
  read: () => Promise<T>,
  isMet: (value: T) => boolean,
  timeoutMs: number = ACTION_TIMEOUT_MS,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastValue: T | undefined;
  let lastError: unknown;
  let succeededOnce = false;
  while (true) {
    try {
      lastValue = await read();
      succeededOnce = true;
      if (isMet(lastValue)) return lastValue;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() >= deadline) {
      if (!succeededOnce) throw lastError;
      return lastValue as T;
    }
    await new Promise((resolve) => setTimeout(resolve, EXPECTATION_POLL_INTERVAL_MS));
  }
}

async function verifyExpectation(
  page: Page,
  expectationIndex: number,
  assertion: ExpectationAssertion,
  locatorInput: string | undefined,
  value: string | undefined,
  expectedCount: number | undefined,
): Promise<ToolCallResult> {
  let status: ExpectationObservation['status'] = 'unknown';
  let detail = 'No reliable observable signal was supplied.';
  const locator = locatorInput ? resolveLocator(page, locatorInput).first() : undefined;

  try {
    if (assertion === 'visible' || assertion === 'hidden') {
      if (!locatorInput || !locator) {
        detail = `The ${assertion} check needs a locator.`;
      } else {
        const isVisible = await pollUntil(
          async () => (await locator.count()) > 0 && (await locator.isVisible()),
          (visible) => visible === (assertion === 'visible'),
        );
        const passed = assertion === 'visible' ? isVisible : !isVisible;
        status = passed ? 'met' : 'violated';
        detail = passed ? `Locator ${locatorInput} is ${assertion}.` : `Locator ${locatorInput} is not ${assertion}.`;
      }
    } else if (assertion === 'containsText') {
      if (!locatorInput || value === undefined) {
        detail = 'The containsText check needs both a locator and a value.';
      } else {
        const text = await pollUntil(
          () => locator!.textContent(),
          (t) => t?.includes(value) ?? false,
        );
        const passed = text?.includes(value) ?? false;
        status = passed ? 'met' : 'violated';
        detail = passed
          ? `Locator ${locatorInput} contains the expected text.`
          : `Locator ${locatorInput} does not contain the expected text.`;
      }
    } else if (assertion === 'urlContains' || assertion === 'urlEquals') {
      if (value === undefined) {
        detail = `The ${assertion} check needs a value.`;
      } else {
        const currentUrl = await pollUntil(
          async () => page.url(),
          (url) => (assertion === 'urlContains' ? url.includes(value) : url === value),
        );
        const passed = assertion === 'urlContains' ? currentUrl.includes(value) : currentUrl === value;
        status = passed ? 'met' : 'violated';
        detail = passed ? `Current URL satisfies ${assertion}.` : `Current URL does not satisfy ${assertion}.`;
      }
    } else if (assertion === 'value') {
      if (!locatorInput || value === undefined) {
        detail = 'The value check needs both a locator and a value.';
      } else {
        const actual = await pollUntil(
          () => locator!.inputValue(),
          (a) => a === value,
        );
        const passed = actual === value;
        status = passed ? 'met' : 'violated';
        detail = passed
          ? `Locator ${locatorInput} has the expected value.`
          : `Locator ${locatorInput} does not have the expected value.`;
      }
    } else if (assertion === 'checked' || assertion === 'unchecked') {
      if (!locatorInput) {
        detail = `The ${assertion} check needs a locator.`;
      } else {
        const checked = await pollUntil(
          () => locator!.isChecked(),
          (c) => c === (assertion === 'checked'),
        );
        const passed = assertion === 'checked' ? checked : !checked;
        status = passed ? 'met' : 'violated';
        detail = passed ? `Locator ${locatorInput} is ${assertion}.` : `Locator ${locatorInput} is not ${assertion}.`;
      }
    } else if (assertion === 'disabled' || assertion === 'enabled') {
      if (!locatorInput) {
        detail = `The ${assertion} check needs a locator.`;
      } else {
        const enabled = await pollUntil(
          () => locator!.isEnabled(),
          (e) => e === (assertion === 'enabled'),
        );
        const passed = assertion === 'enabled' ? enabled : !enabled;
        status = passed ? 'met' : 'violated';
        detail = passed ? `Locator ${locatorInput} is ${assertion}.` : `Locator ${locatorInput} is not ${assertion}.`;
      }
    } else if (assertion === 'count') {
      if (expectedCount === undefined || !Number.isSafeInteger(expectedCount) || expectedCount < 0) {
        detail = 'The count check needs a non-negative integer expectedCount.';
      } else if (!locatorInput) {
        detail = 'The count check needs a locator.';
      } else {
        const actual = await pollUntil(
          () => resolveLocator(page, locatorInput).count(),
          (c) => c === expectedCount,
        );
        const passed = actual === expectedCount;
        status = passed ? 'met' : 'violated';
        detail = passed
          ? `Locator count is ${expectedCount}.`
          : `Locator count is ${actual}, expected ${expectedCount}.`;
      }
    }
  } catch (error) {
    status = 'unknown';
    detail = `Could not evaluate the signal: ${(error as Error).message}`;
  }

  const result = await toStepResult(page);
  return {
    ...result,
    expectation: { expectationIndex, status, assertion, locator: locatorInput, value, expectedCount, detail },
  };
}

/**
 * Tracks every page that has ever been the active tab within one flow, keyed by a stable id assigned
 * in opening order ("tab-0" is the tab the flow started on). Only `openTab`/`switchTab` (Talia) read
 * or grow this; every other action ignores it. Callers that never use those two tools may omit it —
 * `openTab`/`switchTab` throw a clear error instead of silently misbehaving without one.
 */
export type TabRegistry = Map<string, Page>;

/**
 * A mutable box around the *currently active* TabRegistry. Registries are rebuilt per flow (loop.ts)
 * or created once per replay (replay.ts) — plain values that get reassigned or scoped inside those
 * functions. A popup can arrive asynchronously at any moment from a `page.on('popup')` listener that
 * was attached outside either function and has no way to observe a reassignment, so it needs a
 * long-lived handle whose `.tabs` field the owning function keeps pointed at whichever registry is
 * current, rather than a snapshot of the registry itself.
 */
export interface TabRegistryHandle {
  tabs: TabRegistry;
}

/**
 * Registering a popup into the tab registry (attachPopupDetection, orchestrate.ts) is invisible to
 * the model on its own — nothing about that registration reaches the text the model actually reads.
 * Diffing the registry's keys before and after each dispatched call surfaces it the same way openTab
 * already surfaces its own new tab, without needing every call site that mutates the registry outside
 * this function to also know how to phrase it. `openTab` is excluded since it already announces its
 * own result explicitly; duplicating that here would just repeat the same tab id twice.
 */
export async function executeToolCall(
  page: Page,
  call: ToolCall,
  tabs?: TabRegistry,
  safety?: SafetyRequestOptions,
  browserRestartHooks?: actions.BrowserRestartHooks,
  browserLifecycle?: actions.BrowserLifecycle,
): Promise<ToolCallResult> {
  const definition = TOOL_DEFINITIONS.find((tool) => tool.name === call.name);
  if (!definition) throw new Error(`Unknown tool: ${call.name}`);
  const armsHandlers = new Set(['handleDialog', 'simulateFailure', 'simulateLatency']);
  const cleanupTransientHandlers = async (): Promise<string[]> => {
    if (armsHandlers.has(call.name)) return [];
    const cleanup = await actions.clearUnusedTransientHandlers(page);
    const notes: string[] = [];
    if (cleanup.dialog)
      notes.push('The dialog handler was armed but no dialog appeared during this action; it was discarded.');
    if (cleanup.routes > 0)
      notes.push(`${cleanup.routes} unused network simulation handler(s) were discarded after this action.`);
    return notes;
  };
  let validatedInput: Record<string, unknown>;
  try {
    validatedInput = validateToolInput(definition, call.input);
  } catch (error) {
    const notes = await cleanupTransientHandlers();
    if (notes.length > 0) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${message} ${notes.join(' ')}`, { cause: error });
    }
    throw error;
  }
  const tabsBefore = tabs ? new Set(tabs.keys()) : undefined;
  let result: ToolCallResult;
  try {
    result = await dispatchToolCall(
      page,
      { ...call, input: validatedInput },
      tabs,
      safety,
      browserRestartHooks,
      browserLifecycle,
    );
  } catch (error) {
    const notes = await cleanupTransientHandlers();
    if (notes.length > 0) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${message} ${notes.join(' ')}`, { cause: error });
    }
    throw error;
  }
  const cleanupNotes = await cleanupTransientHandlers();
  if (cleanupNotes.length > 0) {
    result = { ...result, snapshot: `${result.snapshot}\n\n${cleanupNotes.join(' ')}` };
  }
  if (tabs && tabsBefore && call.name !== 'openTab') {
    const newTabIds = [...tabs.keys()].filter((id) => !tabsBefore.has(id));
    if (newTabIds.length > 0) {
      const notes = newTabIds.map((id) => `${id} (${tabs.get(id)!.url()})`).join(', ');
      return {
        ...result,
        snapshot: `${result.snapshot}\n\nA new tab opened on its own during this action: ${notes}. Use switchTab to view it if relevant.`,
      };
    }
  }
  return result;
}

async function dispatchToolCall(
  page: Page,
  call: ToolCall,
  tabs?: TabRegistry,
  safety?: SafetyRequestOptions,
  browserRestartHooks?: actions.BrowserRestartHooks,
  browserLifecycle?: actions.BrowserLifecycle,
): Promise<ToolCallResult> {
  const input = call.input;
  switch (call.name) {
    case 'navigate':
      return actions.navigate(page, input.url as string);
    case 'click':
      return actions.click(
        page,
        input.locator as string,
        input.button as actions.ClickButton | undefined,
        input.modifiers as actions.ClickModifier[] | undefined,
      );
    case 'doubleClick':
      return actions.doubleClick(
        page,
        input.locator as string,
        input.button as actions.ClickButton | undefined,
        input.modifiers as actions.ClickModifier[] | undefined,
      );
    case 'fill':
      return actions.fill(page, input.locator as string, input.value as string);
    case 'select':
      return actions.select(page, input.locator as string, input.value as string | string[]);
    case 'pressKey':
      return actions.pressKey(page, input.locator as string, input.key as string);
    case 'check':
      return actions.check(page, input.locator as string);
    case 'uncheck':
      return actions.uncheck(page, input.locator as string);
    case 'hover':
      return actions.hover(page, input.locator as string);
    case 'dragAndDrop':
      return actions.dragAndDrop(page, input.source as string, input.target as string);
    case 'goBack':
      return actions.goBack(page);
    case 'reload':
      return actions.reload(page);
    case 'clearCookie':
      return actions.clearCookie(page, input.name as string | undefined);
    case 'goForward':
      return actions.goForward(page);
    case 'openInNewTab':
      if (!browserLifecycle) throw new Error('openInNewTab: no browser lifecycle is configured for this run.');
      return actions.openInNewTab(page, browserLifecycle);
    case 'openTab': {
      if (!tabs) throw new Error('openTab: no tab registry available in this context.');
      if (!browserLifecycle) throw new Error('openTab: no browser lifecycle is configured for this run.');
      const result = await actions.openTab(page, browserLifecycle);
      const newId = `tab-${tabs.size}`;
      tabs.set(newId, result.activePage);
      const openIds = [...tabs.keys()].join(', ');
      return {
        ...result,
        snapshot: `${result.snapshot}\n\nOpened tab: ${newId}. Open tabs: ${openIds} (active: ${newId}).`,
      };
    }
    case 'switchTab': {
      if (!tabs) throw new Error('switchTab: no tab registry available in this context.');
      const tabId = input.tabId as string;
      const target = tabs.get(tabId);
      if (!target) {
        throw new Error(`switchTab: no open tab with id "${tabId}". Open tabs: ${[...tabs.keys()].join(', ')}`);
      }
      const result = await actions.switchTab(target);
      const openIds = [...tabs.keys()].join(', ');
      return {
        ...result,
        snapshot: `${result.snapshot}\n\nSwitched to tab: ${tabId}. Open tabs: ${openIds} (active: ${tabId}).`,
      };
    }
    case 'reopenBrowser':
      if (!browserLifecycle) throw new Error('reopenBrowser: no browser lifecycle is configured for this run.');
      return actions.reopenBrowser(page, browserLifecycle, browserRestartHooks);
    case 'scroll':
      return actions.scroll(page, input.locator as string | undefined);
    case 'setViewportSize':
      return actions.setViewportSize(page, input.width as number, input.height as number);
    case 'uploadFile':
      return actions.uploadFile(page, input.locator as string, input.filePaths as string[]);
    case 'download':
      return actions.download(page, input.locator as string);
    case 'handleDialog':
      actions.handleDialog(page, input.behavior as 'accept' | 'dismiss');
      return toStepResult(page);
    case 'waitFor':
      return actions.waitFor(page, input.locator as string);
    case 'burst':
      return actions.burst(
        page,
        input.action as string,
        input.locator as string,
        input.count as number,
        input.key as string | undefined,
      );
    case 'simulateFailure':
      await actions.simulateFailure(page, input.urlPattern as string, input.mode as actions.FailureMode);
      return toStepResult(page);
    case 'simulateLatency':
      await actions.simulateLatency(page, input.urlPattern as string, input.delayMs as number);
      return toStepResult(page);
    case 'setOffline':
      return actions.setOffline(page, input.offline as boolean);
    case 'apiRequest':
      return actions.apiRequest(
        page,
        input.method as 'GET' | 'HEAD',
        input.url as string,
        input.headers as Record<string, string> | undefined,
        safety,
      );
    case 'verifyExpectation':
      return verifyExpectation(
        page,
        input.expectationIndex as number,
        input.assertion as ExpectationAssertion,
        input.locator as string | undefined,
        input.value as string | undefined,
        input.expectedCount as number | undefined,
      );
    default:
      throw new Error(`Unknown tool: ${call.name}`);
  }
}
