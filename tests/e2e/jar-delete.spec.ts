import type { Page } from '@playwright/test';
import { expect, openApp, shot, test } from './fixtures';

// Deleting the jar and earned treats. Demo seed: "ארוחה במסעדה", everyone does their part (5 each:
// מיכל 4, דני 3), round 3, two earned treats ("סרט בקולנוע" = jar 2, "גלידה בנמל" = jar 1).
// Deletes wait out a 5-second undo window; the fixed clock lets a test skip it (clock.runFor).

interface Hooks {
  actAs(uid: string): Promise<void>;
  state: {
    tasks: {
      open: { id: string; recurrence: unknown }[];
      complete(
        id: string,
        c: { note: string; cost: number | null; place: string; contact: string }
      ): Promise<unknown>;
    };
    household: {
      household: { jar: { round: number } | null; nextJarRound?: number } | null;
    };
  };
}
type HookWindow = Window & { __homecareTest: Hooks };

const UNDO_MS = 5_000;

/** `uid` (default: whoever is signed in) completes `n` open, non-recurring tasks. */
async function completeSome(page: Page, n: number, uid?: string) {
  await page.evaluate(
    async ({ count, uid }) => {
      const t = (window as unknown as HookWindow).__homecareTest;
      if (uid) await t.actAs(uid);
      const s = t.state.tasks;
      const ids = s.open
        .filter((x) => !x.recurrence)
        .map((x) => x.id)
        .slice(0, count);
      for (const id of ids) await s.complete(id, { note: '', cost: null, place: '', contact: '' });
    },
    { count: n, uid }
  );
}

const stored = (page: Page) =>
  page.evaluate(() => {
    const h = (window as unknown as HookWindow).__homecareTest.state.household.household;
    return { round: h?.jar?.round ?? null, nextJarRound: h?.nextJarRound ?? null };
  });

/** Heights of a history row, frame by frame, until it leaves the page. */
const heightsUntilGone = (page: Page, id: string) =>
  page.evaluate(
    (treatId) =>
      new Promise<number[]>((resolve) => {
        const out: number[] = [];
        const step = () => {
          const el = document.querySelector(`[data-treat="${treatId}"]`);
          if (!el || out.length > 120) return resolve(out);
          out.push(Math.round(el.getBoundingClientRect().height));
          requestAnimationFrame(step);
        };
        step();
      }),
    id
  );

const sheet = (page: Page) => page.locator('[data-sheet-content="jarSetup"]');
const snackbar = (page: Page) => page.locator('[data-snackbar-host]');
const treatRows = (page: Page) => page.locator('[data-treat]');

