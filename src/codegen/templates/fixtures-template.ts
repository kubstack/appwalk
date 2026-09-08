export const GENERATED_FIXTURES_HELPER = `import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext } from 'playwright/test';

type ResponseFixture = {
  method: string;
  url: string;
  occurrence?: number;
  urlPattern?: string;
  status: number;
  body: unknown;
};

type ResponsePatch = { path: string; value: unknown };
type VariantScenario = {
  base: string;
  sourceMethod?: string;
  sourceUrl: string;
  sourceOccurrence?: number;
  patches: ResponsePatch[];
};
type FixtureQueue = { items: ResponseFixture[]; next: number };

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function parsePath(path: string): Array<string | number> | null {
  if (path === '$' || !path.startsWith('$')) return null;
  const tokens: Array<string | number> = [];
  let offset = 1;
  while (offset < path.length) {
    if (path[offset] === '.') {
      const match = /^\\.([A-Za-z_][A-Za-z0-9_-]*)/.exec(path.slice(offset));
      if (!match) return null;
      tokens.push(match[1]!);
      offset += match[0].length;
      continue;
    }
    if (path[offset] === '[') {
      const match = /^\\[(\\d+)\\]/.exec(path.slice(offset));
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
  (current as Record<string | number, unknown>)[last] = clone(value);
  return true;
}

export function loadScenario(name: string): ResponseFixture[] {
  const source = readJson<ResponseFixture[] | VariantScenario>(join(fixtureDirectory, name + '.json'));
  if (Array.isArray(source)) return source;
  const fixtures = readJson<ResponseFixture[]>(join(fixtureDirectory, source.base)).map((fixture) => ({ ...fixture, body: clone(fixture.body) }));
  const matches = fixtures.filter((fixture) => fixture.url === source.sourceUrl && (!source.sourceMethod || fixture.method === source.sourceMethod));
  const target = source.sourceOccurrence === undefined
    ? matches.length === 1 ? matches[0] : undefined
    : matches.find((fixture) => fixture.occurrence === source.sourceOccurrence);
  if (!target) throw new Error('Response variant could not locate its captured source response.');
  for (const patch of source.patches) {
    if (!setExistingJsonPath(target.body, patch.path, patch.value)) {
      throw new Error('Response variant patch could not be applied: ' + patch.path);
    }
  }
  return fixtures;
}

export async function installFixtures(context: BrowserContext, fixtures: ResponseFixture[]): Promise<void> {
  const patternGroups = new Map<string, ResponseFixture[]>();
  for (const fixture of fixtures) {
    const pattern = fixture.urlPattern ?? fixture.url;
    const group = patternGroups.get(pattern) ?? [];
    group.push(fixture);
    patternGroups.set(pattern, group);
  }
  for (const [pattern, group] of patternGroups) {
    const exactQueues = new Map<string, FixtureQueue>();
    for (const fixture of group) {
      const exactKey = fixture.method + ' ' + fixture.url;
      const exactQueue = exactQueues.get(exactKey) ?? { items: [], next: 0 };
      exactQueue.items.push(fixture);
      exactQueues.set(exactKey, exactQueue);
    }
    await context.route(pattern, async (route) => {
      const method = route.request().method();
      const queue = exactQueues.get(method + ' ' + route.request().url());
      if (!queue || queue.items.length === 0) {
        await route.continue();
        return;
      }
      const fixture = queue.items[Math.min(queue.next++, queue.items.length - 1)]!;
      await route.fulfill({ status: fixture.status, contentType: 'application/json', body: JSON.stringify(fixture.body) });
    });
  }
}
`;
