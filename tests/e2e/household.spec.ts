// owner: step 3.1 — the household and settings screens in the demo: edit my colour, create and
// revoke an invite link, switch the theme; plus review screenshots (light + dark).

import type { Page } from '@playwright/test';
import { expect, openApp, shot, test } from './fixtures';

interface Hooks {
  state: {
    session: {
      phase: string;
      createHousehold(
        name: string,
        profile: { displayName: string; photoURL: null; color: string; addressAs: string }
      ): Promise<string>;
    };
    household: { me: { color: string; displayName: string } | null };
  };
  actAs(uid: string): Promise<void>;
}
type HookWindow = Window & { __homecareTest: Hooks; opened?: string[] };

const ready = (page: Page) =>
  page.waitForFunction(
    () => (window as unknown as HookWindow).__homecareTest?.state.session.phase === 'ready'
  );

test('I can change my colour from my own row', async ({ page }) => {
  await openApp(page, '#/household');
  await ready(page);
  await expect(page.getByRole('button', { name: /דני/ })).toHaveCount(0); // others are not editable
  await page.getByRole('button', { name: /מיכל/ }).click();
  const editor = page.locator('[data-me-editor]');
  await expect(editor).toBeVisible();
  // דני's colour is taken.
  await expect(editor.getByRole('radio', { name: 'כחול־אפור' })).toBeDisabled();
  await editor.getByRole('radio', { name: 'שזיף' }).check({ force: true });
  await editor.getByRole('button', { name: 'שמירה' }).click();
  await expect(editor).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as HookWindow).__homecareTest.state.household.me?.color
      )
    )
    .toBe('plum');
});

/** No real share sheet or popup: record what would have been opened. */
function stubShare(page: Page) {
  return page.addInitScript(() => {
    const w = window as unknown as HookWindow;
    w.opened = [];
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    window.open = ((url?: string | URL) => {
      w.opened!.push(String(url));
      return { opener: null } as unknown as Window;
    }) as typeof window.open;
  });
}

test('an invite link is created, shared through WhatsApp, shows its validity, and can be revoked', async ({
  page
}) => {
  await stubShare(page);
  await openApp(page, '#/household');
  await ready(page);
  const card = page.locator('[data-invite-card]');
  await expect(card.locator('[data-invite-capacity]')).toHaveText('נשארו 4 מקומות פנויים');
  await card.getByRole('button', { name: 'הזמנה בוואטסאפ' }).click();

  const link = card.locator('[data-invite-link]');
  await expect(link).toHaveText(
    /^https:\/\/eladcdr-del\.github\.io\/tasks-management-app\/#\/join\/[A-Za-z0-9]{12,}$/
  );
  await expect(card.locator('[data-invite-valid]')).toHaveText(/^בתוקף עוד/);
  const opened = await page.evaluate(() => (window as unknown as HookWindow).opened ?? []);
  expect(opened).toHaveLength(1);
  const text = decodeURIComponent(new URL(opened[0]!).searchParams.get('text') ?? '');
  expect(text).toContain('הזמנתי אותך להצטרף');
  expect(text).toContain((await link.textContent()) ?? '-');

  await card.getByRole('button', { name: 'ביטול קישור' }).click();
  await expect(link).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'הזמנה בוואטסאפ' })).toBeVisible();
});

test('on a narrow phone (360px) both invite buttons keep their label on one line', async ({
  page
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await stubShare(page);
  await openApp(page, '#/household');
  await ready(page);
  const card = page.locator('[data-invite-card]');
  await card.getByRole('button', { name: 'הזמנה בוואטסאפ' }).click();
  for (const name of ['שליחה שוב', 'העתקה']) {
    const button = card.getByRole('button', { name, exact: true });
    await expect(button).toBeVisible();
    const lines = await button.evaluate((el) => {
      const tops = new Set<number>();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) tops.add(Math.round(r.top));
      }
      return tops.size;
    });
    expect(lines, name).toBe(1);
  }
});

test('leaving sits in its own card, not under the house name', async ({ page }) => {
  await openApp(page, '#/household');
  await ready(page);
  const houseSection = page.getByRole('region', { name: 'שם הבית' });
  await expect(houseSection).toBeVisible();
  await expect(houseSection.getByRole('button', { name: 'יציאה מהבית' })).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'יציאה מהבית' }).getByRole('button', { name: 'יציאה מהבית' })
  ).toBeVisible();
});

test('leaving: the usual copy with others in the house; plain words for the last member', async ({
  page
}) => {
  await openApp(page, '#/household');
  await ready(page);
  await page.getByRole('button', { name: 'יציאה מהבית' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('המשימות נשארות אצל שאר בני הבית');
  await dialog.getByRole('button', { name: 'ביטול' }).click();

  // A newcomer founds a house of one.
  await page.evaluate(async () => {
    const hooks = (window as unknown as HookWindow).__homecareTest;
    await hooks.actAs('newcomer');
    await hooks.state.session.createHousehold('הבית של נועה', {
      displayName: 'נועה',
      photoURL: null,
      color: 'plum',
      addressAs: 'f'
    });
  });
  await page.evaluate(() => (location.hash = '#/household'));
  await expect(page.getByRole('heading', { level: 1, name: 'הבית של נועה' })).toBeVisible();
  await page.getByRole('button', { name: 'יציאה מהבית' }).click();
  await expect(dialog).toContainText('את היחידה בבית');
  await expect(dialog).not.toContainText('שאר בני הבית');
  await expect(dialog.getByRole('button', { name: 'יציאה וסגירת הבית' })).toBeVisible();
});

test('theme switch applies at once and is remembered', async ({ page }) => {
  await openApp(page, '#/settings');
  await ready(page);
  await page.getByRole('radio', { name: 'כהה' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('homecare.theme'))).toBe('dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: 'כהה' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: 'מערכת' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
});

test('demo: "להציג כ…" switches to another member', async ({ page }) => {
  await openApp(page, '#/settings');
  await ready(page);
  const group = page.getByRole('radiogroup', { name: 'להציג כ…' });
  await group.getByText('דני').click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as HookWindow).__homecareTest.state.household.me?.displayName
      )
    )
    .toBe('דני');
});

test.describe('screenshots', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`household and settings (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openApp(page, '#/household');
      await ready(page);
      await expect(page.locator('[data-invite-card]')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await shot(page, `household-${scheme}`);
      await page.getByRole('button', { name: /מיכל/ }).click();
      await shot(page, `household-edit-${scheme}`);
      await page.getByRole('button', { name: 'הגדרות' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'הגדרות' })).toBeVisible();
      await shot(page, `settings-${scheme}`);
    });
  }
});
