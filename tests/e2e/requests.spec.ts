import type { Locator, Page } from '@playwright/test';
import { expect, openApp, shot, test } from './fixtures';

// Requests are proposals (demo seed, Sunday 2026-10-04 09:00): דני asked מיכל to pick up the parcel
// (seed-post) and she has not answered. Until she does, nobody holds it: for her it is "ביקשו
// ממך" with "אני לוקחת" / "לא מתאים לי"; for דני it waits for someone to take it, with a quiet
// "ביקשת ממיכל · מחכה לתשובה". The flows: accept, decline, withdraw, and asking from the sheet.

interface TaskLite {
  id: string;
  ownerId: string | null;
  requestedBy: string | null;
  requestedOf?: string | null;
}
interface Hooks {
  actAs(uid: string): Promise<void>;
  state: {
    tasks: { byId(id: string): TaskLite | null };
    ui: { current: { message: string } | null };
  };
}
type HookWindow = Window & { __homecareTest: Hooks };

const pulse = (page: Page, key: string) => page.locator(`[data-pulse="${key}"]`);
const section = (page: Page, name: string) => page.locator(`[data-section="${name}"]`);
const card = (scope: Page | Locator, id: string) => scope.locator(`[data-task-id="${id}"]`).first();
const actAs = (page: Page, uid: string) =>
  page.evaluate((uid) => (window as unknown as HookWindow).__homecareTest.actAs(uid), uid);
const taskById = (page: Page, id: string) =>
  page.evaluate((id) => {
    const t = (window as unknown as HookWindow).__homecareTest.state.tasks.byId(id);
    return t ? (JSON.parse(JSON.stringify(t)) as TaskLite) : null;
  }, id);
const snack = (page: Page) =>
  expect.poll(() =>
    page.evaluate(
      () => (window as unknown as HookWindow).__homecareTest.state.ui.current?.message ?? ''
    )
  );
const historyTexts = (page: Page) => page.locator('.timeline li .text');

/** Screenshot in light, then dark (the same state). */
async function shots(page: Page, name: string) {
  await page.waitForTimeout(350);
  await shot(page, `${name}-light`);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(250);
  await shot(page, `${name}-dark`);
  await page.emulateMedia({ colorScheme: 'light' });
}

test('a request is not theirs yet: the asked member sees it to answer, everyone else sees it waiting', async ({
  page
}) => {
  await openApp(page);
  // מיכל: asked, with her two answers; nobody holds it (dashed avatar, muted in the time list).
  const asked = card(section(page, 'requested'), 'seed-post');
  await expect(asked.locator('[data-request]')).toHaveText('דני ביקש ממך');
  await expect(asked).toHaveAttribute('data-owner', '');
  await expect(asked.getByRole('button', { name: 'אני לוקחת' })).toBeVisible();
  await expect(asked.getByRole('button', { name: 'לא מתאים לי' })).toBeVisible();
  await expect(pulse(page, 'requested')).toHaveText('1');
  await expect(section(page, 'waiting').locator('[data-task-id="seed-post"]')).toHaveCount(0);
  await asked.scrollIntoViewIfNeeded();
  await shots(page, 'requests-home-asked');

  // דני: it waits for someone to take it, with his quiet line; anyone may still take it.
  await actAs(page, 'dani');
  await expect(pulse(page, 'waiting')).toHaveText('4');
  await expect(section(page, 'requested')).toHaveCount(0);
  const waiting = card(section(page, 'waiting'), 'seed-post');
  await expect(waiting.locator('[data-request]')).toHaveText('ביקשת ממיכל · מחכה לתשובה');
  await expect(waiting.getByRole('button', { name: 'אני לוקח' })).toBeVisible();
  // The balance row counts it for nobody.
  const balance = page.getByRole('group', { name: 'משימות פתוחות אצל כל אחד' });
  await expect(balance).toContainText('6');
  await waiting.scrollIntoViewIfNeeded();
  await shots(page, 'requests-home-asker');
});

test('accept: "אני לוקחת" makes it hers, and the history says so', async ({ page }) => {
  await openApp(page);
  await card(section(page, 'requested'), 'seed-post')
    .getByRole('button', { name: 'אני לוקחת' })
    .click();
  await snack(page).toBe('המשימה אצלך');
  await expect(section(page, 'requested')).toHaveCount(0);
  await expect.poll(async () => (await taskById(page, 'seed-post'))?.ownerId).toBe('michal');

  await page.getByRole('radio', { name: /השבוע/ }).click();
  const mine = card(section(page, 'plan'), 'seed-post');
  await expect(mine).toHaveAttribute('data-owner', 'michal');
  await expect(mine).not.toHaveAttribute('data-muted', '');
  await expect(mine.locator('[data-request]')).toHaveText('לבקשת דני');

  await mine.locator('a.title').click();
  const block = page.getByTestId('owner-block');
  await expect(block.locator('.owner-line')).toHaveText('אצלך');
  await expect(block.locator('[data-request-line]')).toHaveText('לבקשת דני');
  await expect(historyTexts(page)).toContainText(['דני ביקש ממיכל', 'מיכל לקחה, לבקשת דני']);

  // דני sees it as hers, "at his request".
  await actAs(page, 'dani');
  await expect(block.locator('.owner-line')).toHaveText('אצל מיכל');
  await expect(block.locator('[data-request-line]')).toHaveText('לבקשתך');
  await shots(page, 'requests-detail-accepted');
});

