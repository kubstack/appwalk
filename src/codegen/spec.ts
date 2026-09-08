import type { EvidenceEntry } from '../evidence/log.js';
import { assertValidBurstCount } from '../limits.js';
import { type ResponseFixture, type ResponseVariant } from '../response/variants.js';
import { escapeJsString, serializeJsValue, toLocatorExpression } from './locator.js';
import { assertValidWebUrl } from '../url.js';
import { TOOL_DEFINITIONS } from '../agent/tools.js';
import { validateToolInput } from '../agent/validation.js';
import type { ExpectationObservation } from '../types.js';
import {
  GENERATED_CREDENTIALS_FILE,
  GENERATED_STORAGE_STATE_FILE,
  GENERATED_FLOW_STORAGE_STATE_PREFIX,
} from './generated-file-names.js';
import { GENERATED_CONSENT_HELPER } from './templates/consent-template.js';
import { GENERATED_AUTH_HELPER } from './templates/auth-template.js';
import { GENERATED_FIXTURES_HELPER } from './templates/fixtures-template.js';

export { GENERATED_CREDENTIALS_FILE, GENERATED_STORAGE_STATE_FILE, GENERATED_FLOW_STORAGE_STATE_PREFIX };

export interface CodegenOptions {
  url: string;
  username?: string;
  password?: string;
  storageStatePath?: string;
  /** Set by writeGeneratedSuite when storage state has been copied beside the generated spec. */
  storageStateArtifactPath?: string;
}

export interface FlowEntries {
  /** Human-readable flow summary — codegen turns it into a stable test title. */
  name: string;
  /** Short stable title supplied by the agent, when available. */
  title?: string;
  entries: EvidenceEntry[];
  /** URL captured at the flow's starting point, when it differs from the global CLI URL. */
  startUrl?: string;
  /** JSON-serialized browser storage from the flow's starting point, when it differs from global setup. */
  startStorageState?: string;
  /** Observed JSON responses to replay deterministically before the flow starts. */
  responseFixtures?: ResponseFixture[];
  /** Stable identity of the baseline fixture set shared by this flow and its variants. */
  fixtureBaseId?: string;
  /** Original fixtures used to derive a variant. Present when a variant is generated standalone. */
  baseResponseFixtures?: ResponseFixture[];
  /** Validated response patch that produced this derived flow. */
  responseVariant?: ResponseVariant;
  origin?: 'discovered' | 'derived';
  /** Name of a Playwright `devices` entry the flow was discovered/replayed under (e.g. "iPhone 17").
   * A device profile is only settable at context creation, so a flow that needs one gets its own
   * explicit context in the generated test instead of the shared ambient `page` fixture — otherwise
   * the regression test would silently run on a plain desktop context. */
  devicePreset?: string;
}

export interface GeneratedSpecArtifact {
  relativePath: string;
  content: string;
}

export interface GeneratedSpecBundle {
  spec: string;
  artifacts: GeneratedSpecArtifact[];
}

/**
 * Flow summaries are useful in reports, but they often contain agent/persona labels and concrete
 * data from one run. Keep those details out of generated test titles while retaining the full
 * summary in the report and evidence.
 */
export function formatTestTitle(name: string): string {
  let title = name.replace(/\s+/g, ' ').trim();

  // `run` and some models commonly prefix the summary with e.g. "mia baseline:".
  title = title.replace(/^[^:]{1,80}\b(?:baseline|persona)\s*:\s*/i, '');

  // IDs and other run-specific values make titles noisy and unstable.
  title = title
    .replace(/\b(?:order|transaction|request|session)\s*#\s*[a-z0-9-]+\b/gi, '')
    .replace(/\border(?: number)?\s+[0-9]+\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s,;:.!?-]+$/, '')
    .trim();

  // Prefer an intentional high-level label when a summary uses `label: details` form.
  const label = title.match(/^([^:]{1,100}):/i)?.[1]?.trim();
  if (label && /(?:flow|journey|scenario)$/i.test(label) && !/^(?:flow|journey|scenario|test)$/i.test(label)) {
    title = label;
  }

  title = title
    .replace(/\s+(?:flow|journey|scenario|test)$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+(?:for|with|in|on)$/, '')
    .replace(/[\s,;:.!?-]+$/, '')
    .trim();

  if (!title) return 'Verified user flow';
  if (title.length <= 100) return title;

  const shortened = title
    .slice(0, 100)
    .replace(/\s+\S*$/, '')
    .trim();
  return shortened || 'Verified user flow';
}

