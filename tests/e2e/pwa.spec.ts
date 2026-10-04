// owner: step 5.1. The installable, offline PWA (Blueprint §10) against the E2E (production) build:
// manifest + icons under the base path, the service worker taking control, an offline reload,
// Chrome's own installability verdict, and the onboarding notifications step.

import type { Page } from '@playwright/test';
import { test, expect, openApp, shot } from './fixtures';

const BASE = '/tasks-management-app/';

/** Waits for the SW to be active, then reloads so it controls the page (registerType 'prompt'). */
async function reloadUnderServiceWorker(page: Page): Promise<void> {
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe(BASE);
  await page.reload();
  await expect(page.locator('#app')).not.toBeEmpty();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null))
    .toMatch(/\/tasks-management-app\/sw\.js$/);
}

test('manifest and every icon are served under the base path', async ({ page, request }) => {
  await openApp(page);
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe(`${BASE}manifest.webmanifest`);

  const res = await request.get('manifest.webmanifest');
  expect(res.status()).toBe(200);
  const manifest = (await res.json()) as {
    name: string;
    short_name: string;
    lang: string;
    dir: string;
    id: string;
    start_url: string;
    scope: string;
    display: string;
    background_color: string;
    theme_color: string;
    icons: { src: string; sizes: string; purpose?: string }[];
    shortcuts: { name: string; url: string }[];
  };
  expect(manifest).toMatchObject({
    name: 'HomeCare',
    short_name: 'HomeCare',
    lang: 'he',
    dir: 'rtl',
    id: BASE,
    start_url: `${BASE}#/`,
    scope: BASE,
    display: 'standalone',
    background_color: '#FBF6EF',
    theme_color: '#FBF6EF'
  });
  expect(manifest.shortcuts).toEqual([
    expect.objectContaining({ name: 'משימה חדשה', url: `${BASE}#/new` })
  ]);
  const has = (sizes: string, purpose: string) =>
    manifest.icons.some((i) => i.sizes === sizes && (i.purpose ?? 'any') === purpose);
  expect(has('192x192', 'any')).toBe(true);
  expect(has('512x512', 'any')).toBe(true);
  expect(has('512x512', 'maskable')).toBe(true);

  const linked = await page
    .locator('link[rel="icon"], link[rel="apple-touch-icon"]')
    .evaluateAll((links) => links.map((l) => (l as HTMLLinkElement).getAttribute('href') ?? ''));
  expect(linked).toEqual(
    expect.arrayContaining([
      `${BASE}favicon.ico`,
      `${BASE}favicon.svg`,
      `${BASE}icons/apple-touch-180.png`
    ])
  );

  const urls = new Set([
    ...manifest.icons.map((i) => `${BASE}${i.src}`),
    ...linked,
    `${BASE}icons/badge-96.png`
  ]);
  for (const url of urls) {
    const icon = await request.get(url.slice(BASE.length));
    expect(icon.status(), url).toBe(200);
    expect(icon.headers()['content-type'], url).toMatch(/^image\//);
  }
});

test('the service worker controls the app and an offline reload still renders Home', async ({
  page,
  context
}) => {
  await openApp(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('מיכל');
  await reloadUnderServiceWorker(page);

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('מיכל');
    await expect(page.getByText('ארוחה במסעדה · 7 מתוך 10')).toBeVisible(); // demo data
  } finally {
    await context.setOffline(false);
  }
});

test('Chrome finds the app installable', async ({ page }) => {
  await openApp(page);
  await reloadUnderServiceWorker(page);
  const cdp = await page.context().newCDPSession(page);
  await expect
    .poll(async () => {
      const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
      return installabilityErrors.map((e) => e.errorId);
    })
    .toEqual([]);
});

test('"אחר כך" on the notifications step continues to Home', async ({ page }) => {
  await openApp(page, '#/onboarding/notifications');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('שנעדכן אתכם?');
  await expect(page.getByText('במצב הדגמה לא נשלחות התראות')).toBeVisible();
  await shot(page, 'onboarding-notifications');
  await page.getByRole('button', { name: 'אחר כך' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('מיכל');
});

test('Settings shows the demo notification state and saves the type switches', async ({ page }) => {
  await openApp(page, '#/settings');
  const block = page.locator('[data-notifications="demo"]');
  await expect(block).toContainText('במצב הדגמה לא נשלחות התראות');
  await shot(page, 'settings-notifications');
  const weekly = block.getByRole('switch', { name: 'סיכום שבועי' });
  const before = await weekly.isChecked();
  await block.getByText('סיכום שבועי', { exact: true }).click(); // the whole row is the target
  await expect(weekly).toBeChecked({ checked: !before });
  // The demo persists with a short debounce: flush it before reloading.
  await page.evaluate(() =>
    (window as unknown as { __homecareTest: { flush(): Promise<void> } }).__homecareTest.flush()
  );
  await page.reload();
  await expect(
    page.locator('[data-notifications="demo"]').getByRole('switch', { name: 'סיכום שבועי' })
  ).toBeChecked({ checked: !before });
});
