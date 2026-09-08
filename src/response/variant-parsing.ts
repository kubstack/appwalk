import {
  jsonClone,
  type ResponseFixture,
  type ResponseFixtureSelector,
  type ResponsePatch,
  type ResponseVariant,
  type ResponseVariantParseResult,
} from './types.js';

function parsePath(path: string): Array<string | number> | null {
  if (path === '$' || !path.startsWith('$')) return null;
  const tokens: Array<string | number> = [];
  const expression = path.slice(1);
  let offset = 0;
  while (offset < expression.length) {
    if (expression[offset] === '.') {
      const match = /^\.([A-Za-z_][A-Za-z0-9_-]*)/.exec(expression.slice(offset));
      if (!match) return null;
      tokens.push(match[1]!);
      offset += match[0].length;
      continue;
    }
    if (expression[offset] === '[') {
      const match = /^\[(\d+)\]/.exec(expression.slice(offset));
      if (!match) return null;
      tokens.push(Number(match[1]));
      offset += match[0].length;
      continue;
    }
    return null;
  }
  return tokens.length > 0 ? tokens : null;
}

function setExistingJsonPath(root: unknown, path: string, value: unknown): boolean {
  const tokens = parsePath(path);
  if (!tokens) return false;
  let current: unknown = root;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index]!;
    if (current === null || typeof current !== 'object' || !(token in current)) return false;
    current = (current as Record<string | number, unknown>)[token];
  }
  const last = tokens[tokens.length - 1]!;
  if (current === null || typeof current !== 'object' || !(last in current)) return false;
  (current as Record<string | number, unknown>)[last] = jsonClone(value);
  return true;
}

export function applyResponseVariant(fixtures: ResponseFixture[], variant: ResponseVariant): ResponseFixture[] | null {
  const matches = fixtures.filter((fixture) => fixture.url === variant.sourceUrl);
  const methodMatches = variant.sourceMethod
    ? matches.filter((fixture) => fixture.method === variant.sourceMethod)
    : matches;
  const source =
    variant.sourceOccurrence !== undefined
      ? methodMatches.find((fixture) => fixture.occurrence === variant.sourceOccurrence)
      : methodMatches.length === 1
        ? methodMatches[0]
        : undefined;
  if (!source) return null;
  const next = fixtures.map((fixture) => ({ ...fixture, body: jsonClone(fixture.body) }));
  const sourceIndex = fixtures.indexOf(source);
  const target = next[sourceIndex];
  if (!target) return null;
  for (const patch of variant.patches) {
    if (!setExistingJsonPath(target.body, patch.path, patch.value)) return null;
  }
  return next;
}

export function responseFixtureMatchesSelector(fixture: ResponseFixture, selector: ResponseFixtureSelector): boolean {
  return (
    fixture.url === selector.url &&
    (!selector.method || fixture.method === selector.method) &&
    (selector.occurrence === undefined || fixture.occurrence === selector.occurrence)
  );
}

function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(text)?.[1];
  const candidate = fenced ?? text.match(/[[{][\s\S]*[\]}]/)?.[0];
  if (!candidate) return undefined;
  try {
    return JSON.parse(candidate);
  } catch {
    return undefined;
  }
}