test('delete the jar from its edit sheet: a clear confirmation, then no jar, with an undo', async ({
  page
}) => {
  await openApp(page, '#/jar');
  await expect(page.locator('[data-jar-count]')).toHaveText('7 מתוך 10');
  await page.getByRole('button', { name: 'עריכת הצנצנת' }).click();
  const remove = sheet(page).getByRole('button', { name: 'מחיקת הצנצנת' });
  await expect(remove).toBeVisible();

  // The confirmation says what goes and what stays; Escape closes only the confirmation.
  await remove.click();
  const dialog = page.getByRole('alertdialog', { name: 'למחוק את הצנצנת?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    'הצנצנת וכל מה שנאסף בה עד עכשיו יימחקו. מה שכבר הרווחנו נשאר ב״צ׳ופרים שהרווחנו״, ואפשר להתחיל צנצנת חדשה מתי שרוצים.'
  );
  await expect(dialog.getByRole('button', { name: 'ביטול' })).toBeFocused();
  await shot(page, 'jar-delete-confirm');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(sheet(page)).toBeVisible();
  await expect(remove).toBeFocused();

  // Delete: the sheet closes on the "no jar yet" invitation; the history stays.
  await remove.click();
  await dialog.getByRole('button', { name: 'מחיקה' }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.locator('[data-jar="none"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'עריכת הצנצנת' })).toHaveCount(0);
  await expect(snackbar(page)).toContainText('הצנצנת נמחקה');
  await expect(treatRows(page)).toHaveCount(2);
  // Focus is not dropped on the page: it lands on the invitation.
  await expect(page.getByRole('button', { name: 'להגדיר צנצנת' })).toBeFocused();
  await shot(page, 'jar-deleted');

  // "ביטול" brings the very same jar back; nothing was written.
  await snackbar(page).getByRole('button', { name: 'ביטול' }).click();
  await expect(page.locator('[data-jar-count]')).toHaveText('7 מתוך 10');
  await expect(page.locator('[data-part="michal"]')).toContainText('4 מתוך 5');
  await page.clock.runFor(UNDO_MS + 500);
  expect(await stored(page)).toEqual({ round: 3, nextJarRound: null });
});

test('Home shows no jar strip once the jar is deleted', async ({ page }) => {
  await openApp(page);
  const mini = page.locator('[data-jar-mini]');
  await expect(mini).toBeVisible();

  // Deleted while Home shows: the strip folds away; the undo folds it back in.
  const full = Math.round((await mini.boundingBox())!.height);
  await page.evaluate(() =>
    (
      window as unknown as { __homecareTest: { state: { household: { deleteJar(): void } } } }
    ).__homecareTest.state.household.deleteJar()
  );
  const heights = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const out: number[] = [];
        const step = () => {
          const el = document.querySelector('[data-jar-mini]');
          if (!el || out.length > 120) return resolve(out);
          out.push(Math.round(el.getBoundingClientRect().height));
          requestAnimationFrame(step);
        };
        step();
      })
  );
  expect(heights.some((h) => h > 1 && h < full - 1)).toBe(true);
  await expect(mini).toHaveCount(0);
  await snackbar(page).getByRole('button', { name: 'ביטול' }).click();
  await expect(mini).toContainText('ארוחה במסעדה · 7 מתוך 10');

  await page.getByRole('link', { name: 'הצנצנת' }).first().click();
  await page.getByRole('button', { name: 'עריכת הצנצנת' }).click();
  await sheet(page).getByRole('button', { name: 'מחיקת הצנצנת' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'מחיקה' }).click();
  await expect(page.locator('[data-jar="none"]')).toBeVisible();
  await page.getByRole('link', { name: 'בית' }).first().click();
  await expect(page.getByRole('heading', { name: /בוקר טוב/ })).toBeVisible();
  await expect(page.locator('[data-jar-mini]')).toHaveCount(0);
  // Once the undo window is over the delete is stored, and survives a reload.
  await page.clock.runFor(UNDO_MS + 500);
  expect(await stored(page)).toEqual({ round: null, nextJarRound: 4 });
  await page.waitForTimeout(400); // the demo saves (debounced) before the reload
  await openApp(page, '#/', { reset: false });
  await expect(page.getByRole('heading', { name: /בוקר טוב/ })).toBeVisible();
  await expect(page.locator('[data-jar-mini]')).toHaveCount(0);
});

