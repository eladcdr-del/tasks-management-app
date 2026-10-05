import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, openApp, shot, test } from './fixtures';

// Home with many tasks (feature "home"): the demo seed (Sunday 2026-10-04 09:00, signed in as
// מיכל) plus the 21 household chores a son added at once, categorised the way quick add's list
// mode parses them (8 of them without a category). Tab "הכל" then lists 33 tasks: past six, the
// list folds into category groups of three with "עוד N"; the bar with the tabs and chips sticks
// under the top while it scrolls.

interface Hooks {
  state: {
    tasks: {
      open: { id: string; title: string }[];
      create(draft: { title: string; categoryId: string | null }): string | null;
      update(id: string, patch: Record<string, unknown>): void;
    };
  };
}
type HookWindow = Window & { __homecareTest: Hooks };

const CHORES: [string, string | null][] = [
  ['לתקן את הברז במטבח', 'home'],
  ['להחליף נורה במסדרון', 'home'],
  ['לסדר את המחסן', null],
  ['לקנות מתנה לסבתא', 'shopping'],
  ['לשלם חשבון חשמל', 'finance'],
  ['לחדש ביטוח רכב', 'car'],
  ['לקבוע תור לרופא שיניים', 'health'],
  ['לנקות את המזגן', 'home'],
  ['להחזיר ספרים לספרייה', null],
  ['לתקן את הדלת של הארון', 'home'],
  ['לקנות נעליים לדני', 'shopping'],
  ['לבדוק את הדוד', null],
  ['לצבוע את המרפסת', null],
  ['להזמין טכנאי למכונת כביסה', 'home'],
  ['לסדר את הארון בחדר שינה', null],
  ['לקנות מצעים חדשים', 'shopping'],
  ['לבטל את המנוי לעיתון', null],
  ['לטפל בדוח חניה', null],
  ['לשתול עציצים במרפסת', null],
  ['לתקן את התריס', 'home'],
  ['לקנות מתנה ליום הולדת של נועה', 'shopping']
];

const section = (page: Page, name: string) => page.locator(`[data-section="${name}"]`);
const tab = (page: Page, name: RegExp) => page.getByRole('radio', { name });
const chips = (page: Page) => page.getByRole('group', { name: 'של מי' });
const group = (page: Page, key: string) => page.locator(`[data-group="${key}"]`);
const rows = (scope: Locator) => scope.locator('[data-task-id]');
const bar = (page: Page) => page.locator('[data-home-controls]');

async function addChores(page: Page) {
  await page.evaluate((list) => {
    const tasks = (window as unknown as HookWindow).__homecareTest.state.tasks;
    for (const [title, categoryId] of list) tasks.create({ title, categoryId });
  }, CHORES);
  await expect(page.locator('[data-pulse="waiting"]')).toHaveText('24');
}

