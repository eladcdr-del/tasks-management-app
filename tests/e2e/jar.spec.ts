import type { Page } from '@playwright/test';
import { expect, openApp, shot, test } from './fixtures';

// The treat jar as a team goal. Demo seed: "ארוחה במסעדה", everyone does their part ("כל אחד
// תורם", 5 each): מיכל 4 of 5, דני 3 of 5 (one of his was for מיכל, who asked: a heart marble),
// round 3, two earned treats. Completing goes through the tasks store (the same call the complete
// sheet makes) unless the test is about the sheet itself.

interface Hooks {
  actAs(uid: string): Promise<void>;
  state: {
    tasks: {
      open: { id: string; title: string; recurrence: unknown }[];
      complete(
        id: string,
        c: { note: string; cost: number | null; place: string; contact: string }
      ): Promise<unknown>;
    };
    household: {
      setJar(j: { treat: string; target: number; mode?: 'together' }): void;
    };
    ui: { current: { message: string } | null };
  };
}
type HookWindow = Window & { __homecareTest: Hooks };

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

const overlay = (page: Page) => page.locator('[data-celebration]');
const part = (page: Page, uid: string) => page.locator(`[data-part="${uid}"]`);
const snack = (page: Page) =>
  page.evaluate(() => (window as unknown as HookWindow).__homecareTest.state.ui.current?.message);

test('everyone does their part: the jar fills, celebrates once, and starts anew on redeem', async ({
  page
}) => {
  await openApp(page, '#/jar');
  await expect(page.locator('[data-jar-mode="each"]')).toBeVisible();
  await expect(page.locator('[data-jar-goal]')).toHaveText('כל אחד מאיתנו סוגר 5 משימות');
  await expect(page.locator('[data-jar-count]')).toHaveText('7 מתוך 10');
  await expect(page.locator('[data-jar-left]')).toHaveText(
    'עוד משימה אחת שלך ו־2 משימות של דני, ואנחנו בצ׳ופר'
  );
  await expect(part(page, 'michal')).toHaveAttribute('data-complete', 'false');
  await expect(part(page, 'michal')).toContainText('4 מתוך 5');
  await expect(part(page, 'dani')).toContainText('3 מתוך 5');
  // דני closed מיכל's request: that marble carries a heart.
  await expect(page.locator('svg[data-count="7"] [data-help]')).toHaveCount(1);
  await expect(page.getByText('ארוחה במסעדה', { exact: true })).toBeVisible();
  const history = page.locator('[data-treat]');
  const before = await history.count();
  await page.waitForTimeout(300);
  await shot(page, 'jar-typical');

  // מיכל closes her part: hers is done, only דני's is left.
  await completeSome(page, 1);
  await expect(part(page, 'michal')).toHaveAttribute('data-complete', 'true');
  await expect(part(page, 'michal')).toContainText('הושלם');
  await expect(page.locator('[data-jar-left]')).toHaveText('עוד 2 משימות של דני ואנחנו בצ׳ופר');
  // More from her is a shared bonus; it does not fill דני's part.
  await completeSome(page, 1);
  await expect(page.locator('[data-jar-count]')).toHaveText('8 מתוך 10');
  await expect(page.locator('[data-jar-bonus]')).toHaveText('ועוד משימה אחת בונוס');
  await expect(overlay(page)).toHaveCount(0);

  // דני closes his part: the jar is full.
  await completeSome(page, 2, 'dani');
  await expect(overlay(page)).toBeVisible();
  await expect(overlay(page)).toContainText('עשינו את זה ביחד');
  await expect(overlay(page)).toContainText('כל אחד עשה את החלק שלו');
  await expect(overlay(page)).toContainText('ארוחה במסעדה');
  await expect(overlay(page).getByRole('list', { name: 'מיכל, דני' })).toBeVisible();
  await expect(overlay(page)).toHaveAttribute('data-motion', 'animated');
  await page.waitForTimeout(2_600);
  await shot(page, 'jar-celebration');
  await overlay(page).getByRole('button', { name: 'איזה כיף' }).click();
  await expect(overlay(page)).toHaveCount(0);
  await expect(page.locator('[data-jar="full"]')).toBeVisible();
  await expect(page.locator('svg[data-full]')).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, 'jar-full');

  // Once per round: leaving and coming back does not celebrate again.
  await page.getByRole('link', { name: 'בית' }).first().click();
  await expect(page.locator('[data-jar-mini="full"]')).toBeVisible();
  await page.locator('[data-jar-mini="full"]').click();
  await expect(page.locator('[data-jar="full"]')).toBeVisible();
  await page.waitForTimeout(300);
  await expect(overlay(page)).toHaveCount(0);

  // Redeem: the next treat sheet opens (the jar keeps its goal when it is just closed).
  await page.getByRole('button', { name: 'מימשנו! צנצנת חדשה' }).click();
  const sheet = page.locator('[data-sheet-content="jarSetup"]');
  await expect(sheet.getByRole('heading', { name: 'הצ׳ופר הבא' })).toBeVisible();
  await expect(sheet.locator('[data-mode="each"] input')).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('[data-jar-count]')).toHaveText('0 מתוך 10');
  await expect(part(page, 'michal')).toContainText('0 מתוך 5');
  await expect(history).toHaveCount(before + 1);
  await expect(history.first()).toContainText('ארוחה במסעדה');
  // The treat remembers who took part.
  await expect(history.first().getByRole('img', { name: 'השתתפו: מיכל, דני' })).toBeVisible();
});

