import type { Page } from '@playwright/test';
import { expect, openApp, shot, test } from './fixtures';

// The treat jar (step 4.2). Demo seed: "ארוחה במסעדה" at 7/10 (round 3), two earned treats.
// Completing goes through the tasks store (the same call the complete sheet makes).

interface Hooks {
  state: {
    tasks: {
      open: { id: string; recurrence: unknown }[];
      complete(
        id: string,
        c: { note: string; cost: number | null; place: string; contact: string }
      ): Promise<unknown>;
    };
  };
}
type HookWindow = Window & { __homecareTest: Hooks };

async function completeSome(page: Page, n: number) {
  await page.evaluate(async (count) => {
    const s = (window as unknown as HookWindow).__homecareTest.state.tasks;
    const ids = s.open
      .filter((t) => !t.recurrence)
      .map((t) => t.id)
      .slice(0, count);
    for (const id of ids) await s.complete(id, { note: '', cost: null, place: '', contact: '' });
  }, n);
}

const overlay = (page: Page) => page.locator('[data-celebration]');

test('the jar fills as tasks close, celebrates once, and starts anew on redeem', async ({
  page
}) => {
  await openApp(page, '#/jar');
  await expect(page.locator('[data-jar-count]')).toHaveText('7 מתוך 10');
  await expect(page.locator('[data-jar-left]')).toHaveText('עוד 3 משימות');
  await expect(page.getByText('ארוחה במסעדה', { exact: true })).toBeVisible();
  const history = page.locator('[data-treat]');
  const before = await history.count();
  await page.waitForTimeout(300);
  await shot(page, 'jar-typical');

  await completeSome(page, 2);
  await expect(page.locator('[data-jar-left]')).toHaveText('עוד משימה אחת');
  await expect(page.locator('svg[data-count="9"]')).toBeVisible();
  await expect(overlay(page)).toHaveCount(0);

  await completeSome(page, 1);
  await expect(overlay(page)).toBeVisible();
  await expect(overlay(page)).toContainText('ארוחה במסעדה');
  await expect(overlay(page)).toHaveAttribute('data-motion', 'animated');
  await overlay(page).getByRole('button', { name: 'איזה כיף' }).click();
  await expect(overlay(page)).toHaveCount(0);
  await expect(page.locator('[data-jar="full"]')).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, 'jar-full');

  // Once per round: leaving and coming back does not celebrate again.
  await page.getByRole('link', { name: 'בית' }).first().click();
  await expect(page.locator('[data-jar-mini="full"]')).toBeVisible();
  await page.locator('[data-jar-mini="full"]').click();
  await expect(page.locator('[data-jar="full"]')).toBeVisible();
  await page.waitForTimeout(300);
  await expect(overlay(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'מימשנו! צנצנת חדשה' }).click();
  await expect(page.locator('[data-jar-count]')).toHaveText('0 מתוך 10');
  await expect(history).toHaveCount(before + 1);
  await expect(history.first()).toContainText('ארוחה במסעדה');
});

test('reduced motion: the celebration is static', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page, '#/jar');
  await expect(page.locator('svg[data-motion="static"]')).toBeVisible();
  await completeSome(page, 3);
  await expect(overlay(page)).toHaveAttribute('data-motion', 'static');
  await page.waitForTimeout(200); // the ≤120ms crossfade in is allowed
  const animations = await overlay(page).evaluate(
    (el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length
  );
  expect(animations).toBe(0);
});

test('no jar yet: an invitation, and the setup sheet starts one', async ({ page }) => {
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
  await sheet.getByLabel('מה הצ׳ופר?').fill('סרט בקולנוע');
  await sheet.getByRole('button', { name: 'הוספה' }).click(); // stepper +
  await sheet.getByRole('button', { name: 'להתחיל צנצנת' }).click();
  await expect(page.locator('[data-jar-count]')).toHaveText('0 מתוך 11');
  await expect(page.getByText('סרט בקולנוע', { exact: true })).toBeVisible();
});