/** True only when there is something in the flow's captured storage worth preloading — most flows
 * after the first carry forward an unchanged, empty snapshot, and generating a same-origin context
 * override plus a sidecar file for that would be pure noise. */
function hasMeaningfulStorageState(json: string | undefined): boolean {
  if (!json) return false;
  try {
    const parsed = JSON.parse(json) as { cookies?: unknown[]; origins?: { localStorage?: unknown[] }[] };
    return (
      (parsed.cookies?.length ?? 0) > 0 ||
      (parsed.origins?.some((origin) => (origin.localStorage?.length ?? 0) > 0) ?? false)
    );
  } catch {
    return false;
  }
}

function actionToStatement(
  name: string,
  input: Record<string, unknown>,
  fixtureScenario?: string,
  trackPopups = false,
  devicePreset?: string,
): string | null {
  const locatorExpr = () => toLocatorExpression(input.locator as string);
  const sourceLocatorExpr = () => toLocatorExpression(input.source as string);
  const targetLocatorExpr = () => toLocatorExpression(input.target as string);
  const clickOptionsStatement = (): string => {
    const options: string[] = [];
    if (input.button === 'left' || input.button === 'right' || input.button === 'middle') {
      options.push(`button: '${input.button}'`);
    }
    if (Array.isArray(input.modifiers)) {
      const modifiers = input.modifiers.filter(
        (modifier): modifier is string =>
          typeof modifier === 'string' && ['Alt', 'Control', 'Meta', 'Shift'].includes(modifier),
      );
      if (modifiers.length > 0) options.push(`modifiers: ${JSON.stringify(modifiers)}`);
    }
    return options.length > 0 ? `{ ${options.join(', ')} }` : '';
  };

  switch (name) {
    case 'navigate':
      assertValidWebUrl(input.url, 'Generated navigate URL');
      return `await page.goto('${escapeJsString(input.url as string)}');`;
    case 'click':
      return `await ${locatorExpr()}.click(${clickOptionsStatement()});`;
    case 'doubleClick':
      return `await ${locatorExpr()}.dblclick(${clickOptionsStatement()});`;
    case 'fill':
      return `await ${locatorExpr()}.fill('${escapeJsString(input.value as string)}');`;
    case 'select':
      return `await ${locatorExpr()}.selectOption(${
        Array.isArray(input.value)
          ? `[${input.value.map((value) => `'${escapeJsString(String(value))}'`).join(', ')}]`
          : `'${escapeJsString(input.value as string)}'`
      });`;
    case 'pressKey':
      return `await ${locatorExpr()}.press('${escapeJsString(input.key as string)}');`;
    case 'check':
      return `await ${locatorExpr()}.check();`;
    case 'uncheck':
      return `await ${locatorExpr()}.uncheck();`;
    case 'hover':
      return `await ${locatorExpr()}.hover();`;
    case 'dragAndDrop':
      return `await ${sourceLocatorExpr()}.dragTo(${targetLocatorExpr()});`;
    case 'goBack':
      return `await page.goBack();`;
    case 'goForward':
      return `await page.goForward();`;
    case 'reload':
      return `await page.reload();`;
    case 'clearCookie':
      return input.name
        ? `await page.context().clearCookies({ name: '${escapeJsString(input.name as string)}' });`
        : `await page.context().clearCookies();`;
    // `page` is reassigned in place — it's a normal (destructured) function parameter in the generated
    // test, not a const, so every later statement in the test picks up the new active page for free.
    // Goes through a fresh `browser.newContext()` seeded from the current storageState rather than
    // `page.context().newPage()` — Playwright rejects a second page on the implicit context every page
    // in this codebase is created with ("Please use browser.newContext()").
    case 'openInNewTab':
      return `{ const url = page.url(); const storageState = await page.context().storageState({ indexedDB: true }); const newContext = await browser.newContext(${generatedContextOptions(devicePreset)}); ${fixtureScenario ? `await installFixtures(newContext, loadScenario('${escapeJsString(fixtureScenario)}'));` : ''} page = await newContext.newPage(); await page.goto(url);${trackPopups ? ' registerPopupPage(page);' : ''} }`;
    // A genuine second page of the *same* context — real, live-shared cookies/localStorage, like two
    // real browser tabs — rather than a storageState clone into a fresh context. `tabs` maps every tab
    // id ever opened to its page, mirroring the runtime tab registry: the id formula
    // (`tab-${count so far}`) must match it exactly, since a later switchTab statement was recorded
    // against the id the runtime assigned.
    case 'openTab':
      return `{ const url = page.url(); const newPage = await page.context().newPage(); await newPage.goto(url); tabs[\`tab-\${Object.keys(tabs).length}\`] = page = newPage;${trackPopups ? ' registerPopupPage(newPage);' : ''} }`;
    case 'switchTab':
      return `page = tabs['${escapeJsString(input.tabId as string)}'];`;
    // Closes just the context, not the shared `browser` fixture the test runner owns — closing that
    // would break the runner, not just this one test's simulated "browser restart".
    case 'reopenBrowser':
      return `{ const url = page.url(); const storageState = await page.context().storageState({ indexedDB: true }); await page.context().close(); const newContext = await browser.newContext(${generatedContextOptions(devicePreset)}); ${fixtureScenario ? `await installFixtures(newContext, loadScenario('${escapeJsString(fixtureScenario)}'));` : ''} page = await newContext.newPage(); await page.goto(url);${trackPopups ? ' registerPopupPage(page);' : ''} }`;
    case 'scroll':
      return input.locator ? `await ${locatorExpr()}.scrollIntoViewIfNeeded();` : `await page.mouse.wheel(0, 10000);`;
    case 'setViewportSize':
      return `await page.setViewportSize({ width: ${codegenViewportDimension(input.width, 'width')}, height: ${codegenViewportDimension(input.height, 'height')} });`;
    case 'waitFor':
      return `await ${locatorExpr()}.first().waitFor({ state: 'visible' });`;
    case 'uploadFile':
      return `await ${locatorExpr()}.setInputFiles(${serializeJsValue(input.filePaths)});`;
    case 'download':
      // A real, non-empty saved file, not just the event having fired — the same distinction the
      // live download() action checks (suggestedFilename() alone can't tell a real file from a
      // broken/empty one).
      return `{ const downloadPromise = page.waitForEvent('download'); await ${locatorExpr()}.click(); const download = await downloadPromise; expect(await download.failure()).toBeNull(); const downloadPath = await download.path(); expect(downloadPath).toBeTruthy(); if (downloadPath) { const downloadStats = await stat(downloadPath); expect(downloadStats.size).toBeGreaterThan(0); } }`;
    case 'handleDialog':
      if (input.behavior !== 'accept' && input.behavior !== 'dismiss') {
        throw new Error('Cannot generate handleDialog: behavior must be accept or dismiss.');
      }
      return `page.once('dialog', (dialog) => dialog.${input.behavior}());`;
    case 'burst': {
      // Short on purpose, matching the real `burst()` — a repetition whose target is already gone
      // (an earlier one navigated away) should fail fast, not wait out Playwright's much longer default.
      const count = input.count;
      const innerAction = input.action as string;
      const innerStatement =
        innerAction === 'click'
          ? `await ${locatorExpr()}.click({ timeout: 1000 });`
          : innerAction === 'pressKey'
            ? `await ${locatorExpr()}.press('${escapeJsString(input.key as string)}', { timeout: 1000 });`
            : innerAction === 'check'
              ? `await ${locatorExpr()}.check({ timeout: 1000 });`
              : innerAction === 'uncheck'
                ? `await ${locatorExpr()}.uncheck({ timeout: 1000 });`
                : null;
      if (innerStatement === null) return null;
      // A repetition failing to find its target (typically because an earlier one already navigated
      // away) is the expected, informative case for a burst-tested flow, not a broken test — stopping
      // early here instead of letting the exception fail the whole test mirrors the real `burst()`.
      return `for (let i = 0; i < ${count}; i++) { try { ${innerStatement} } catch { break; } }`;
    }
    case 'simulateFailure': {
      const pattern = escapeJsString(input.urlPattern as string);
      const mode = input.mode as string;
      const modeCode =
        mode === '500' || mode === '503' || mode === '404'
          ? `await route.fulfill({ status: ${mode}, contentType: 'application/json', body: '{"error":"simulated failure"}' });`
          : mode === 'malformed'
            ? `await route.fulfill({ status: 200, contentType: 'application/json', body: '{not valid json' });`
            : mode === 'offline'
              ? `await route.abort('internetdisconnected');`
              : mode === 'connectionReset'
                ? `await route.abort('connectionreset');`
                : mode === 'timeout'
                  ? `await route.fetch(); await route.abort('timedout');`
                  : null;
      if (modeCode === null) return null;
      // Unroute after the route settles, not before — unrouting mid-flight makes Playwright treat the
      // route as already handled and throw on the fulfill/abort call meant to actually settle it.
      return `await page.route('${pattern}', async (route) => { ${modeCode} await page.unroute('${pattern}'); });`;
    }
    case 'simulateLatency': {
      const pattern = escapeJsString(input.urlPattern as string);
      const delayMs = Number(input.delayMs);
      if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 60000) return null;
      return (
        `await page.route('` +
        pattern +
        `', async (route) => { await new Promise((resolve) => setTimeout(resolve, ${delayMs})); await route.continue(); await page.unroute('` +
        pattern +
        `'); });`
      );
    }
    case 'setOffline':
      return `await page.context().setOffline(${input.offline ? 'true' : 'false'});`;
    case 'apiRequest': {
      const method = escapeJsString((input.method as string) ?? 'GET');
      const requestUrl = escapeJsString(input.url as string);
      const headers = input.headers && typeof input.headers === 'object' ? serializeJsValue(input.headers) : undefined;
      return `await page.request.fetch('${requestUrl}', { method: '${method}'${headers ? `, headers: ${headers}` : ''} });`;
    }
    case 'verifyExpectation':
      return null;
    default:
      return null;
  }
}