test('reduced motion: the jar and the celebration are still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page, '#/jar');
  await expect(page.locator('svg[data-motion="static"]')).toBeVisible();
  await completeSome(page, 1);
  await completeSome(page, 2, 'dani');
  await expect(overlay(page)).toHaveAttribute('data-motion', 'static');
  await page.waitForTimeout(200); // the ≤120ms crossfade in is allowed
  const running = (selector: string) =>
    page
      .locator(selector)
      .evaluate(
        (el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length
      );
  expect(await running('[data-celebration]')).toBe(0);
  expect(await running('.jar-screen')).toBe(0);
});

test('marbles added since the last visit drop into the jar; a new one drops in live', async ({
  page
}) => {
  await openApp(page, '#/jar');
  await expect(page.locator('svg[data-count="7"]')).toBeVisible();
  await expect(page.locator('svg[data-count] .drop')).toHaveCount(0); // first visit: still
  await page.getByRole('link', { name: 'בית' }).first().click();
  await completeSome(page, 1, 'dani');
  await page.getByRole('link', { name: 'הצנצנת' }).first().click();
  await expect(page.locator('svg[data-count="8"]')).toBeVisible();
  await expect(page.locator('svg[data-count] .drop')).toHaveCount(1);
  // Live: the next completion drops in too.
  await completeSome(page, 1);
  await expect(page.locator('svg[data-count="9"] .drop')).toHaveCount(1);
});

test('closing my part says so in the snackbar, and Home shows each part', async ({ page }) => {
  await openApp(page);
  const mini = page.locator('[data-jar-mini]');
  await expect(mini).toHaveAttribute('data-jar-mode', 'each');
  await expect(mini).toContainText('ארוחה במסעדה · 7 מתוך 10');
  await expect(mini.locator('[data-mini-part]')).toHaveCount(2);
  await expect(
    mini.getByRole('img', { name: 'החלקים: מיכל 4 מתוך 5, דני 3 מתוך 5' })
  ).toBeVisible();

  const id = await page.evaluate(
    () =>
      (window as unknown as HookWindow).__homecareTest.state.tasks.open.find((t) => !t.recurrence)!
        .id
  );
  await openApp(page, `#/task/${id}`, { reset: false });
  await page.getByTestId('task-detail').getByRole('button', { name: 'בוצע', exact: true }).click();
  await page.getByTestId('complete-sheet').getByRole('button', { name: 'סיום' }).click();
  await expect.poll(() => snack(page)).toBe('בוצע · סגרת את החלק שלך בצנצנת');

  await page.evaluate(() => (location.hash = '#/'));
  await expect(mini).toContainText('8 מתוך 10');
  await expect(mini.locator('[data-mini-part="michal"]')).toHaveClass(/complete/);
});

