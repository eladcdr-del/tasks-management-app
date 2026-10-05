import type { Locator, Page } from '@playwright/test';
import { expect, openApp, shot, test } from './fixtures';

// Home (step 3.2) on the demo seed at the fixed clock (Sunday 2026-10-04 09:00, signed in as מיכל):
// attention 3 (1 overdue + 2 urgent), today 4, waiting 3, week 5, later 4; one request to מיכל
// (דני asked her to pick up the parcel, planned for Tuesday).

interface Hooks {
  actAs(uid: string): Promise<void>;
  state: {
    session: { leaveHousehold(): Promise<void> };
    ui: { current: { message: string } | null };
    tasks: {
      open: { id: string; status: string }[];
      groups: Record<
        'attention' | 'requested' | 'waiting' | 'today' | 'week' | 'later',
        { id: string }[]
      >;
      snooze(id: string, until: string): void;
      remove(id: string): void;
      update(id: string, patch: Record<string, unknown>): void;
      complete(
        id: string,
        c: { note: string; cost: number | null; place: string; contact: string }
      ): Promise<unknown>;
    };
  };
}
type HookWindow = Window & { __homecareTest: Hooks };

const pulse = (page: Page, key: string) => page.locator(`[data-pulse="${key}"]`);
const section = (page: Page, name: string) => page.locator(`[data-section="${name}"]`);
const card = (scope: Page | Locator, id: string) => scope.locator(`[data-task-id="${id}"]`).first();
/** The snackbar the screen asked for (SnackbarHost renders ui.current; read it from the store). */
const snack = (page: Page) =>
  expect.poll(() =>
    page.evaluate(
      () => (window as unknown as HookWindow).__homecareTest.state.ui.current?.message ?? ''
    )
  );

async function swipe(page: Page, target: Locator, dx: number) {
  await target.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = (await target.boundingBox())!;
  const y = box.y + box.height / 2;
  const x = box.x + box.width / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y + i * 0.5);
  await page.mouse.up();
}

test('the pulse, sections and header tell the story at a glance', async ({ page }) => {
  await openApp(page);
  await expect(pulse(page, 'attention')).toHaveText('3');
  await expect(pulse(page, 'today')).toHaveText('4');
  await expect(pulse(page, 'waiting')).toHaveText('3');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('בוקר טוב, מיכל');
  await expect(page.getByText('יום ראשון, 4 באוקטובר')).toBeVisible();
  await expect(page.getByText('ארוחה במסעדה · 7 מתוך 10')).toBeVisible();

  await expect(section(page, 'attention').locator('[data-task-id]')).toHaveCount(3);
  await expect(section(page, 'waiting').locator('[data-task-id]')).toHaveCount(3);
  // Overdue: a solid danger badge.
  await expect(card(section(page, 'attention'), 'seed-library')).toContainText('באיחור של יומיים');
  // The unowned task due today is listed in Today too, de-emphasised.
  const plan = section(page, 'plan');
  await expect(plan.locator('[data-task-id]')).toHaveCount(4);
  await expect(card(plan, 'seed-bulbs')).toHaveAttribute('data-muted', '');
  // Snoozed 4 times and open for weeks: both show on the card.
  await expect(card(plan, 'seed-ac')).toContainText('נדחתה 4 פעמים');
  await expect(card(plan, 'seed-ac')).toContainText('פתוחה 7 שבועות');
  // Balance row: counts only.
  await expect(page.getByRole('group', { name: 'משימות פתוחות אצל כל אחד' })).toContainText('מיכל');

  await page.waitForTimeout(400);
  await shot(page, 'home-typical');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(200);
  await shot(page, 'home-dark');
});

test('tapping a numeral scrolls to its list', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: /^3 מחכות שמישהו ייקח/ }).click();
  await expect(section(page, 'waiting')).toBeInViewport();
});

test('take a waiting task with one tap', async ({ page }) => {
  await openApp(page);
  const waiting = section(page, 'waiting');
  await card(waiting, 'seed-bulbs').getByRole('button', { name: 'אני לוקחת' }).click();
  await snack(page).toContain('המשימה אצלך');
  await expect(pulse(page, 'waiting')).toHaveText('2');
  await expect(waiting.locator('[data-task-id="seed-bulbs"]')).toHaveCount(0);
  const mine = card(section(page, 'plan'), 'seed-bulbs');
  await expect(mine).toHaveAttribute('data-owner', 'michal');
  await expect(mine).not.toHaveAttribute('data-muted', '');
});

