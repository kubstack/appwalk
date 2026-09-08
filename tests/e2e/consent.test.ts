import { mkdtempSync, rmSync } from 'node:fs';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { chromium } from 'playwright';
import { dismissKnownConsentBanner } from '../../src/browser/consent.js';
import { writeGeneratedSuite } from '../../src/cli/generated-suite.js';

async function consentFixturePage(browser: import('playwright').Browser) {
  const page = await browser.newPage();
  await page.route('https://app.test/', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: `
        <div id="didomi-host">
          <div>We use cookies</div>
          <button id="didomi-notice-agree-button">Agree</button>
        </div>
        <main><h1>Home</h1></main>
        <script>
          document.querySelector('#didomi-notice-agree-button').addEventListener('click', () => {
            document.querySelector('#didomi-host').remove();
          });
        </script>
      `,
    });
  });
  return page;
}

test('dismisses a known consent-management-platform banner by its accept-all control', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await consentFixturePage(browser);
    await page.goto('https://app.test/');
    assert.equal(await page.locator('#didomi-notice-agree-button').count(), 1);

    await dismissKnownConsentBanner(page);

    await page.locator('#didomi-host').waitFor({ state: 'detached' });
  } finally {
    await browser.close();
  }
});

test('runtime and generated consent helpers dismiss the same banner', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'appwalk-consent-contract-'));
  const browser = await chromium.launch({ headless: true });
  try {
    writeGeneratedSuite(directory, [{ name: 'Browse', entries: [] }], { url: 'https://app.test/' });
    const generatedConsent = (await import(
      `${pathToFileURL(join(directory, 'consent.ts'))}?contract=${Date.now()}`
    )) as {
      dismissConsentBanner: (page: import('playwright').Page) => Promise<void>;
    };

    const runtimePage = await consentFixturePage(browser);
    const generatedPage = await consentFixturePage(browser);
    await runtimePage.goto('https://app.test/');
    await generatedPage.goto('https://app.test/');

    await dismissKnownConsentBanner(runtimePage);
    await generatedConsent.dismissConsentBanner(generatedPage);

    await runtimePage.locator('#didomi-host').waitFor({ state: 'detached' });
    await generatedPage.locator('#didomi-host').waitFor({ state: 'detached' });
  } finally {
    await browser.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('is a fast no-op when no known consent banner is present', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://app.test/', async (route) => {
      await route.fulfill({ contentType: 'text/html', body: '<main><h1>Home</h1></main>' });
    });
    await page.goto('https://app.test/');

    const startedAt = Date.now();
    await dismissKnownConsentBanner(page);
    assert.ok(Date.now() - startedAt < 2000, 'absence of every known selector must not incur a long wait');

    assert.match(await page.locator('main').innerText(), /Home/);
  } finally {
    await browser.close();
  }
});