function expectationToStatement(entry: EvidenceEntry): string | null {
  const observation = validateCodegenExpectation(entry.result?.expectation);
  if (!observation) return null;
  const locator = observation.locator ? toLocatorExpression(observation.locator) : null;
  switch (observation.assertion) {
    case 'visible':
      return locator ? `await expect(${locator}).toBeVisible();` : null;
    case 'hidden':
      return locator ? `await expect(${locator}).not.toBeVisible();` : null;
    case 'containsText':
      return locator && observation.value !== undefined
        ? `await expect(${locator}).toContainText('${escapeJsString(observation.value)}');`
        : null;
    case 'urlContains':
      return observation.value !== undefined
        ? `await expect(page).toHaveURL(new RegExp('${escapeJsString(escapeRegExp(observation.value))}'));`
        : null;
    case 'urlEquals':
      return observation.value !== undefined
        ? `await expect(page).toHaveURL('${escapeJsString(observation.value)}');`
        : null;
    case 'value':
      return locator && observation.value !== undefined
        ? `await expect(${locator}).toHaveValue('${escapeJsString(observation.value)}');`
        : null;
    case 'checked':
      return locator ? `await expect(${locator}).toBeChecked();` : null;
    case 'unchecked':
      return locator ? `await expect(${locator}).not.toBeChecked();` : null;
    case 'disabled':
      return locator ? `await expect(${locator}).toBeDisabled();` : null;
    case 'enabled':
      return locator ? `await expect(${locator}).toBeEnabled();` : null;
    case 'count':
      return locator && observation.expectedCount !== undefined
        ? `await expect(${locator}).toHaveCount(${observation.expectedCount});`
        : null;
    default:
      return null;
  }
}