test('no jar yet: the setup sheet starts one where everyone has a part', async ({ page }) => {
  await openApp(page, '#/jar');
  await page.evaluate(async () => {
    // A household without a jar: the demo's newcomer creates one.
    const w = window as unknown as {
      __homecareTest: {
        actAs(uid: string): Promise<void>;
        state: { session: { createHousehold(n: string, p: object): Promise<string> } };
      };
    };
    await w.__homecareTest.actAs('newcomer');
    await w.__homecareTest.state.session.createHousehold('בית חדש', {
      displayName: 'נועה',
      photoURL: null,
      color: 'teal',
      addressAs: 'f'
    });
  });
  await page.evaluate(() => (location.hash = '#/jar'));
  await expect(page.locator('[data-jar="none"]')).toBeVisible();
  await page.getByRole('button', { name: 'להגדיר צנצנת' }).click();
  const sheet = page.locator('[data-sheet-content="jarSetup"]');
  await sheet.getByRole('button', { name: 'להתחיל צנצנת' }).click();
  await expect(sheet.getByText('כדאי לכתוב מה הצ׳ופר')).toBeVisible();
  // An idea fills the treat; "כל אחד תורם" is the default.
  await sheet.getByRole('button', { name: 'ערב סרט' }).click();
  await expect(sheet.getByLabel('מה הצ׳ופר?')).toHaveValue('ערב סרט');
  await expect(sheet.locator('[data-mode="each"] input')).toBeChecked();
  await expect(sheet.locator('[data-share-total]')).toHaveText(
    'כשיצטרפו עוד בני בית, לכל אחד יהיה חלק משלו'
  );
  await sheet.getByRole('button', { name: 'הוספה' }).click(); // stepper +: 6 each
  await shot(page, 'jar-setup');
  await sheet.getByRole('button', { name: 'להתחיל צנצנת' }).click();
  await expect(page.locator('[data-jar-count]')).toHaveText('0 מתוך 6');
  await expect(page.locator('[data-jar-goal]')).toHaveText('כל אחד מאיתנו סוגר 6 משימות');
  await expect(
    page.locator('[data-jar="filling"]').getByText('ערב סרט', { exact: true })
  ).toBeVisible();
});

test('the setup sheet switches the goal: together by a total, and back to each', async ({
  page
}) => {
  await openApp(page, '#/jar');
  await page.getByRole('button', { name: 'עריכת הצנצנת' }).click();
  const sheet = page.locator('[data-sheet-content="jarSetup"]');
  await expect(sheet.locator('[data-mode="each"] input')).toBeChecked();
  await expect(sheet.locator('[data-share-total]')).toHaveText('ביחד: 10 משימות בצנצנת');
  await sheet.locator('[data-mode="together"]').click();
  await expect(sheet.locator('p', { hasText: 'כמה משימות ממלאות את הצנצנת?' })).toBeVisible();
  await sheet.getByRole('button', { name: 'הוספה' }).click(); // 11
  await sheet.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.locator('[data-jar-mode="together"]')).toBeVisible();
  await expect(page.locator('[data-jar-goal]')).toHaveText('ביחד · 11 משימות');
  await expect(page.locator('[data-jar-count]')).toHaveText('7 מתוך 11');
  await expect(page.locator('[data-jar-left]')).toHaveText('עוד 4 משימות ואנחנו בצ׳ופר');
  // Who has added marbles this round: avatars, never numbers.
  await expect(page.locator('[data-jar-helpers]')).toContainText('תרמו לצנצנת');
  await expect(page.locator('[data-part]')).toHaveCount(0);

  // Back to each mid-round: what is in the jar stays, every part continues where it was.
  await page.getByRole('button', { name: 'עריכת הצנצנת' }).click();
  await sheet.locator('[data-mode="each"]').click();
  await expect(sheet.locator('[data-switch-note]')).toBeVisible();
  await sheet.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.locator('[data-jar-mode="each"]')).toBeVisible();
  await expect(part(page, 'michal')).toContainText('4 מתוך 5');
  await expect(part(page, 'dani')).toContainText('3 מתוך 5');
});