export function parseResponseVariantsDetailed(
  text: string,
  fixtures: ResponseFixture[],
  maxVariants?: number,
): ResponseVariantParseResult {
  if (maxVariants !== undefined && maxVariants <= 0) {
    return { variants: [], candidates: 0, rejected: 0, rejectionReasons: [], reason: 'Variant planning is disabled.' };
  }
  const parsed = extractJson(text);
  let candidates: unknown[];
  let plannerReason: string | undefined;
  if (Array.isArray(parsed)) {
    candidates = parsed;
  } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).variants)) {
    candidates = (parsed as { variants: unknown[] }).variants;
    plannerReason =
      typeof (parsed as Record<string, unknown>).reason === 'string'
        ? ((parsed as Record<string, unknown>).reason as string).trim()
        : undefined;
  } else {
    return {
      variants: [],
      candidates: 0,
      rejected: 0,
      rejectionReasons: [],
      reason: 'Planner response was not a valid response object or array.',
    };
  }
  const knownUrls = new Set(fixtures.map((fixture) => fixture.url));
  const variants: ResponseVariant[] = [];
  const rejectionReasons: string[] = [];
  let rejected = 0;
  const reject = (reason: string) => {
    rejected += 1;
    if (!rejectionReasons.includes(reason)) rejectionReasons.push(reason);
  };
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') {
      reject('proposal was not an object');
      continue;
    }
    const value = candidate as Record<string, unknown>;
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    const sourceMethod = typeof value.sourceMethod === 'string' ? value.sourceMethod.toUpperCase() : undefined;
    const sourceUrl = typeof value.sourceUrl === 'string' ? value.sourceUrl : '';
    const rawSourceOccurrence = value.sourceOccurrence;
    if (
      rawSourceOccurrence !== undefined &&
      (!Number.isSafeInteger(rawSourceOccurrence) || (rawSourceOccurrence as number) < 1)
    ) {
      reject('sourceOccurrence was invalid');
      continue;
    }
    const sourceOccurrence = rawSourceOccurrence as number | undefined;
    if (!name || !knownUrls.has(sourceUrl) || !Array.isArray(value.patches) || value.patches.length === 0) {
      reject('name, exact sourceUrl, or patches were missing');
      continue;
    }
    if (sourceMethod && !fixtures.some((fixture) => fixture.url === sourceUrl && fixture.method === sourceMethod)) {
      reject('sourceMethod did not match the captured response');
      continue;
    }
    const sourceMatches = fixtures.filter(
      (fixture) => fixture.url === sourceUrl && (!sourceMethod || fixture.method === sourceMethod),
    );
    if (!sourceMethod && new Set(sourceMatches.map((fixture) => fixture.method)).size > 1) {
      reject('sourceMethod was required for an ambiguous URL');
      continue;
    }
    if (sourceOccurrence !== undefined && !sourceMatches.some((fixture) => fixture.occurrence === sourceOccurrence)) {
      reject('sourceOccurrence did not match the captured response');
      continue;
    }
    if (sourceOccurrence === undefined && sourceMatches.length > 1) {
      reject('sourceOccurrence was required for a repeated response');
      continue;
    }
    const rawExpectation = value.expectation;
    if (!rawExpectation || typeof rawExpectation !== 'object') {
      reject('expectation was missing');
      continue;
    }
    const expectationValue = rawExpectation as Record<string, unknown>;
    const assertion = expectationValue.assertion;
    if (
      assertion !== 'visible' &&
      assertion !== 'hidden' &&
      assertion !== 'containsText' &&
      assertion !== 'urlContains' &&
      assertion !== 'urlEquals'
    ) {
      reject('expectation assertion was invalid');
      continue;
    }
    const locator = typeof expectationValue.locator === 'string' ? expectationValue.locator : undefined;
    const expectedValue = typeof expectationValue.value === 'string' ? expectationValue.value : undefined;
    if ((assertion === 'visible' || assertion === 'hidden' || assertion === 'containsText') && !locator) {
      reject('expectation locator was missing');
      continue;
    }
    if (
      (assertion === 'containsText' || assertion === 'urlContains' || assertion === 'urlEquals') &&
      expectedValue === undefined
    ) {
      reject('expectation value was missing');
      continue;
    }
    const patches: ResponsePatch[] = [];
    for (const patch of value.patches) {
      if (!patch || typeof patch !== 'object') continue;
      const item = patch as Record<string, unknown>;
      if (typeof item.path !== 'string' || item.value === undefined || !parsePath(item.path)) continue;
      patches.push({ path: item.path, value: item.value });
    }
    if (patches.length === 0) {
      reject('no patch targeted an existing JSON path');
      continue;
    }
    const variant: ResponseVariant = {
      name,
      sourceMethod,
      sourceUrl,
      sourceOccurrence,
      patches,
      expectation: { assertion, locator, value: expectedValue },
      reason: typeof value.reason === 'string' ? value.reason.trim() : undefined,
    };
    if (!applyResponseVariant(fixtures, variant)) {
      reject('patch did not apply to the captured response');
      continue;
    }
    variants.push(variant);
    if (maxVariants !== undefined && variants.length >= maxVariants) break;
  }
  return {
    variants,
    candidates: candidates.length,
    rejected,
    rejectionReasons,
    reason:
      candidates.length === 0
        ? plannerReason
          ? `Planner returned no variant proposals: ${plannerReason}`
          : 'Planner returned no variant proposals.'
        : variants.length === 0
          ? 'All planner proposals were rejected by Appwalk validation.'
          : undefined,
    plannerReason,
  };
}

export function parseResponseVariants(
  text: string,
  fixtures: ResponseFixture[],
  maxVariants?: number,
): ResponseVariant[] {
  return parseResponseVariantsDetailed(text, fixtures, maxVariants).variants;
}