function validateCodegenExpectation(value: unknown): ExpectationObservation | null {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Cannot generate expectation: expected an object.');
  }

  const observation = value as Record<string, unknown>;
  if (observation.status !== 'met') return null;

  const assertions = new Set([
    'visible',
    'hidden',
    'containsText',
    'urlContains',
    'urlEquals',
    'value',
    'checked',
    'unchecked',
    'disabled',
    'enabled',
    'count',
    'unknown',
  ]);
  if (typeof observation.assertion !== 'string' || !assertions.has(observation.assertion)) {
    throw new Error('Cannot generate expectation: assertion is invalid.');
  }
  if (observation.locator !== undefined && typeof observation.locator !== 'string') {
    throw new Error('Cannot generate expectation: locator must be a string.');
  }
  if (observation.value !== undefined && typeof observation.value !== 'string') {
    throw new Error('Cannot generate expectation: value must be a string.');
  }
  if (
    observation.expectedCount !== undefined &&
    (typeof observation.expectedCount !== 'number' ||
      !Number.isSafeInteger(observation.expectedCount) ||
      observation.expectedCount < 0)
  ) {
    throw new Error('Cannot generate expectation: expectedCount must be a non-negative safe integer.');
  }
  return observation as unknown as ExpectationObservation;
}

function generatedContextOptions(devicePreset?: string): string {
  return devicePreset ? `{ ...devices['${escapeJsString(devicePreset)}'], storageState }` : `{ storageState }`;
}

