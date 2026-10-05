import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, openApp, shot, test } from './fixtures';

// Choosing several tasks on Home at once (feature "seat", B1). "בחירה" in the bar, or a long press
// on a row, starts it: rows show square checkboxes instead of the completion circle and a tap
// toggles a row; the bar reads "ביטול · נבחרו 3 · בחירת הכל" (the visible list); a bar at the
// bottom takes the nav's place with "מחיקה (3)" (one snackbar, one undo) and "אני לוקחת (2)" (the
// free ones). "ביטול", Escape (Android's Back) or an action ends it. Demo seed, Sunday 2026-10-04
// 09:00, signed in as מיכל: "היום" lists four (the light bulbs are free, the dentist is hers, the
// air conditioner דני's); "הכל" lists twelve, three of them free.

interface TaskLite {
  id: string;
  ownerId: string | null;
}
interface Hooks {
  state: {
    tasks: {
      byId(id: string): TaskLite | null;
      open: TaskLite[];
      create(draft: { title: string; categoryId: string }): string | null;
    };
    ui: { current: { message: string } | null; show(message: string): number };
  };
}
type HookWindow = Window & { __homecareTest: Hooks };

const section = (page: Page, name: string) => page.locator(`[data-section="${name}"]`);
const card = (scope: Page | Locator, id: string) => scope.locator(`[data-task-id="${id}"]`).first();
const tab = (page: Page, name: RegExp) => page.getByRole('radio', { name });
const chips = (page: Page) => page.getByRole('group', { name: 'של מי' });
const count = (page: Page) => page.locator('[data-select-count]');
const bar = (page: Page) => page.getByRole('group', { name: 'מה לעשות עם המשימות שנבחרו' });
const pickOf = (row: Locator) => row.locator('[data-pick]');
const taskById = (page: Page, id: string) =>
  page.evaluate((id) => {
    const t = (window as unknown as HookWindow).__homecareTest.state.tasks.byId(id);
    return t ? (JSON.parse(JSON.stringify(t)) as TaskLite) : null;
  }, id);
const snackNow = (page: Page) =>
  page.evaluate(
    () => (window as unknown as HookWindow).__homecareTest.state.ui.current?.message ?? ''
  );

