// Flexible recurring tasks through the UI against the emulators (firestore.rules enforced): quick add
// "כל ראשון ורביעי", switch it to every 2 weeks on the task screen, complete it, and every write
// (create, edit, the next instance) reaches the server (pending clears) with the rule intact.

import type { Page } from '@playwright/test';
import { expect, signIn, test } from './fixtures';

interface TaskLite {
  id: string;
  title: string;
  status: string;
  pending?: boolean;
  seriesId: string | null;
  recurrence: { freq: string; interval?: number; weekdays?: number[]; anchor?: string } | null;
}
interface Hooks {
  state: {
    session: {
      phase: string;
      createHousehold(
        name: string,
        p: { displayName: string; photoURL: null; color: string; addressAs: 'f' | 'm' }
      ): Promise<string>;
    };
    tasks: { open: TaskLite[]; byId(id: string): TaskLite | null };
  };
}
type HookWindow = Window & { __homecareTest: Hooks };

// Unique account, no clearEmulators(): other emulator specs run against the same emulators.
const UID = `rec-mom-${Date.now().toString(36)}`;
const TITLE = 'לשטוף את הרצפה';

test.use({ now: null });

const phaseIs = (page: Page, phase: string) =>
  page.waitForFunction(
    (p) => (window as unknown as HookWindow).__homecareTest?.state.session.phase === p,
    phase,
    { timeout: 20_000 }
  );

const openTasks = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest.state.tasks.open.map(
      (t) => JSON.parse(JSON.stringify(t)) as TaskLite
    )
  );

/** The open task matching `pred`, once the server has acknowledged it (rules accepted). */
async function synced(page: Page, pred: (t: TaskLite) => boolean): Promise<TaskLite> {
  await expect
    .poll(async () => (await openTasks(page)).some((t) => pred(t) && t.pending === false), {
      timeout: 15_000
    })
    .toBe(true);
  return (await openTasks(page)).find(pred) as TaskLite;
}

test('a weekday series: quick add, edit to every 2 weeks, complete; the server accepts each write', async ({
  page
}) => {
  test.setTimeout(120_000);
  await page.goto('./?emulator=1#/');
  await phaseIs(page, 'signed-out');
  await signIn(page, UID, 'מיכל');
  await phaseIs(page, 'no-household');
  await page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest.state.session.createHousehold('הבית', {
      displayName: 'מיכל',
      photoURL: null,
      color: 'terracotta',
      addressAs: 'f'
    })
  );
  await phaseIs(page, 'ready');

  // quick add, parsed
  await page.evaluate(() => (location.hash = '#/new'));
  const sheet = page.getByTestId('quick-add');
  const input = sheet.getByLabel('מה צריך לעשות?');
  await input.fill(`${TITLE} כל ראשון ורביעי`);
  await expect(sheet.locator('[data-key="recurrence:כל ראשון ורביעי"]')).toBeVisible();
  await input.press('Enter');
  const created = await synced(page, (t) => t.title === TITLE);
  expect(created.recurrence).toMatchObject({ freq: 'weekly', weekdays: [0, 3] });
  expect(created.recurrence?.anchor).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  // the task screen: every 2 weeks, same days
  await page.evaluate((id) => (location.hash = `#/task/${id}`), created.id);
  const field = page.getByTestId('task-detail').locator('[data-field="recurrence"]');
  await field.locator('button[aria-expanded]').click();
  await field.locator('[data-repeat="custom"]').click();
  await expect(field.locator('button[aria-expanded]')).toContainText('כל שבועיים בימים א׳ וד׳');
  const edited = await synced(page, (t) => t.id === created.id && t.recurrence?.interval === 2);
  expect(edited.recurrence).toEqual({
    freq: 'weekly',
    interval: 2,
    weekdays: [0, 3],
    anchor: created.recurrence?.anchor
  });

  // complete: the next instance is written by the same batch and keeps the rule
  await page.getByTestId('task-detail').getByRole('button', { name: 'בוצע', exact: true }).click();
  await page.getByTestId('complete-sheet').getByRole('button', { name: 'סיום' }).click();
  const next = await synced(page, (t) => t.title === TITLE && t.seriesId === created.id);
  expect(next.recurrence).toEqual(edited.recurrence);
});
