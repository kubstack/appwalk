import type { Page } from 'playwright';

// Known consent-management-platform "accept all" controls, id/class based so they don't depend
// on the target's language. One entry per CMP actually observed on a real target — add another
// selector here when a new one surfaces, rather than guessing ahead of evidence. Shared between
// the runtime (dismissKnownConsentBanner below) and codegen, which serializes this same list into
// the generated suite's consent.ts so a standalone replay gets identical behavior.
export const CONSENT_ACCEPT_SELECTORS: readonly string[] = [
  '#didomi-notice-agree-button', // Didomi
  '#onetrust-accept-btn-handler', // OneTrust
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', // Cookiebot
  '.qc-cmp2-summary-buttons button[mode="primary"]', // Quantcast Choice (Sourcepoint)
  '#consent_prompt_submit', // TrustArc
  'button[data-testid="uc-accept-all-button"]', // Usercentrics
];

const CLICK_TIMEOUT_MS = 1500;

/**
 * Best-effort, one-shot dismissal of a known consent-management-platform banner, tried once right
 * after a fresh page load — before the agent's first turn or a replay's first recorded action, so
 * neither ever has to spend a step recognizing and clicking it. Each selector is checked for DOM
 * presence first (near-instant) and only clicked (with a short timeout) when actually present, so
 * the common case of no matching CMP at all — most non-EU targets, or a session that already
 * consented — costs a handful of cheap existence checks, not a long wait.
 */
export async function dismissKnownConsentBanner(page: Page): Promise<void> {
  for (const selector of CONSENT_ACCEPT_SELECTORS) {
    const locator = page.locator(selector).first();
    try {
      if ((await locator.count()) === 0) continue;
      await locator.click({ timeout: CLICK_TIMEOUT_MS });
      return;
    } catch {
      // Present but not clickable in time (still animating in, already gone, covered by
      // something else) — try the next known selector rather than giving up entirely.
    }
  }
}
