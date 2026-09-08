import { LOGIN_CONTRACT } from '../../browser/login-contract.js';
import { GENERATED_CREDENTIALS_FILE } from '../generated-file-names.js';

// Generated login stays standalone for the user's test project. Its selectors and route rules
// come from LOGIN_CONTRACT, so the runtime and generated helper share the same login assumptions.
// English label text only works on English-language UIs; HTML input types are language-independent,
// so structural signals are tried first, with English text as a fallback.
export const GENERATED_AUTH_HELPER = `import type { Locator, Page } from 'playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Credentials = { username: string; password: string };

function readLocalCredentials(): Credentials | null {
  const credentialsPath = join(dirname(fileURLToPath(import.meta.url)), '${GENERATED_CREDENTIALS_FILE}');
  try {
    const parsed = JSON.parse(readFileSync(credentialsPath, 'utf8')) as Partial<Credentials>;
    if (typeof parsed.username !== 'string' || typeof parsed.password !== 'string') {
      throw new Error('must contain string username and password fields');
    }
    return { username: parsed.username, password: parsed.password };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error('Unable to read ${GENERATED_CREDENTIALS_FILE}: ' + detail);
  }
}

function readCredentials(): Credentials {
  const localCredentials = readLocalCredentials();
  if (localCredentials) return localCredentials;

  const username = process.env.APPWALK_USERNAME;
  const password = process.env.APPWALK_PASSWORD;
  if (username && password) return { username, password };
  throw new Error('Credentials not found. Keep ${GENERATED_CREDENTIALS_FILE} next to auth.ts or set APPWALK_USERNAME and APPWALK_PASSWORD.');
}

async function findLoginField(root: Page | Locator, ...patterns: RegExp[]): Promise<Locator | null> {
  for (const pattern of patterns) {
    const byLabel = root.getByLabel(pattern);
    if ((await byLabel.count()) > 0) return byLabel.first();
  }
  for (const pattern of patterns) {
    const byRole = root.getByRole('textbox', { name: pattern });
    if ((await byRole.count()) > 0) return byRole.first();
  }
  return null;
}

export async function loginWithCredentials(page: Page, username: string, password: string): Promise<void> {
  let passwordField = page.locator('${LOGIN_CONTRACT.passwordSelector}').first();
  if ((await passwordField.count()) === 0) {
    const loginTrigger = page.getByRole('button', { name: /${LOGIN_CONTRACT.triggerPattern}/i })
      .or(page.getByRole('link', { name: /${LOGIN_CONTRACT.triggerPattern}/i })).first();
    if ((await loginTrigger.count()) > 0) {
      await loginTrigger.click();
      await passwordField.waitFor({ state: 'visible' });
    }
  }
  const loginPageUrl = page.url();
  if ((await passwordField.count()) === 0) {
    const byLabel = await findLoginField(page, /password/i);
    if (!byLabel) throw new Error('Login form not found. Use --storage-state if the site uses SSO, 2FA, or has no password login.');
    passwordField = byLabel;
  }

  const form = page.locator('${LOGIN_CONTRACT.formSelector}').first();
  const loginScope = (await form.count()) > 0
    ? form
    : passwordField.locator("xpath=ancestor::*[.//button or .//input[@type='submit']][1]");

  let usernameField = loginScope.locator('${LOGIN_CONTRACT.usernameSelector}').first();
  if ((await usernameField.count()) === 0) {
    const byLabel = await findLoginField(loginScope, /username/i, /e-?mail/i);
    if (byLabel) {
      usernameField = byLabel;
    } else {
      usernameField = loginScope.locator('${LOGIN_CONTRACT.usernameFallbackSelector}').first();
    }
  }

  await usernameField.fill(username);
  await passwordField.fill(password);

  const loginPattern = /${LOGIN_CONTRACT.triggerPattern}/i;
  const localLoginButtons = loginScope.getByRole('button', { name: loginPattern });
  if ((await localLoginButtons.count()) > 0) {
    await localLoginButtons.last().click();
  } else {
    const formSubmit = loginScope.locator('${LOGIN_CONTRACT.submitSelector}').first();
    if ((await formSubmit.count()) > 0) {
      await formSubmit.click();
    } else {
      const pageLoginButtons = page.getByRole('button', { name: loginPattern });
      if ((await pageLoginButtons.count()) === 0) {
        throw new Error('Login submit control not found. Use --storage-state if the site uses a custom login flow.');
      }
      await pageLoginButtons.last().click();
    }
  }

  await Promise.race([
    page.waitForURL((nextUrl: URL) => nextUrl.toString() !== loginPageUrl, { timeout: 10000 }),
    passwordField.waitFor({ state: 'hidden', timeout: 10000 }),
  ]).catch(() => undefined);

  let stillOnPasswordField = await page
    .locator('${LOGIN_CONTRACT.passwordSelector}')
    .first()
    .isVisible()
    .catch(() => false);
  if (stillOnPasswordField && page.url() !== loginPageUrl) {
    await page.locator('${LOGIN_CONTRACT.passwordSelector}').first().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
    stillOnPasswordField = await page
      .locator('${LOGIN_CONTRACT.passwordSelector}')
      .first()
      .isVisible()
      .catch(() => false);
  }
  const finalPath = new URL(page.url()).pathname.toLowerCase();
  const remainsOnLoginRoute = /${LOGIN_CONTRACT.loginRoutePattern}/.test(finalPath);
  if (stillOnPasswordField || page.url() === loginPageUrl || remainsOnLoginRoute) {
    const message = stillOnPasswordField
      ? 'Login did not complete. Check credentials or use --storage-state for 2FA, SSO, or CAPTCHA.'
      : 'Login outcome could not be verified. Use --storage-state if the app keeps the login route after authentication.';
    throw new Error(message);
  }
}

export async function loginWithConfiguredCredentials(page: Page): Promise<void> {
  const { username, password } = readCredentials();
  await loginWithCredentials(page, username, password);
}`;
