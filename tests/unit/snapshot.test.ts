import assert from 'node:assert/strict';
import test from 'node:test';
import type { Page } from 'playwright';
import {
  MAX_ACCESSIBILITY_TREE_CHARS,
  truncateAccessibilityTree,
  captureSnapshot,
} from '../../src/browser/snapshot.js';

/** Minimal stand-in for a Playwright Page exposing only what capturePageObservation actually
 * calls — enough to drive its retry logic deterministically, without a real browser or the
 * network/navigation timing a genuine race depends on (unreliable to force in a fast local test). */
function fakePage(evaluateResults: Array<(() => unknown) | Error>): { page: Page; waitForLoadStateCalls: number[] } {
  const state = { waitForLoadStateCalls: [] as number[] };
  let call = 0;
  const page = {
    locator: () => ({ ariaSnapshot: async () => '- generic' }),
    evaluate: async () => {
      const result = evaluateResults[call++]!;
      if (result instanceof Error) throw result;
      return result();
    },
    waitForLoadState: async () => {
      state.waitForLoadStateCalls.push(1);
    },
    url: () => 'https://app.test/',
  };
  return { page: page as unknown as Page, waitForLoadStateCalls: state.waitForLoadStateCalls };
}

const EMPTY_DOM_OBSERVATION = () => ({ interactiveElements: [], frames: [], hasHorizontalOverflow: false });

test('captureSnapshot retries once after "Execution context was destroyed", the transient error any navigating action can trigger', async () => {
  const { page, waitForLoadStateCalls } = fakePage([
    new Error('Execution context was destroyed, most likely because of a navigation'),
    EMPTY_DOM_OBSERVATION,
  ]);

  const snapshot = await captureSnapshot(page);

  assert.match(snapshot, /Accessibility tree/);
  assert.equal(waitForLoadStateCalls.length, 1, 'must wait for the page to settle before retrying');
});

test('captureSnapshot does not retry a different, unrelated evaluate() failure', async () => {
  const { page } = fakePage([new Error('Some other unrelated failure'), EMPTY_DOM_OBSERVATION]);

  await assert.rejects(captureSnapshot(page), /Some other unrelated failure/);
});

test('captureSnapshot gives up after a second consecutive context-destroyed error, rather than retrying forever', async () => {
  const { page } = fakePage([
    new Error('Execution context was destroyed, most likely because of a navigation'),
    new Error('Execution context was destroyed, most likely because of a navigation'),
  ]);

  await assert.rejects(captureSnapshot(page), /Execution context was destroyed/);
});

test('truncateAccessibilityTree leaves a tree at or under the cap untouched', () => {
  const tree = '- navigation "Main":\n  - link "Home"';
  assert.equal(truncateAccessibilityTree(tree), tree);
});

test('truncateAccessibilityTree cuts an oversized tree at a line boundary and notes what was omitted', () => {
  const line = '  - listitem "Order #1":\n';
  const tree = line.repeat(Math.ceil((MAX_ACCESSIBILITY_TREE_CHARS + 5_000) / line.length));
  const result = truncateAccessibilityTree(tree);

  const markerIndex = result.indexOf('\n... [truncated');
  assert.ok(markerIndex > 0, 'result must contain the truncation marker');
  const head = result.slice(0, markerIndex);

  assert.ok(result.length < tree.length, 'result must be shorter than the original');
  assert.ok(result.includes('truncated'), 'result must note that it was truncated');
  assert.ok(result.includes('more characters omitted'), 'result must report how much was cut');
  assert.equal((head.length + 1) % line.length, 0, 'cut must land on a line boundary, not mid-line');
  assert.ok(head.length <= MAX_ACCESSIBILITY_TREE_CHARS, 'kept head must not exceed the cap');
});

test('truncateAccessibilityTree keeps the start of the tree, not the end', () => {
  const tree = `${'x'.repeat(MAX_ACCESSIBILITY_TREE_CHARS)}\nSTART-MARKER\n${'y\n'.repeat(20_000)}END-MARKER`;
  const result = truncateAccessibilityTree(tree);
  assert.ok(result.includes('x'.repeat(100)), 'must keep content from the start of the tree');
  assert.ok(!result.includes('END-MARKER'), 'must not keep content from the end of an oversized tree');
});