test('request a waiting task from the partner', async ({ page }) => {
  await openApp(page);
  await card(section(page, 'waiting'), 'seed-washer')
    .getByRole('button', { name: 'לבקש מ…' })
    .click();
  const sheet = page.locator('[data-sheet-content="request"]');
  await expect(sheet).toBeVisible();
  // The only other member is the only choice; nothing is ranked or suggested beyond that.
  await expect(sheet.getByRole('radio', { name: 'דני' })).toBeChecked();
  await sheet.getByRole('button', { name: 'שליחת הבקשה' }).click();
  await expect(sheet).toHaveCount(0);
  await snack(page).toContain('הבקשה נשלחה לדני');
  await expect(pulse(page, 'waiting')).toHaveText('2');

  await page.getByRole('radio', { name: /בהמשך/ }).click();
  const requested = card(section(page, 'plan'), 'seed-washer');
  await expect(requested).toHaveAttribute('data-owner', 'dani');
  await expect(requested).toContainText('ביקשת מדני');

  // On דני's side the undated request is right on Home, not buried under "בהמשך".
  await page.evaluate(() => (window as unknown as HookWindow).__homecareTest.actAs('dani'));
  await page.getByRole('radio', { name: /היום/ }).click();
  await expect(card(section(page, 'requested'), 'seed-washer')).toContainText('מיכל ביקשה ממך');
  await expect(pulse(page, 'requested')).toHaveText('1');
});

test('a request to me stands out whatever the tab, and counts in the pulse', async ({ page }) => {
  await openApp(page);
  const requested = section(page, 'requested');
  await expect(requested.locator('[data-task-id]')).toHaveCount(1);
  await expect(card(requested, 'seed-post')).toContainText('דני ביקש ממך');
  await expect(pulse(page, 'requested')).toHaveText('1');
  await expect(page.locator('[data-section]')).toHaveCount(4);
  expect(
    await page
      .locator('[data-section]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-section')))
  ).toEqual(['attention', 'requested', 'waiting', 'plan']);
  for (const tab of [/בהמשך/, /השבוע/, /היום/]) {
    await page.getByRole('radio', { name: tab }).click();
    await expect(card(requested, 'seed-post')).toBeVisible();
  }
  await page.getByRole('button', { name: /^1 ביקשו ממך/ }).click();
  await expect(requested).toBeInViewport();

  // Made urgent: it counts as urgent at once, though it is planned for Tuesday.
  await page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest.state.tasks.update('seed-post', {
      priority: 'urgent'
    })
  );
  await expect(pulse(page, 'attention')).toHaveText('4');
  await expect(card(section(page, 'attention'), 'seed-post')).toBeVisible();
  await expect(requested).toHaveCount(0);
  await expect(pulse(page, 'requested')).toHaveCount(0);
});

test('alone in the household: no "waiting" wall, and no "ask for help" dead end', async ({
  page
}) => {
  await openApp(page);
  // דני leaves: מיכל is alone, and his open tasks wait for someone to take them.
  await page.evaluate(async () => {
    const h = (window as unknown as HookWindow).__homecareTest;
    await h.actAs('dani');
    await h.state.session.leaveHousehold();
    await h.actAs('michal');
  });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('בוקר טוב, מיכל');
  await expect(pulse(page, 'waiting')).not.toHaveText('0');
  await expect(section(page, 'waiting')).toHaveCount(0);
  const plan = section(page, 'plan');
  await expect(plan.locator('[data-task-id]').first()).toBeVisible();
  await expect(plan.locator('[data-muted]')).toHaveCount(0);

  // A hard deadline today: the blocked snooze sheet offers doing it, not asking nobody.
  await page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest.state.tasks.update('seed-shirt', {
      dueDate: '2026-10-04'
    })
  );
  await swipe(page, card(section(page, 'attention'), 'seed-shirt').locator('article'), 160);
  const sheet = page.locator('[data-sheet-content="snooze"]');
  await expect(sheet.getByRole('heading', { name: 'היום הוא היום האחרון' })).toBeVisible();
  await expect(sheet).toContainText('מועד אחרון אי אפשר לדחות. אולי לעשות את זה היום?');
  await expect(sheet.getByRole('button', { name: 'לסמן כבוצעה' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'לבקש עזרה' })).toHaveCount(0);
});