test('decline: "לא מתאים לי" leaves it waiting for anyone, gently', async ({ page }) => {
  await openApp(page);
  await card(section(page, 'requested'), 'seed-post')
    .getByRole('button', { name: 'לא מתאים לי' })
    .click();
  await snack(page).toBe('בסדר, המשימה תחכה שמישהו ייקח');
  await expect(section(page, 'requested')).toHaveCount(0);
  await expect(pulse(page, 'waiting')).toHaveText('4');
  const waiting = card(section(page, 'waiting'), 'seed-post');
  await expect(waiting.locator('[data-request]')).toHaveCount(0);
  await expect(waiting.getByRole('button', { name: 'אני לוקחת' })).toBeVisible();
  await shots(page, 'requests-home-declined');

  await page.goto('./?demo=1#/task/seed-post');
  await expect(historyTexts(page).last()).toHaveText('מיכל אמרה שלא מתאים לה');
});

test('the asked member answers from the task screen too', async ({ page }) => {
  await openApp(page, '#/task/seed-post');
  const block = page.getByTestId('owner-block');
  await expect(block.locator('.owner-line')).toHaveText('דני ביקש ממך');
  await expect(block.locator('[data-request-line]')).toHaveText('מחכה לתשובה שלך');
  await expect(block.getByRole('button', { name: 'לבקש מ…' })).toHaveCount(0);
  await shots(page, 'requests-detail-asked');
  await block.getByRole('button', { name: 'אני לוקחת' }).click();
  await expect(block.locator('.owner-line')).toHaveText('אצלך');
  await expect(block.getByRole('button', { name: 'להחזיר לרשימה' })).toBeVisible();
});

test('the asker withdraws a request from the task screen', async ({ page }) => {
  await openApp(page, '#/task/seed-post');
  await actAs(page, 'dani');
  const block = page.getByTestId('owner-block');
  await expect(block.locator('.owner-line')).toHaveText('מחכה שמישהו ייקח');
  await expect(block.locator('[data-request-line]')).toHaveText('ביקשת ממיכל · מחכה לתשובה');
  await shots(page, 'requests-detail-asker');
  await block.getByRole('button', { name: 'ביטול הבקשה' }).click();
  await snack(page).toBe('הבקשה בוטלה');
  await expect(block.locator('[data-request-line]')).toHaveCount(0);
  await expect(block.getByRole('button', { name: 'ביטול הבקשה' })).toHaveCount(0);
  await expect(historyTexts(page).last()).toHaveText('דני ביטל את הבקשה ממיכל');
  expect(await taskById(page, 'seed-post')).toMatchObject({
    ownerId: null,
    requestedBy: null,
    requestedOf: null
  });

  // מיכל no longer has anything to answer.
  await actAs(page, 'michal');
  await page.goto('./?demo=1#/');
  await expect(section(page, 'requested')).toHaveCount(0);
  await expect(pulse(page, 'requested')).toHaveCount(0);
});

test('asking from the sheet: the asked member cannot be asked twice, and anyone may still take it', async ({
  page
}) => {
  await openApp(page, '#/task/seed-post');
  await actAs(page, 'dani');
  await page.getByTestId('owner-block').getByRole('button', { name: 'לבקש מ…' }).click();
  const sheet = page.locator('[data-sheet-content="request"]');
  await expect(sheet.getByRole('radio', { name: /מיכל/ })).toBeDisabled();
  await expect(sheet).toContainText('כבר מחכה לתשובה שלה');
  await expect(sheet.locator('[data-request-note]')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'שליחת הבקשה' })).toBeDisabled();
  await shots(page, 'requests-sheet');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);

  // דני takes it himself: the request goes with it.
  await page.getByTestId('owner-block').getByRole('button', { name: 'אני לוקח' }).click();
  await expect(page.getByTestId('owner-block').locator('.owner-line')).toHaveText('אצלך');
  expect(await taskById(page, 'seed-post')).toMatchObject({
    ownerId: 'dani',
    requestedBy: null,
    requestedOf: null
  });
});