test('a new jar after a delete starts from zero, after the deleted one, and earns into the history', async ({
  page
}) => {
  await openApp(page, '#/jar');
  await page.getByRole('button', { name: 'עריכת הצנצנת' }).click();
  await sheet(page).getByRole('button', { name: 'מחיקת הצנצנת' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'מחיקה' }).click();
  await page.clock.runFor(UNDO_MS + 500);
  await expect(snackbar(page)).not.toContainText('הצנצנת נמחקה');

  // Starting one: no delete in this sheet (there is nothing to delete yet).
  await page.getByRole('button', { name: 'להגדיר צנצנת' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'הצ׳ופר הבא' })).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'מחיקת הצנצנת' })).toHaveCount(0);
  await sheet(page).getByRole('button', { name: 'ערב סרט' }).click();
  for (let i = 0; i < 4; i++) await sheet(page).getByRole('button', { name: 'הפחתה' }).click();
  await sheet(page).getByRole('button', { name: 'להתחיל צנצנת' }).click();
  await expect(page.locator('[data-jar-count]')).toHaveText('0 מתוך 2');
  expect(await stored(page)).toEqual({ round: 4, nextJarRound: 4 });

  // Everyone closes one: full, celebrated, redeemed into the history as jar 4.
  await completeSome(page, 1);
  await completeSome(page, 1, 'dani');
  const overlay = page.locator('[data-celebration]');
  await expect(overlay).toBeVisible();
  await overlay.getByRole('button', { name: 'איזה כיף' }).click();
  await page.getByRole('button', { name: 'מימשנו! צנצנת חדשה' }).click();
  await page.keyboard.press('Escape');
  await expect(treatRows(page)).toHaveCount(3);
  await expect(treatRows(page).first()).toHaveAttribute('data-treat', '4');
  await expect(treatRows(page).first()).toContainText('ערב סרט');
  await expect(treatRows(page).first()).toContainText('צנצנת 4');
  await expect(treatRows(page).nth(1)).toContainText('סרט בקולנוע');
});

test('a full jar: the confirmation says its unredeemed treat goes too; the next-treat sheet offers no delete', async ({
  page
}) => {
  await openApp(page, '#/jar');
  await completeSome(page, 1);
  await completeSome(page, 2, 'dani');
  const overlay = page.locator('[data-celebration]');
  await expect(overlay).toBeVisible();
  await overlay.getByRole('button', { name: 'איזה כיף' }).click();
  await page.getByRole('button', { name: 'עריכת הצנצנת' }).click();
  await sheet(page).getByRole('button', { name: 'מחיקת הצנצנת' }).click();
  await expect(page.getByRole('alertdialog')).toContainText(
    'הצנצנת וכל מה שנאסף בה יימחקו, גם הצ׳ופר שעוד לא מימשנו.'
  );
  await page.getByRole('alertdialog').getByRole('button', { name: 'ביטול' }).click();
  await expect(page.getByRole('alertdialog')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'מימשנו! צנצנת חדשה' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'הצ׳ופר הבא' })).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: 'מחיקת הצנצנת' })).toHaveCount(0);
});

