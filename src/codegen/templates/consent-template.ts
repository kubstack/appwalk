import { CONSENT_ACCEPT_SELECTORS } from '../../browser/consent.js';

// Selectors come from CONSENT_ACCEPT_SELECTORS, so the runtime and this generated helper stay in
// sync with the same list of known consent-management platforms.
export const GENERATED_CONSENT_HELPER = `import type { Page } from 'playwright/test';

const CONSENT_ACCEPT_SELECTORS: readonly string[] = ${JSON.stringify(CONSENT_ACCEPT_SELECTORS)};

export async function dismissConsentBanner(page: Page): Promise<void> {
  for (const selector of CONSENT_ACCEPT_SELECTORS) {
    const locator = page.locator(selector).first();
    try {
      if ((await locator.count()) === 0) continue;
      await locator.click({ timeout: 1500 });
      return;
    } catch {
      // Present but not clickable in time — try the next known selector.
    }
  }
}
`;