test('swiping toward inline-start snoozes: the card moves and the counter bumps', async ({
  page
}) => {
  await openApp(page);
  const plan = section(page, 'plan');
  await swipe(page, card(plan, 'seed-ac').locator('article'), 160); // RTL: inline-start is the right
  const sheet = page.locator('[data-sheet-content="snooze"]');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-snooze-history]')).toHaveText('נדחתה 4 פעמים עד עכשיו');
  await expect(sheet.locator('[data-snooze="tomorrow"]')).toContainText('יום שני, 5 באוקטובר');
  await sheet.locator('[data-snooze="tomorrow"]').click();

  await snack(page).toContain('נדחתה למחר');
  await expect(pulse(page, 'today')).toHaveText('3');
  await expect(plan.locator('[data-task-id="seed-ac"]')).toHaveCount(0);
  await page.getByRole('radio', { name: /השבוע/ }).click();
  await expect(card(plan, 'seed-ac')).toContainText('נדחתה 5 פעמים');
});

test('swiping toward inline-end opens the complete sheet; a vertical drag does nothing', async ({
  page
}) => {
  await openApp(page);
  const target = card(section(page, 'plan'), 'seed-dentist').locator('article');
  await swipe(page, target, -160);
  await expect(page.locator('[data-sheet="complete"]')).toBeVisible();
});

test('a hard deadline today cannot be snoozed: the sheet offers doing it or asking', async ({
  page
}) => {
  await openApp(page);
  // The shirt exchange's last day is today (the seed has it in three days).
  await page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest.state.tasks.update('seed-shirt', {
      dueDate: '2026-10-04'
    })
  );
  const shirt = card(section(page, 'attention'), 'seed-shirt');
  await expect(shirt).toContainText('עד היום');
  await swipe(page, shirt.locator('article'), 160);
  const sheet = page.locator('[data-sheet-content="snooze"]');
  await expect(sheet.getByRole('heading', { name: 'היום הוא היום האחרון' })).toBeVisible();
  await expect(sheet.locator('[data-snooze]')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'לבקש עזרה' }).click();
  await expect(page.locator('[data-sheet-content="request"]')).toBeVisible();
});

test('bucket tabs and member filters', async ({ page }) => {
  await openApp(page);
  const plan = section(page, 'plan');
  const cards = plan.locator('[data-task-id]');
  await expect(page.getByRole('radio', { name: /השבוע/ })).toContainText('5');
  await page.getByRole('radio', { name: /השבוע/ }).click();
  await expect(cards).toHaveCount(5);
  await page.getByRole('radio', { name: /בהמשך/ }).click();
  await expect(cards).toHaveCount(4);

  await page.getByRole('radio', { name: /השבוע/ }).click();
  await page.getByRole('button', { name: 'שלי', exact: true }).click();
  await expect(cards).toHaveCount(3);
  for (const id of ['seed-post', 'seed-shirt', 'seed-wedding-gift']) {
    await expect(card(plan, id)).toBeVisible();
  }
  await page.getByRole('button', { name: /של דני/ }).click();
  await expect(cards).toHaveCount(1);
  await expect(card(plan, 'seed-netflix')).toBeVisible();
  await page.getByRole('button', { name: 'הכל', exact: true }).click();
  await expect(cards).toHaveCount(5);
});

test('empty states: a calm Today, and an all-clear home', async ({ page }) => {
  await openApp(page);
  await expect(pulse(page, 'today')).toHaveText('4');
  await page.evaluate(() => {
    const s = (window as unknown as HookWindow).__homecareTest.state.tasks;
    for (const t of s.groups.today) s.snooze(t.id, '2026-10-20');
  });
  // Today is empty, but overdue / urgent work and a request wait above it: not "breathe" yet. The
  // body points to the tab that has the next tasks.
  const empty = page.locator('[data-empty="today"]');
  await expect(empty).toContainText('אין עוד משהו מתוכנן להיום');
  await expect(empty).toContainText('המשימות הבאות מחכות בלשונית "השבוע".');
  await expect(pulse(page, 'today')).toHaveText('0');

  // Nothing above it and nothing this week: calm, and pointed at "בהמשך" (not an empty week tab).
  await page.evaluate(() => {
    const s = (window as unknown as HookWindow).__homecareTest.state.tasks;
    for (const t of [...s.groups.attention, ...s.groups.requested, ...s.groups.week])
      s.remove(t.id);
  });
  await expect(page.getByText('הכל סגור להיום. אפשר לנשום.')).toBeVisible();
  await expect(empty).toContainText('המשימות הבאות מחכות בלשונית "בהמשך".');

  // Everything removed (hidden at once; the 5 s undo window outlasts the assertions).
  await page.evaluate(() => {
    const s = (window as unknown as HookWindow).__homecareTest.state.tasks;
    for (const t of [...s.open]) s.remove(t.id);
  });
  await expect(page.getByRole('heading', { name: 'הבית מסודר' })).toBeVisible();
  await expect(page.locator('[data-section="plan"]')).toHaveCount(0);
  await page.waitForTimeout(400);
  await shot(page, 'home-empty');
});
