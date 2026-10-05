import type { Page } from '@playwright/test';
import { expect, openApp, shot, test } from './fixtures';

// Flexible recurring tasks: every day, every N days / weeks / months, and listed weekdays, from the
// quick-add text, from the חוזרת picker (quick add and the task screen), and on completion.
// Fixed clock (fixtures.ts): Sunday 4 Oct 2026, 09:00 Asia/Jerusalem. Mon 5, Wed 7, Thu 8 Oct.

interface TaskLite {
  id: string;
  title: string;
  status: 'open' | 'done';
  scheduledFor: string | null;
  weekPlan: boolean;
  dueDate: string | null;
  recurrence: { freq: string; interval?: number; weekdays?: number[]; anchor?: string } | null;
  seriesId: string | null;
}
interface Hooks {
  state: {
    tasks: {
      open: TaskLite[];
      create(draft: Record<string, unknown>): string | null;
    };
  };
}
type HookWindow = Window & { __homecareTest: Hooks };

const openTasks = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest.state.tasks.open.map(
      (t) => JSON.parse(JSON.stringify(t)) as TaskLite
    )
  );

async function findOpen(page: Page, title: string, pred: (t: TaskLite) => boolean = () => true) {
  await expect
    .poll(async () => (await openTasks(page)).some((t) => t.title === title && pred(t)))
    .toBe(true);
  return (await openTasks(page)).find((t) => t.title === title && pred(t)) as TaskLite;
}

test('quick add reads "כל ראשון ורביעי": weekly on Sunday and Wednesday, from Wednesday', async ({
  page
}) => {
  await openApp(page, '#/new');
  const sheet = page.getByTestId('quick-add');
  const input = sheet.getByLabel('מה צריך לעשות?');
  await input.fill('לשטוף את הרצפה כל ראשון ורביעי');
  const token = sheet.locator('[data-key="recurrence:כל ראשון ורביעי"]');
  await expect(token).toContainText('בימים א׳ וד׳ · יום ד׳ 7/10');
  await expect(sheet.locator('[data-picker="recurrence"]')).toContainText('בימים א׳ וד׳');
  await shot(page, 'recurrence-quick-add-parsed');
  await input.press('Enter');

  const task = await findOpen(page, 'לשטוף את הרצפה');
  expect(task).toMatchObject({
    scheduledFor: '2026-10-07',
    recurrence: { freq: 'weekly', weekdays: [0, 3], anchor: '2026-10-07' }
  });

  await openApp(page, '#/', { reset: false });
  await page.getByRole('radio', { name: /השבוע/ }).click();
  const card = page.locator(`[data-task-id="${task.id}"]`);
  await expect(card).toContainText('בימים א׳ וד׳');
});

test('quick add text: every day, every two weeks, and "פעמיים בשבוע" invents no days', async ({
  page
}) => {
  await openApp(page, '#/new');
  const sheet = page.getByTestId('quick-add');
  const input = sheet.getByLabel('מה צריך לעשות?');

  await input.fill('לתת לכלב כדור כל יום ב-20:00');
  await expect(sheet.locator('[data-key="recurrence:כל יום"]')).toHaveText(/כל יום/);
  await expect(sheet.locator('[data-picker="when"]')).toContainText('היום 20:00');
  await input.press('Enter');
  expect(await findOpen(page, 'לתת לכלב כדור')).toMatchObject({
    scheduledFor: '2026-10-04',
    recurrence: { freq: 'daily', anchor: '2026-10-04' }
  });

  await input.fill('לנקות את המקרר כל שבועיים');
  await expect(sheet.locator('[data-picker="recurrence"]')).toContainText('כל שבועיים');
  await input.press('Enter');
  expect(await findOpen(page, 'לנקות את המקרר')).toMatchObject({
    weekPlan: true,
    recurrence: { freq: 'weekly', interval: 2 }
  });

  await input.fill('ריצה פעמיים בשבוע');
  await expect(sheet.locator('[data-key^="recurrence:"]')).toHaveCount(0);
  await expect(sheet.locator('[data-picker="recurrence"]')).toContainText('בחירה');
  await input.press('Enter');
  expect(await findOpen(page, 'ריצה פעמיים בשבוע')).toMatchObject({ recurrence: null });
});