/** Holds a press on `target` for `ms` (a long press with the primary button). */
async function longPress(page: Page, target: Locator, ms = 650) {
  await target.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

async function expectChoosing(page: Page, on: boolean) {
  if (on) {
    await expect(page.locator('[data-selecting]')).toBeAttached();
    await expect(bar(page)).toBeVisible();
    // The bar takes the nav's place; the FAB steps aside.
    await expect(page.locator('nav')).toHaveAttribute('inert', '');
    await expect(page.locator('[data-fab-host]')).toHaveAttribute('inert', '');
  } else {
    await expect(page.locator('[data-selecting]')).toHaveCount(0);
    await expect(bar(page)).toHaveCount(0);
    await expect(page.locator('nav')).not.toHaveAttribute('inert', '');
    await expect(page.locator('[data-pick]')).toHaveCount(0);
  }
}

test('"בחירה", two taps, "מחיקה (2)": gone at once, one snackbar brings both back', async ({
  page
}) => {
  await openApp(page);
  const plan = section(page, 'plan');
  await page.getByRole('button', { name: 'בחירה', exact: true }).click();
  await expectChoosing(page, true);
  await expect(count(page)).toHaveText('בחירת משימות');
  // Square checkboxes instead of the completion circles; nothing chosen yet.
  await expect(plan.getByRole('checkbox', { name: /סימון כבוצעה/ })).toHaveCount(0);
  await expect(plan.getByRole('checkbox', { name: 'לקנות נורות לסלון' })).toHaveAttribute(
    'aria-checked',
    'false'
  );
  await expect(bar(page).getByRole('button', { name: 'מחיקה' })).toBeDisabled();

  // A tap anywhere on a row chooses it (the title does not open the task now).
  await card(plan, 'seed-bulbs').locator('article').click();
  await card(plan, 'seed-dentist')
    .locator('article')
    .click({ position: { x: 200, y: 20 } });
  await expect(page).toHaveURL(/#\/$/);
  await expect(count(page)).toHaveText('נבחרו 2');
  await expect(card(plan, 'seed-bulbs')).toHaveAttribute('data-selected', 'true');
  // Of the two, only the parcel of light bulbs is free: "אני לוקחת (1)".
  await expect(bar(page).getByRole('button', { name: 'אני לוקחת (1)' })).toBeEnabled();
  await page.waitForTimeout(250);
  await shot(page, 'home-select-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(250);
  await shot(page, 'home-select-dark');
  await page.emulateMedia({ colorScheme: 'light' });

  await bar(page).getByRole('button', { name: 'מחיקה (2)' }).click();
  await expectChoosing(page, false);
  for (const id of ['seed-bulbs', 'seed-dentist']) {
    await expect(plan.locator(`[data-task-id="${id}"]`)).toHaveCount(0);
  }
  await expect(page.locator('[data-pulse="today"]')).toHaveText('2');
  const snack = page.locator('[data-snackbar-host] .snackbar');
  await expect(snack).toContainText('נמחקו 2 משימות');
  await snack.getByRole('button', { name: 'ביטול' }).click();
  await expect(card(plan, 'seed-bulbs')).toBeVisible();
  await expect(card(plan, 'seed-dentist')).toBeVisible();
  await expect(page.locator('[data-pulse="today"]')).toHaveText('4');
});

test('without undo, the chosen tasks are deleted for good after 5 seconds', async ({ page }) => {
  await openApp(page);
  const plan = section(page, 'plan');
  await page.getByRole('button', { name: 'בחירה', exact: true }).click();
  await pickOf(card(plan, 'seed-bulbs')).click();
  await pickOf(card(plan, 'seed-ac')).click();
  await bar(page).getByRole('button', { name: 'מחיקה (2)' }).click();
  await expect.poll(() => snackNow(page)).toBe('נמחקו 2 משימות');
  await page.clock.runFor(5_200);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as HookWindow).__homecareTest.state.tasks.open.map((t) => t.id)
      )
    )
    .not.toContain('seed-ac');
  // Gone from the data too: the task screen says so.
  await page.evaluate(() => (location.hash = '#/task/seed-bulbs'));
  await expect(page.getByText('המשימה לא נמצאה')).toBeVisible();
});