test('delete an earned treat: ⋮, the menu, a confirmation naming it; it folds away, with an undo', async ({
  page
}) => {
  await openApp(page, '#/jar');
  await expect(treatRows(page)).toHaveCount(2);
  const more = page.getByRole('button', { name: 'אפשרויות ל״גלידה בנמל״' });
  await more.scrollIntoViewIfNeeded();

  // The menu: opens under the ⋮ with focus on its item; Escape closes it back to the ⋮.
  await more.click();
  const menu = page.getByRole('menu', { name: 'אפשרויות ל״גלידה בנמל״' });
  await expect(menu).toBeVisible();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  const item = menu.getByRole('menuitem', { name: 'מחיקה מההיסטוריה' });
  await expect(item).toBeFocused();
  // Right next to the ⋮ (under it, or above it near the bottom), growing inwards from its edge.
  const [moreBox, menuBox] = [(await more.boundingBox())!, (await menu.boundingBox())!];
  const below = (await menu.getAttribute('data-side')) === 'below';
  if (below) expect(menuBox.y).toBeGreaterThanOrEqual(moreBox.y + moreBox.height - 1);
  else expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(moreBox.y + 1);
  expect(Math.abs(menuBox.x - moreBox.x)).toBeLessThan(2);
  await shot(page, 'jar-treat-menu');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(more).toBeFocused();
  await expect(more).toHaveAttribute('aria-expanded', 'false');

  // It stays with the ⋮ when the page scrolls; a tap outside closes it.
  await more.click();
  await expect(menu).toBeVisible();
  await page.evaluate(() => window.scrollBy(0, -40));
  await expect
    .poll(async () => {
      const [a, b] = [(await more.boundingBox())!, (await menu.boundingBox())!];
      const gap =
        (await menu.getAttribute('data-side')) === 'below'
          ? b.y - (a.y + a.height)
          : a.y - (b.y + b.height);
      return Math.abs(Math.round(gap - 4)); // 4px from the ⋮, wherever it moved
    })
    .toBeLessThanOrEqual(1);
  await page.locator('[data-jar-goal]').click();
  await expect(menu).toBeHidden();

  // Delete, then undo.
  await more.click();
  await item.click();
  const dialog = page.getByRole('alertdialog', { name: 'למחוק את ״גלידה בנמל״ מההיסטוריה?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('הצנצנת הנוכחית לא משתנה.');
  await shot(page, 'jar-treat-confirm');
  await dialog.getByRole('button', { name: 'מחיקה' }).click();
  await expect(treatRows(page)).toHaveCount(1);
  await expect(page.locator('[data-treat="1"]')).toHaveCount(0);
  await expect(snackbar(page)).toContainText('הצ׳ופר נמחק מההיסטוריה');
  // Focus moves to the remaining row's ⋮, never onto the page.
  await expect(page.getByRole('button', { name: 'אפשרויות ל״סרט בקולנוע״' })).toBeFocused();
  await snackbar(page).getByRole('button', { name: 'ביטול' }).click();
  await expect(treatRows(page)).toHaveCount(2);
  await expect(page.locator('[data-jar-count]')).toHaveText('7 מתוך 10'); // the jar is untouched

  // Delete for good: gone after the undo window, also after a reload.
  await more.click();
  await expect(menu).toBeVisible();
  await page.getByRole('menuitem', { name: 'מחיקה מההיסטוריה' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'מחיקה' }).click();
  await page.clock.runFor(UNDO_MS + 500);
  await page.waitForTimeout(400); // the demo saves (debounced) before the reload
  await openApp(page, '#/jar', { reset: false });
  await expect(treatRows(page)).toHaveCount(1);
  await expect(treatRows(page)).toHaveAttribute('data-treat', '2');
});

test('the last treat folds the whole history away; the row animates out', async ({ page }) => {
  await openApp(page, '#/jar');
  // "סרט בקולנוע" goes first: watch it fold (height shrinking, fading) rather than vanish.
  await page.getByRole('button', { name: 'אפשרויות ל״סרט בקולנוע״' }).click();
  await page.getByRole('menuitem', { name: 'מחיקה מההיסטוריה' }).click();
  const before = Math.round((await page.locator('[data-treat="2"]').boundingBox())!.height);
  await page.getByRole('alertdialog').getByRole('button', { name: 'מחיקה' }).click();
  const heights = await heightsUntilGone(page, '2');
  expect(heights.some((h) => h > 1 && h < before - 1)).toBe(true); // it folds, frame by frame
  await expect(page.locator('[data-treat="2"]')).toHaveCount(0);

  await page.getByRole('button', { name: 'אפשרויות ל״גלידה בנמל״' }).click();
  await page.getByRole('menuitem', { name: 'מחיקה מההיסטוריה' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'מחיקה' }).click();
  await expect(page.getByRole('heading', { name: /צ׳ופרים שהרווחנו/ })).toHaveCount(0);
  await expect(treatRows(page)).toHaveCount(0);
  // Nothing left to move to in the list: focus lands on the screen's title, not on the page.
  await expect(page.getByRole('heading', { level: 1, name: 'הצנצנת' })).toBeFocused();
});

test('reduced motion: the menu opens and a row leaves without moving', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page, '#/jar');
  const more = page.getByRole('button', { name: 'אפשרויות ל״גלידה בנמל״' });
  await more.click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  expect(await menu.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  await page.getByRole('menuitem', { name: 'מחיקה מההיסטוריה' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'מחיקה' }).click();
  // Only a short crossfade: the row keeps its height while it fades, then it is gone.
  const heights = await heightsUntilGone(page, '1');
  expect(new Set(heights).size).toBeLessThanOrEqual(1);
  await expect(page.locator('[data-treat="1"]')).toHaveCount(0);
});