test('the חוזרת picker: "כל יום" plans today; "אחר" sets every 2 weeks on chosen days', async ({
  page
}) => {
  await openApp(page, '#/new');
  const sheet = page.getByTestId('quick-add');
  const input = sheet.getByLabel('מה צריך לעשות?');
  const repeatChip = sheet.locator('[data-picker="recurrence"]');

  // a one-tap preset closes the picker, and a daily series starts today
  await input.fill('להשקות עציצים');
  await repeatChip.click();
  await sheet.locator('[data-repeat="daily"]').click();
  await expect(sheet.locator('[data-panel="recurrence"]')).toHaveCount(0);
  await expect(repeatChip).toContainText('כל יום');
  await expect(sheet.locator('[data-picker="when"]')).toContainText('היום');
  await input.press('Enter');
  expect(await findOpen(page, 'להשקות עציצים')).toMatchObject({
    scheduledFor: '2026-10-04',
    recurrence: { freq: 'daily', anchor: '2026-10-04' }
  });

  // custom: every 2 weeks on Monday and Thursday, planned on the first of them (Monday)
  await input.fill('ניקיון יסודי');
  await repeatChip.click();
  await sheet.locator('[data-repeat="custom"]').click();
  const custom = sheet.getByTestId('repeat-custom');
  await expect(custom.getByRole('group', { name: 'כל כמה' })).toContainText('2');
  await expect(custom.getByRole('radio', { name: 'שבועות' })).toHaveAttribute(
    'aria-checked',
    'true'
  );
  await sheet.getByRole('button', { name: 'יום שני', exact: true }).click();
  await sheet.getByRole('button', { name: 'יום חמישי', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'יום שני', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(repeatChip).toContainText('כל שבועיים בימים ב׳ וה׳');
  await expect(sheet.locator('[data-picker="when"]')).toContainText('מחר');
  await shot(page, 'recurrence-picker-custom');
  await input.press('Enter');
  expect(await findOpen(page, 'ניקיון יסודי')).toMatchObject({
    scheduledFor: '2026-10-05',
    recurrence: { freq: 'weekly', interval: 2, weekdays: [1, 4], anchor: '2026-10-05' }
  });
});

test('task screen: change to every 2 days, complete, and the next one is 2 days on', async ({
  page
}) => {
  await openApp(page);
  const id = await page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest.state.tasks.create({
      title: 'להאכיל את הדגים',
      scheduledFor: '2026-10-04',
      recurrence: { freq: 'daily' }
    })
  );
  await openApp(page, `#/task/${id}`, { reset: false });
  const detail = page.getByTestId('task-detail');
  const field = detail.locator('[data-field="recurrence"]');
  await expect(field).toContainText('כל יום');
  await field.locator('button[aria-expanded]').click();
  await field.locator('[data-repeat="custom"]').click();
  await expect(
    field.getByTestId('repeat-custom').getByRole('radio', { name: 'ימים' })
  ).toHaveAttribute('aria-checked', 'true');
  await expect(field.locator('button[aria-expanded]')).toContainText('כל יומיים');
  await expect
    .poll(async () => (await openTasks(page)).find((t) => t.id === id)?.recurrence)
    .toEqual({ freq: 'daily', interval: 2, anchor: '2026-10-04' });
  await shot(page, 'recurrence-task-screen');

  await detail.getByRole('button', { name: 'בוצע', exact: true }).click();
  await page.getByTestId('complete-sheet').getByRole('button', { name: 'סיום' }).click();
  const next = await findOpen(page, 'להאכיל את הדגים', (t) => t.id !== id);
  expect(next).toMatchObject({
    scheduledFor: '2026-10-06',
    seriesId: id,
    recurrence: { freq: 'daily', interval: 2, anchor: '2026-10-04' }
  });
});

test('task screen: weekday toggles start from the task’s own day', async ({ page }) => {
  await openApp(page);
  const id = await page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest.state.tasks.create({
      title: 'חוג שחייה',
      scheduledFor: '2026-10-05', // a Monday
      recurrence: { freq: 'weekly' }
    })
  );
  await openApp(page, `#/task/${id}`, { reset: false });
  const field = page.getByTestId('task-detail').locator('[data-field="recurrence"]');
  await field.locator('button[aria-expanded]').click();
  await expect(field.getByRole('button', { name: 'יום שני', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await field.getByRole('button', { name: 'יום חמישי', exact: true }).click();
  await expect(field.locator('button[aria-expanded]')).toContainText('בימים ב׳ וה׳');
  await expect
    .poll(async () => (await openTasks(page)).find((t) => t.id === id)?.recurrence)
    .toEqual({ freq: 'weekly', weekdays: [1, 4], anchor: '2026-10-05' });
});
