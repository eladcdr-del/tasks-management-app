import type { Page } from '@playwright/test';
import { expect, openApp, test } from './fixtures';

// Quick add and the time of day (launch audit CON-1, CON-8, MOM-8, MOM-12).
// Fixed clock (fixtures.ts): Sunday 4 Oct 2026, 09:00 Asia/Jerusalem; "מחר" = Mon 5 Oct and
// "יום חמישי" = Thu 8 Oct.

interface TaskLite {
  id: string;
  title: string;
  scheduledFor: string | null;
  dueDate: string | null;
  dueTime: string | null;
}
interface Hooks {
  state: {
    tasks: {
      open: TaskLite[];
      create(draft: { title: string; dueTime?: string }): string | null;
    };
  };
}
type HookWindow = Window & { __homecareTest: Hooks };

async function findOpen(page: Page, title: string): Promise<TaskLite> {
  const open = () =>
    page.evaluate(() =>
      (window as unknown as HookWindow).__homecareTest.state.tasks.open.map((t) => ({ ...t }))
    );
  await expect.poll(async () => (await open()).some((t) => t.title === title)).toBe(true);
  const t = (await open()).find((x) => x.title === title);
  if (!t) throw new Error(`no open task "${title}"`);
  return t;
}

test('a time with no day stays in the title instead of vanishing', async ({ page }) => {
  await openApp(page, '#/new');
  const sheet = page.getByTestId('quick-add');
  const input = sheet.getByLabel('מה צריך לעשות?');

  await input.fill('לאסוף את שני מהגן ב-16:30');
  await expect(sheet.getByRole('list', { name: 'זוהה בטקסט' })).toHaveCount(0);
  // the picker separator keeps its spaces (MOM-8)
  await expect(sheet.locator('[data-picker="when"]')).toHaveText('מתי · בחירה');

  await input.press('Enter');
  const added = await findOpen(page, 'לאסוף את שני מהגן ב-16:30');
  expect(added).toMatchObject({ scheduledFor: null, dueDate: null, dueTime: null });
});

test('a plan, a deadline and a time: "מתי" is the plan, the time stays with it', async ({
  page
}) => {
  await openApp(page, '#/new');
  const sheet = page.getByTestId('quick-add');
  const input = sheet.getByLabel('מה צריך לעשות?');

  await input.fill('תור לרופא מחר ב-10 עד יום חמישי');
  const tokens = sheet.getByRole('list', { name: 'זוהה בטקסט' });
  await expect(tokens.locator('[data-key^="date:"]')).toContainText('מחר');
  await expect(tokens.locator('[data-key^="due:"]')).toContainText('עד יום ה׳ 8/10');
  await expect(tokens.locator('[data-key^="time:"]')).toHaveCount(0);
  // as in the task screen: the plan under "מתי", the deadline on its own "עד" chip (MOM-12)
  const when = sheet.locator('[data-picker="when"]');
  await expect(when).toContainText('מחר');
  await expect(when).not.toContainText('עד');

  await input.press('Enter');
  const added = await findOpen(page, 'תור לרופא ב-10');
  expect(added).toMatchObject({
    scheduledFor: '2026-10-05',
    dueDate: '2026-10-08',
    dueTime: null
  });
});

test('an older task with a time and no date still shows its time', async ({ page }) => {
  await openApp(page);
  const id = await page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest.state.tasks.create({
      title: 'להתקשר לשני',
      dueTime: '16:30'
    })
  );
  expect(id).not.toBeNull();
  await page.evaluate((taskId) => (location.hash = `#/task/${taskId}`), id);

  const detail = page.getByTestId('task-detail');
  await expect(detail.locator('.meta')).toContainText('16:30');
  await expect(detail.locator('[data-field="when"]')).toContainText('16:30');
});