test('a long press starts with that task; "בחירת הכל" takes the whole list, folded or not', async ({
  page
}) => {
  await openApp(page);
  // Four more home repairs: "הכל" lists sixteen, in category groups of three with "עוד N".
  await page.evaluate(() => {
    const tasks = (window as unknown as HookWindow).__homecareTest.state.tasks;
    for (const title of ['לתקן את הברז', 'לתקן את התריס', 'לצבוע את הדלת', 'להחליף נורה'])
      tasks.create({ title, categoryId: 'home' });
  });
  await tab(page, /הכל/).click();
  const plan = section(page, 'plan');
  await expect(plan.locator('[data-group="home"] [data-more]')).toBeVisible();
  const row = card(plan, 'seed-washer');
  await longPress(page, row.locator('a.title'));
  await expectChoosing(page, true);
  // The press chose the row; its click did not open the task or undo the choice.
  await expect(page).toHaveURL(/#\/$/);
  await expect(count(page)).toHaveText('נבחרה משימה אחת');
  await expect(pickOf(row)).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('button', { name: 'בחירת הכל' }).click();
  await expect(count(page)).toHaveText('נבחרו 16');
  // Every chosen row is in sight: the folded groups opened.
  await expect(plan.locator('[data-task-id]')).toHaveCount(16);
  await expect(plan.locator('[data-group="home"] [data-more]')).toHaveText('פחות');
  await expect(plan.locator('[data-pick][aria-checked="false"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'ניקוי הבחירה' }).click();
  await expect(count(page)).toHaveText('בחירת משימות');
  await expect(plan.locator('[data-pick][aria-checked="true"]')).toHaveCount(0);

  // Escape (and Android's Back, the same close request) leaves the mode.
  await page.keyboard.press('Escape');
  await expectChoosing(page, false);
  await expect(page).toHaveURL(/#\/$/);
});

test('"אני לוקחת (2)": the free ones become mine, the others stay as they were', async ({
  page
}) => {
  await openApp(page);
  await tab(page, /הכל/).click();
  const plan = section(page, 'plan');
  await page.getByRole('button', { name: 'בחירה', exact: true }).click();
  await page.getByRole('button', { name: 'בחירת הכל' }).click();
  await page.getByRole('button', { name: 'ניקוי הבחירה' }).click();
  for (const id of ['seed-bulbs', 'seed-washer', 'seed-netflix', 'seed-dentist']) {
    await pickOf(card(plan, id)).click();
  }
  await expect(count(page)).toHaveText('נבחרו 4');
  await bar(page).getByRole('button', { name: 'אני לוקחת (2)' }).click();
  await expectChoosing(page, false);
  await expect.poll(() => snackNow(page)).toBe('2 משימות אצלך');
  expect((await taskById(page, 'seed-bulbs'))?.ownerId).toBe('michal');
  expect((await taskById(page, 'seed-washer'))?.ownerId).toBe('michal');
  expect((await taskById(page, 'seed-netflix'))?.ownerId).toBe('dani');
  await expect(page.locator('[data-pulse="waiting"]')).toHaveText('1');
});

test('choosing follows the list; while it is on, rows neither open nor swipe', async ({ page }) => {
  await openApp(page);
  const plan = section(page, 'plan');
  await page.getByRole('button', { name: 'בחירה', exact: true }).click();
  await pickOf(card(plan, 'seed-bulbs')).click();
  await pickOf(card(plan, 'seed-dentist')).click();
  await expect(count(page)).toHaveText('נבחרו 2');
  // "שלי" hides the free bulbs: they are let go; the dentist (hers) stays chosen.
  await chips(page).getByRole('button', { name: 'שלי', exact: true }).click();
  await expect(count(page)).toHaveText('נבחרה משימה אחת');
  await expect(pickOf(card(plan, 'seed-dentist'))).toHaveAttribute('aria-checked', 'true');
  await chips(page).getByRole('button', { name: 'הכל', exact: true }).click();
  await expect(pickOf(card(plan, 'seed-bulbs'))).toHaveAttribute('aria-checked', 'false');

  // A drag sideways does not open the snooze or complete sheet.
  const target = card(plan, 'seed-ac').locator('article');
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(box.x + box.width / 2 + i * 20, box.y + box.height / 2);
  }
  await page.mouse.up();
  await expect(page.locator('[data-sheet]')).toHaveCount(0);
  // The request to me can be chosen too; its answers step aside meanwhile.
  const asked = card(section(page, 'requested'), 'seed-post');
  await expect(asked.getByRole('button', { name: 'לא מתאים לי' })).toHaveCount(0);
  await pickOf(asked).click();
  await expect(pickOf(asked)).toHaveAttribute('aria-checked', 'true');

  await page.locator('[data-select-head]').getByRole('button', { name: 'ביטול' }).click();
  await expectChoosing(page, false);
  await expect(asked.getByRole('button', { name: 'לא מתאים לי' })).toBeVisible();
});

test('the bottom bar: big targets, above the safe area, and snackbars sit above it; axe-clean', async ({
  page
}) => {
  await openApp(page);
  const plan = section(page, 'plan');
  await page.getByRole('button', { name: 'בחירה', exact: true }).click();
  await pickOf(card(plan, 'seed-bulbs')).click();
  // Let the bar finish sliding up before measuring it.
  await bar(page).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  for (const name of [/^מחיקה/, /^אני לוקחת/]) {
    const b = (await bar(page).getByRole('button', { name }).boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
  }
  const barBox = (await bar(page).boundingBox())!;
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(844 + 1);
  // A message while choosing sits above the bar, not over it.
  await page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest.state.ui.show('בדיקה')
  );
  const snack = page.locator('[data-snackbar-host] .snackbar');
  await expect(snack).toContainText('בדיקה');
  await expect
    .poll(async () => {
      const s = await snack.boundingBox();
      return s ? barBox.y - (s.y + s.height) : -1;
    })
    .toBeGreaterThanOrEqual(0);

  const axe = await new AxeBuilder({ page })
    .include('.home')
    .include('[data-select-bar]')
    .analyze();
  const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
});

test('leaving Home ends choosing', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'בחירה', exact: true }).click();
  await expectChoosing(page, true);
  await page.evaluate(() => (location.hash = '#/memory'));
  await expect(page.locator('nav')).not.toHaveAttribute('inert', '');
  await page.goBack();
  await expectChoosing(page, false);
});
