// owner: step 3.1 — the app shell in the demo: tabs, Back, the FAB → QuickAdd sheet, snackbars,
// plus review screenshots of the setup and welcome screens.

import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { withoutFirebaseConfig } from './config';
import { expect, openApp, shot, test } from './fixtures';

interface Hooks {
  state: {
    session: { phase: string; signOut(): Promise<void> };
    ui: { show(message: string, opts?: { action?: string; onAction?: () => void }): number };
  };
}
type HookWindow = Window & { __homecareTest: Hooks };

const nav = (page: Page) => page.getByRole('navigation', { name: 'ניווט ראשי' });
const tab = (page: Page, name: string) => nav(page).getByRole('link', { name, exact: true });
/** The nav element itself (a modal sheet makes it inert, i.e. out of the accessibility tree). */
const navEl = (page: Page) => page.locator('nav[aria-label="ניווט ראשי"]');
const ready = (page: Page) =>
  page.waitForFunction(
    () => (window as unknown as HookWindow).__homecareTest?.state.session.phase === 'ready'
  );

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('tabs navigate, mark the active tab, and Back from any tab lands on Home', async ({
  page
}) => {
  const errors = trackErrors(page);
  await openApp(page);
  await expect(tab(page, 'בית')).toHaveAttribute('aria-current', 'page');

  await tab(page, 'זיכרון הבית').click();
  await expect(page).toHaveURL(/#\/memory$/);
  await expect(tab(page, 'זיכרון הבית')).toHaveAttribute('aria-current', 'page');
  await expect(tab(page, 'בית')).not.toHaveAttribute('aria-current', 'page');

  await tab(page, 'הצנצנת').click();
  await expect(page).toHaveURL(/#\/jar$/);
  await tab(page, 'הבית שלנו').click();
  await expect(page).toHaveURL(/#\/household$/);
  await expect(page.getByRole('heading', { level: 1, name: 'הבית שלנו' })).toBeVisible();

  // tab → tab replaces: one Back goes Home.
  await page.goBack();
  await expect(page).toHaveURL(/#\/$/);
  await expect(tab(page, 'בית')).toHaveAttribute('aria-current', 'page');
  expect(errors).toEqual([]);
});

test('settings opens from the household gear; its back button and the browser Back return', async ({
  page
}) => {
  await openApp(page, '#/household');
  await page.getByRole('button', { name: 'הגדרות' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(nav(page)).toHaveCount(0); // settings has no tab
  await page.getByRole('button', { name: 'חזרה' }).click();
  await expect(page).toHaveURL(/#\/household$/);

  await page.getByRole('button', { name: 'הגדרות' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/household$/);

  // A cold start on #/settings: the back button falls back to the household tab.
  await openApp(page, '#/settings', { reset: false });
  await page.getByRole('button', { name: 'חזרה' }).click();
  await expect(page).toHaveURL(/#\/household$/);
});

test('the FAB opens QuickAdd; the nav steps aside; Back closes the sheet', async ({ page }) => {
  await openApp(page);
  const fab = page.getByRole('button', { name: 'משימה חדשה' });
  await expect(fab).toBeVisible();
  await fab.click();
  const sheet = page.getByRole('dialog', { name: 'משימה חדשה' });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-sheet="quickAdd"]')).toBeVisible();
  await expect(navEl(page)).toHaveClass(/hidden/);

  await page.goBack();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/#\/$/);
  await expect(navEl(page)).not.toHaveClass(/hidden/);

  // The FAB lives on Home and Memory only.
  await tab(page, 'הצנצנת').click();
  await expect(page.getByRole('button', { name: 'משימה חדשה' })).toHaveCount(0);
  await tab(page, 'זיכרון הבית').click();
  await expect(page.getByRole('button', { name: 'משימה חדשה' })).toBeVisible();
});

test('snackbars show in the live region, run their action and go away', async ({ page }) => {
  await openApp(page);
  await ready(page);
  await page.evaluate(() => {
    const w = window as unknown as HookWindow & { undone?: boolean };
    w.__homecareTest.state.ui.show('בוצע', { action: 'ביטול', onAction: () => (w.undone = true) });
  });
  const region = page.locator('[data-snackbar-host]');
  await expect(region).toHaveAttribute('aria-live', 'polite');
  await expect(region).toContainText('בוצע');
  await region.getByRole('button', { name: 'ביטול' }).click();
  await expect(region).not.toContainText('בוצע');
  expect(await page.evaluate(() => (window as unknown as { undone?: boolean }).undone)).toBe(true);
});

test.describe('screenshots', () => {
  // The setup screen needs an empty firebase-config.ts: blank it in the served bundle (config.ts).
  test.use({ serviceWorkers: 'block' });

  for (const scheme of ['light', 'dark'] as const) {
    test(`setup and welcome (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await withoutFirebaseConfig(page);
      await page.goto('./#/');
      await expect(
        page
          .getByRole('button', { name: 'נסו את הדמו' })
          .or(page.getByRole('link', { name: 'נסו את הדמו' }))
      ).toBeVisible();
      await expect(page.getByRole('link', { name: /למדריך החיבור/ })).toHaveAttribute(
        'href',
        'https://github.com/eladcdr-del/tasks-management-app/blob/HEAD/SETUP.md'
      );
      await shot(page, `setup-${scheme}`);

      await openApp(page);
      await ready(page);
      await page.evaluate(() =>
        (window as unknown as HookWindow).__homecareTest.state.session.signOut()
      );
      await expect(page).toHaveURL(/#\/welcome$/);
      await expect(page.getByRole('button', { name: 'כניסה עם Google' })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      // Mom's first screen: every line readable (contrast) and no developer words.
      const axe = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
      expect(axe.violations.flatMap((v) => v.nodes.map((n) => n.target.join(' ')))).toEqual([]);
      await expect(page.locator('main')).not.toContainText('Firebase');
      await shot(page, `welcome-${scheme}`);
    });
  }
});