function codegenViewportDimension(value: unknown, name: string): number {
  const dimension = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(dimension) || dimension <= 0) {
    throw new Error(`Invalid viewport ${name}: expected a positive integer.`);
  }
  return dimension;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Picks the flow's confirmation assertion from the last successful step — prefers a heading (usually the clearest "this is done" signal), falls back to the final URL. */
function findConfirmationAssertion(entries: EvidenceEntry[]): string | null {
  const lastWithResult = [...entries].reverse().find((e) => e.result);
  if (!lastWithResult?.result) return null;

  // A heading with nested children renders wrapped in a quote ("- 'heading "..." [level=N]':") instead
  // of the plain form — the quote must stay optional or such headings never match.
  const headingMatch = lastWithResult.result.snapshot.match(/-\s*'?heading "([^"]+)"/);
  if (headingMatch) {
    // A literal single quote inside the heading text gets YAML-doubled to avoid ending the outer
    // single-quoted wrapper early — undo it, or the assertion targets text the page never renders.
    const headingText = headingMatch[1]!.replace(/''/g, "'");
    // exact: true matters here specifically: getByRole's default name match is a case-insensitive
    // substring, and this heading text is often the literal search keyword just typed — which is
    // then guaranteed to also appear inside every individual result's own title on that same page,
    // turning a plain substring match into a strict-mode violation (resolves to multiple elements).
    return `await expect(page.getByRole('heading', { name: '${escapeJsString(headingText)}', exact: true })).toBeVisible();`;
  }

  // Match origin+pathname only, not the full URL: many sites encode a search timestamp or other
  // request-specific state into the query string, so an exact-URL assertion recorded at discovery
  // time is guaranteed to fail on every later replay even though the flow still lands on the right page.
  const finalUrl = lastWithResult.result.url;
  let matchTarget = finalUrl;
  try {
    const parsed = new URL(finalUrl);
    matchTarget = parsed.origin + parsed.pathname;
  } catch {
    // Keep the full string if it doesn't parse as a URL.
  }
  return `await expect(page).toHaveURL(new RegExp('^${escapeJsString(escapeRegExp(matchTarget))}(?:[?#]|$)'));`;
}

function flowToTest(
  flow: FlowEntries,
  options: CodegenOptions,
  testTitle = formatTestTitle(flow.title ?? flow.name),
  fixtureScenario?: string,
  flowStorageStateArtifact?: string,
): string {
  const toolCalls = flow.entries.filter(
    (entry) => entry.toolCall && !entry.error && entry.toolCall.name !== 'flowComplete',
  );
  // The runtime registers app-opened popups as tab-1, tab-2, ... so a later switchTab can reach
  // them. Generated tests need the same registry whenever a flow switches tabs.
  const needsTabRegistry = toolCalls.some(
    (entry) => entry.toolCall!.name === 'openTab' || entry.toolCall!.name === 'switchTab',
  );
  const tabRegistrySetup = needsTabRegistry
    ? [
        "const tabs: Record<string, typeof page> = { 'tab-0': page };",
        'const popupPages = new WeakSet<typeof page>();',
        'function registerPopupPage(sourcePage: typeof page): void {',
        '  if (popupPages.has(sourcePage)) return;',
        '  popupPages.add(sourcePage);',
        "  sourcePage.on('popup', (popup) => {",
        "    const newId = 'tab-' + Object.keys(tabs).length;",
        '    tabs[newId] = popup;',
        '    registerPopupPage(popup);',
        '  });',
        '}',
        'registerPopupPage(page);',
      ]
    : [];
  // Preserve the original timeline: an expectation may describe an intermediate state (e.g. an
  // item is present in the cart) and must run before later actions navigate away from that state.
  const bodyLines = toolCalls
    .flatMap((entry) => [
      actionToStatement(
        entry.toolCall!.name,
        validateCodegenToolInput(entry.toolCall!.name, entry.toolCall!.input),
        fixtureScenario,
        needsTabRegistry,
        flow.devicePreset,
      ),
      expectationToStatement(entry),
    ])
    .filter((line): line is string => line !== null);

  const assertion = findConfirmationAssertion(flow.entries);
  // A recorded final expectation can already express the flow completion signal. Avoid emitting
  // the same assertion again as a generic confirmation fallback.
  const finalAssertion = assertion && bodyLines.includes(assertion) ? null : assertion;
  const body = [...bodyLines, finalAssertion]
    .filter((line): line is string => line !== null)
    .map((line) => `  ${line}`)
    .join('\n');

  // `openInNewTab`/`reopenBrowser` need the `browser` fixture to open a fresh context from; `openTab`
  // only needs `page.context()`, since it stays in the same context. Every other action only ever
  // needs `page` (reassigned in place when one of those switches it).
  const needsBrowserFixture = toolCalls.some(
    (entry) => entry.toolCall!.name === 'openInNewTab' || entry.toolCall!.name === 'reopenBrowser',
  );
  // A device profile is a newContext()-time-only option (viewport alone can change mid-session,
  // but user agent/touch/scale factor cannot) — a flow discovered under one needs its own explicit
  // context too, exactly like storageState, even when it has no storageState of its own. A flow
  // with its own captured storageState needs the same, for the same reason as a device profile.
  const needsOwnContext = Boolean(flow.devicePreset) || Boolean(flowStorageStateArtifact);
  const fixtureParams =
    needsOwnContext || needsBrowserFixture ? (needsOwnContext ? '{ browser }' : '{ page, browser }') : '{ page }';
  const setupNavigationLines =
    options.username && options.password
      ? [
          `await page.goto('${escapeJsString(options.url)}');`,
          // A consent banner can cover the login form itself, so it must clear before login looks for one.
          'await dismissConsentBanner(page);',
          'await loginWithConfiguredCredentials(page);',
          ...(flow.startUrl && flow.startUrl !== options.url
            ? [`await page.goto('${escapeJsString(flow.startUrl)}');`, 'await dismissConsentBanner(page);']
            : []),
        ]
      : [`await page.goto('${escapeJsString(flow.startUrl ?? options.url)}');`, 'await dismissConsentBanner(page);'];
  if (needsOwnContext) {
    const contextOptionEntries = [
      ...(flow.devicePreset ? [`...devices['${escapeJsString(flow.devicePreset)}']`] : []),
      // A flow's own captured storageState reflects exactly what it was verified against, and
      // takes priority over the global one — the same rule the live replay already follows
      // (see replay-execution.ts's flowStorageState).
      ...(flowStorageStateArtifact
        ? [`storageState: join(generatedSuiteDirectory, '${escapeJsString(flowStorageStateArtifact)}')`]
        : options.storageStatePath
          ? [
              options.storageStateArtifactPath
                ? `storageState: join(generatedSuiteDirectory, '${escapeJsString(options.storageStateArtifactPath)}')`
                : `storageState: '${escapeJsString(options.storageStatePath)}'`,
            ]
          : []),
    ];
    const contextOptions = contextOptionEntries.length ? `{ ${contextOptionEntries.join(', ')} }` : '';
    const indentedBody = body
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n');
    const setupLines = [
      ...tabRegistrySetup,
      ...(fixtureScenario
        ? [`await installFixtures(page.context(), loadScenario('${escapeJsString(fixtureScenario)}'));`]
        : []),
      ...setupNavigationLines,
    ]
      .map((line) => `  ${line}`)
      .join('\n');
    return `test('${escapeJsString(testTitle)}', async (${fixtureParams}) => {
  const flowContext = await browser.newContext(${contextOptions});
  let page = await flowContext.newPage();
${setupLines}
  try {
${indentedBody}
  } finally {
    await flowContext.close();
  }
});`;
  }

  const setup = [
    ...tabRegistrySetup,
    ...(fixtureScenario
      ? [
          `const responseFixtures = loadScenario('${escapeJsString(fixtureScenario)}');`,
          'await installFixtures(page.context(), responseFixtures);',
        ]
      : []),
    ...setupNavigationLines,
  ]
    .map((line) => `  ${line}`)
    .join('\n');
  return `test('${escapeJsString(testTitle)}', async (${fixtureParams}) => {\n${setup}\n${body}\n});`;
}

function validateCodegenToolInput(name: string, input: Record<string, unknown>): Record<string, unknown> {
  const definition = TOOL_DEFINITIONS.find((candidate) => candidate.name === name);
  if (!definition) throw new Error(`Cannot generate ${name}: unknown tool.`);
  if (name === 'burst') assertValidBurstCount(input.count, 'Cannot generate burst');
  try {
    return validateToolInput(definition, input);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot generate ${name}: ${detail}`, { cause: error });
  }
}

function fixtureFileContent(fixtures: ResponseFixture[]): string {
  return JSON.stringify(fixtures, null, 2) + '\n';
}

function variantFileContent(baselineFile: string, variant: ResponseVariant): string {
  return (
    JSON.stringify(
      {
        base: baselineFile,
        sourceMethod: variant.sourceMethod,
        sourceUrl: variant.sourceUrl,
        sourceOccurrence: variant.sourceOccurrence,
        patches: variant.patches,
      },
      null,
      2,
    ) + '\n'
  );
}

interface FixtureScenarioPlan {
  scenarioNames: string[];
  artifacts: GeneratedSpecArtifact[];
}

function planFixtureScenarios(flows: FlowEntries[]): FixtureScenarioPlan {
  const scenarioNames = new Array<string>(flows.length);
  const artifacts: GeneratedSpecArtifact[] = [];
  const baseFiles = new Map<string, string>();
  const baseScenarioNames = new Map<string, string>();
  const variantCounts = new Map<string, number>();

  for (let index = 0; index < flows.length; index += 1) {
    const flow = flows[index]!;
    const hasFixtures = (flow.responseFixtures?.length ?? 0) > 0;
    const hasBaseFixtures = (flow.baseResponseFixtures?.length ?? 0) > 0;
    if (!hasFixtures && !hasBaseFixtures) continue;

    const baseKey = flow.fixtureBaseId ?? `flow-${index + 1}`;
    let baseScenario = baseScenarioNames.get(baseKey);
    if (!baseScenario) {
      const baseNumber = baseScenarioNames.size + 1;
      baseScenario = `flow-${String(baseNumber).padStart(3, '0')}.base`;
      baseScenarioNames.set(baseKey, baseScenario);
      const baseFixtures = flow.baseResponseFixtures ?? flow.responseFixtures ?? [];
      const baseFile = `${baseScenario}.json`;
      baseFiles.set(baseKey, baseFile);
      artifacts.push({ relativePath: `fixtures/${baseFile}`, content: fixtureFileContent(baseFixtures) });
    }

    if (flow.origin === 'derived' && flow.responseVariant) {
      const variantNumber = (variantCounts.get(baseKey) ?? 0) + 1;
      variantCounts.set(baseKey, variantNumber);
      const scenario = `${baseScenario.replace(/\.base$/, '')}-variant-${String(variantNumber).padStart(3, '0')}`;
      const baseFile = baseFiles.get(baseKey)!;
      artifacts.push({
        relativePath: `fixtures/${scenario}.json`,
        content: variantFileContent(baseFile, flow.responseVariant),
      });
      scenarioNames[index] = scenario;
    } else {
      scenarioNames[index] = baseScenario;
    }
  }

  return { scenarioNames, artifacts };
}

/** One session can discover several distinct flows — each becomes its own independent `test()` with its own setup and response fixtures. */
export function generateSpecBundle(flows: FlowEntries[], options: CodegenOptions): GeneratedSpecBundle {
  assertValidWebUrl(options.url, 'Codegen target URL');
  for (const [index, flow] of flows.entries()) {
    if (flow.startUrl !== undefined) assertValidWebUrl(flow.startUrl, `Codegen flow ${index + 1} start URL`);
  }
  const fixturePlan = planFixtureScenarios(flows);
  const hasStorageState = Boolean(options.storageStatePath);
  const hasLogin = !hasStorageState && Boolean(options.username && options.password);
  const hasFixtures = fixturePlan.artifacts.length > 0;
  const hasDeviceProfile = flows.some((flow) => Boolean(flow.devicePreset));
  const hasDownload = flows.some((flow) => flow.entries.some((entry) => entry.toolCall?.name === 'download'));
  // index+1, zero-padded to match the flow-NNN convention planFixtureScenarios already uses.
  const flowStorageStateArtifacts = new Map<number, string>();
  flows.forEach((flow, index) => {
    if (hasMeaningfulStorageState(flow.startStorageState)) {
      flowStorageStateArtifacts.set(
        index,
        `${GENERATED_FLOW_STORAGE_STATE_PREFIX}${String(index + 1).padStart(3, '0')}.json`,
      );
    }
  });

  const parts: string[] = [
    hasDeviceProfile
      ? "import { test, expect, devices } from 'playwright/test';"
      : "import { test, expect } from 'playwright/test';",
    // Unconditional, unlike auth.ts/fixtures.ts: whether the target needs a cookie/consent banner
    // dismissed has nothing to do with whether it has login or captured response fixtures.
    "import { dismissConsentBanner } from './consent.js';",
  ];
  if (hasLogin) parts.push("import { loginWithConfiguredCredentials } from './auth.js';");
  if (hasFixtures) parts.push("import { installFixtures, loadScenario } from './fixtures.js';");
  if (hasDownload) parts.push("import { stat } from 'node:fs/promises';");

  // Needed either for the one global test.use() below, or for any per-flow storageState context
  // option — both reference the same generatedSuiteDirectory helper.
  if ((hasStorageState && options.storageStateArtifactPath) || flowStorageStateArtifacts.size > 0) {
    parts.push("import { dirname, join } from 'node:path';");
    parts.push("import { fileURLToPath } from 'node:url';");
    parts.push('const generatedSuiteDirectory = dirname(fileURLToPath(import.meta.url));');
  }
  if (hasStorageState) {
    parts.push(
      options.storageStateArtifactPath
        ? `test.use({ storageState: join(generatedSuiteDirectory, '${escapeJsString(options.storageStateArtifactPath)}') });`
        : `test.use({ storageState: '${escapeJsString(options.storageStatePath!)}' });`,
    );
  }
  const baseTitleCounts = new Map<string, number>();
  for (const flow of flows) {
    const baseTitle = formatTestTitle(flow.title ?? flow.name);
    baseTitleCounts.set(baseTitle, (baseTitleCounts.get(baseTitle) ?? 0) + 1);
  }

  const usedTitles = new Set<string>();
  for (const [index, flow] of flows.entries()) {
    const baseTitle = formatTestTitle(flow.title ?? flow.name);
    const detailTitle = formatTestTitle(flow.name);
    let testTitle =
      baseTitleCounts.get(baseTitle) === 1 || detailTitle === baseTitle ? baseTitle : `${baseTitle} - ${detailTitle}`;
    const titleRoot = testTitle;
    let suffix = 2;
    while (usedTitles.has(testTitle)) {
      testTitle = `${titleRoot} (${suffix++})`;
    }
    usedTitles.add(testTitle);
    parts.push(
      flowToTest(flow, options, testTitle, fixturePlan.scenarioNames[index], flowStorageStateArtifacts.get(index)),
    );
  }

  const flowStorageStateFiles: GeneratedSpecArtifact[] = flows.flatMap((flow, index) => {
    const relativePath = flowStorageStateArtifacts.get(index);
    if (!relativePath) return [];
    const content = JSON.stringify(JSON.parse(flow.startStorageState!), null, 2) + '\n';
    return [{ relativePath, content }];
  });

  return {
    spec: parts.join('\n\n') + '\n',
    artifacts: [
      { relativePath: 'consent.ts', content: GENERATED_CONSENT_HELPER },
      ...flowStorageStateFiles,
      ...(hasLogin
        ? [
            { relativePath: 'auth.ts', content: GENERATED_AUTH_HELPER },
            {
              relativePath: GENERATED_CREDENTIALS_FILE,
              content: JSON.stringify({ username: options.username, password: options.password }, null, 2) + '\n',
            },
          ]
        : []),
      ...(hasFixtures
        ? [{ relativePath: 'fixtures.ts', content: GENERATED_FIXTURES_HELPER }, ...fixturePlan.artifacts]
        : []),
    ],
  };
}

export function generateSpec(flows: FlowEntries[], options: CodegenOptions): string {
  return generateSpecBundle(flows, options).spec;
}
