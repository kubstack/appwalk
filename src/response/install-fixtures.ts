import type { Page } from 'playwright';
import { responseFixtureUrlPattern } from './extraction.js';
import type { ResponseFixture, ResponseFixtureInstallOptions } from './types.js';

export async function installResponseFixtures(
  page: Page,
  fixtures: ResponseFixture[],
  options: ResponseFixtureInstallOptions = {},
): Promise<void> {
  type FixtureQueue = { items: ResponseFixture[]; next: number };
  const patternGroups = new Map<string, ResponseFixture[]>();
  for (const fixture of fixtures) {
    const pattern = fixture.urlPattern ?? responseFixtureUrlPattern(fixture.url);
    const group = patternGroups.get(pattern) ?? [];
    group.push(fixture);
    patternGroups.set(pattern, group);
  }

  for (const [pattern, group] of patternGroups) {
    const exactQueues = new Map<string, FixtureQueue>();
    for (const fixture of group) {
      const exactKey = `${fixture.method} ${fixture.url}`;
      const exactQueue = exactQueues.get(exactKey) ?? { items: [], next: 0 };
      exactQueue.items.push(fixture);
      exactQueues.set(exactKey, exactQueue);
    }

    await page.route(pattern, async (route) => {
      const method = route.request().method();
      const exactQueue = exactQueues.get(`${method} ${route.request().url()}`);
      if (!exactQueue || exactQueue.items.length === 0) {
        await route.continue();
        return;
      }
      const fixture = exactQueue.items[Math.min(exactQueue.next, exactQueue.items.length - 1)]!;
      exactQueue.next += 1;
      await route.fulfill({
        status: fixture.status,
        contentType: 'application/json',
        body: JSON.stringify(fixture.body),
      });
      options.onFixtureApplied?.(fixture, route.request().url());
    });
  }
}