test('a long list folds into category groups of three; "עוד N" opens and folds one', async ({
  page
}) => {
  await openApp(page);
  await addChores(page);
  // Today stays a short, flat list.
  await expect(rows(section(page, 'plan'))).toHaveCount(4);
  await expect(section(page, 'plan').locator('[data-group]')).toHaveCount(0);

  await tab(page, /הכל/).click();
  await expect(tab(page, /הכל/)).toContainText('33');
  const plan = section(page, 'plan');
  // The category table's order, "שונות" (no category, or "אחר") last.
  expect(
    await plan.locator('[data-group]').evaluateAll((els) => els.map((e) => e.dataset.group))
  ).toEqual(['car', 'shopping', 'home', 'health', 'finance', 'returns', 'family', 'misc']);
  const home = group(page, 'home');
  await expect(home.getByRole('heading', { level: 3 })).toHaveText(/בית ותיקונים\s*9/);
  await expect(group(page, 'misc').getByRole('heading', { level: 3 })).toHaveText(/שונות\s*8/);
  // A group names its category once, in its heading, not on every row.
  await expect(home.locator('[data-task-id] .meta')).not.toContainText(['בית']);

  // Three, in order: the important one, the one for today, then the oldest.
  await expect(rows(home)).toHaveCount(3);
  expect(
    await rows(home).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.taskId))
  ).toEqual(['seed-water-filter', 'seed-ac', 'seed-washer']);
  // A group of two shows both, without a toggle; never a lone "עוד 1".
  await expect(rows(group(page, 'car'))).toHaveCount(2);
  await expect(group(page, 'car').locator('[data-more]')).toHaveCount(0);

  const more = home.locator('[data-more]');
  await expect(more).toHaveText('עוד 6');
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(more).toHaveAccessibleName('עוד 6 משימות ב"בית ותיקונים"');
  await more.click();
  await expect(rows(home)).toHaveCount(9);
  await expect(more).toHaveText('פחות');
  await expect(more).toHaveAttribute('aria-expanded', 'true');

  // Opened groups stay open for the session.
  await rows(home).first().locator('a.title').click();
  await expect(page).toHaveURL(/#\/task\/seed-water-filter$/);
  await page.goBack();
  await expect(rows(group(page, 'home'))).toHaveCount(9);

  await group(page, 'home').locator('[data-more]').click();
  await expect(rows(group(page, 'home'))).toHaveCount(3);
  await expect(group(page, 'home')).toBeInViewport();

  // The whole "הכל" list under the bar, folded, is about two screens.
  const height = await plan.evaluate(
    (el) =>
      el.getBoundingClientRect().bottom -
      el.querySelector('[data-home-controls]')!.getBoundingClientRect().bottom
  );
  expect(height).toBeLessThan(2 * 844);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await shot(page, 'home-many-all');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(200);
  await shot(page, 'home-many-all-dark');
});

test('the bar sticks under the top; a new tab or chip starts the list from its top', async ({
  page
}) => {
  await openApp(page);
  await addChores(page);
  await tab(page, /הכל/).click();
  await expect(bar(page)).not.toHaveAttribute('data-stuck');

  await page.evaluate(() => window.scrollTo(0, 1600));
  await expect(bar(page)).toHaveAttribute('data-stuck', '');
  await expect.poll(async () => (await bar(page).boundingBox())?.y).toBeLessThan(2);
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('stuck.png') });

  await chips(page).getByRole('button', { name: 'פנויות' }).click();
  // The list starts right under the bar, from its first group.
  await expect.poll(async () => (await bar(page).boundingBox())?.y).toBeLessThan(2);
  const plan = section(page, 'plan');
  await expect(plan.locator('[data-group]').first()).toBeInViewport();

  await page.evaluate(() => window.scrollTo(0, 1400));
  await tab(page, /היום/).click();
  await expect(rows(plan).first()).toBeInViewport();
  await expect(rows(plan)).toHaveCount(1);
});

test('"פנויות" lists what waits for someone, each with a take action', async ({ page }) => {
  await openApp(page);
  await addChores(page);
  await page.getByRole('button', { name: /^24 מחכות שמישהו ייקח/ }).click();
  await expect(chips(page).getByRole('button', { name: 'פנויות' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(tab(page, /הכל/)).toContainText('24');
  const plan = section(page, 'plan');
  // Every row shown has its own small take action, and no owner.
  const shown = await rows(plan).count();
  await expect(plan.getByRole('button', { name: 'אני לוקחת' })).toHaveCount(shown);
  await expect(plan.locator('[data-task-id]:not([data-owner=""])')).toHaveCount(0);

  const first = rows(group(page, 'car')).first();
  const id = await first.getAttribute('data-task-id');
  await first.getByRole('button', { name: 'אני לוקחת' }).click();
  await expect(plan.locator(`[data-task-id="${id}"]`)).toHaveCount(0);
  await expect(tab(page, /הכל/)).toContainText('23');
  await expect(page.locator('[data-pulse="waiting"]')).toHaveText('23');
});

test('tasks added into folded groups stay in sight, washed for a moment', async ({ page }) => {
  await openApp(page);
  await addChores(page);
  await tab(page, /הכל/).click();
  // Two in one go: quick add stays open for the next one.
  await page.locator('[data-fab]').click();
  const quick = page.getByTestId('quick-add');
  const input = quick.getByLabel('מה צריך לעשות?');
  for (const title of ['לקנות סוללות לשלט', 'לתקן את המדף בסלון']) {
    await input.fill(title);
    await quick.getByRole('button', { name: 'הוספה' }).click();
    await expect(quick.getByRole('status')).toContainText('נוסף ✓');
  }
  await page.goBack();
  await expect(quick).toHaveCount(0);

  // "הכל" already lists them: it stays, and each folded group shows its three and the new one.
  await expect(tab(page, /הכל/)).toHaveAttribute('aria-checked', 'true');
  const shopping = group(page, 'shopping');
  await expect(rows(shopping).filter({ hasText: 'לקנות סוללות לשלט' })).toBeInViewport();
  await expect(rows(shopping)).toHaveCount(4);
  await expect(shopping.locator('[data-more]')).toHaveText('עוד 2');
  const home = group(page, 'home');
  await expect(rows(home).filter({ hasText: 'לתקן את המדף בסלון' })).toBeAttached();
  await expect(rows(home)).toHaveCount(4);
  await expect(home.locator('[data-more]')).toHaveText('עוד 6');

  // Another view lets them go back to their places.
  await chips(page).getByRole('button', { name: 'פנויות' }).click();
  await expect(rows(group(page, 'shopping'))).toHaveCount(3);
  await expect(group(page, 'shopping').locator('[data-more]')).toHaveText('עוד 3');
});

test('"דורש תשומת לב" shows three, then "עוד N"; a new urgent task stays in sight', async ({
  page
}) => {
  await openApp(page);
  // Two more urgent tasks: five need attention.
  await page.evaluate(() => {
    const tasks = (window as unknown as HookWindow).__homecareTest.state.tasks;
    for (const id of ['seed-ac', 'seed-washer']) tasks.update(id, { priority: 'urgent' });
  });
  const attention = section(page, 'attention');
  await expect(attention.getByRole('heading', { level: 2 })).toHaveText(/דורש תשומת לב\s*5/);
  await expect(rows(attention)).toHaveCount(3);
  const more = attention.locator('[data-more]');
  await expect(more).toHaveText('עוד 2');
  await more.click();
  await expect(rows(attention)).toHaveCount(5);
  await expect(more).toHaveText('פחות');
  await more.click();
  await expect(rows(attention)).toHaveCount(3);

  // Quick add, urgent: it sorts after the older urgent ones, yet shows right away.
  await page.locator('[data-fab]').click();
  const quick = page.getByTestId('quick-add');
  await quick.getByLabel('מה צריך לעשות?').fill('להזמין חשמלאי דחוף');
  await quick.getByRole('button', { name: 'הוספה' }).click();
  await expect(quick.getByRole('status')).toContainText('נוסף ✓');
  await page.goBack();
  await expect(quick).toHaveCount(0);
  const added = rows(attention).filter({ hasText: 'להזמין חשמלאי' });
  await expect(added).toBeVisible();
  await expect(added).toBeInViewport();
  await expect(rows(attention)).toHaveCount(4);
  await expect(more).toHaveText('עוד 2');
  // Free: its small take action is right there.
  await expect(added.getByRole('button', { name: 'אני לוקחת' })).toBeVisible();
});

test('reduced motion: the same list, without the movement', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page);
  await addChores(page);
  await tab(page, /הכל/).click();
  const view = section(page, 'plan').locator('[data-view]');
  expect(await view.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await group(page, 'misc').locator('[data-more]').click();
  await expect(rows(group(page, 'misc'))).toHaveCount(8);
});

test('the long list is accessible: headings, named lists and toggles, no axe violations', async ({
  page
}) => {
  await openApp(page);
  await addChores(page);
  await tab(page, /הכל/).click();
  await expect(page.getByRole('heading', { level: 2, name: 'כל המשימות' })).toBeAttached();
  await expect(page.getByRole('list', { name: 'קניות' })).toBeVisible();
  const more = group(page, 'shopping').locator('[data-more]');
  const controls = await more.getAttribute('aria-controls');
  await expect(page.locator(`#${controls}`)).toHaveAttribute(
    'aria-labelledby',
    /home-group-shopping/
  );
  // Keyboard: the toggle is a real button.
  await more.focus();
  await page.keyboard.press('Enter');
  await expect(rows(group(page, 'shopping'))).toHaveCount(5);

  const axe = await new AxeBuilder({ page }).include('.home').analyze();
  const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
});
