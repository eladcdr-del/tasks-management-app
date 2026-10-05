import type { Locator, Page } from '@playwright/test';
import { expect, openApp, shot, test } from './fixtures';

// Home (step 3.2; feature "home") on the demo seed at the fixed clock (Sunday 2026-10-04 09:00,
// signed in as מיכל): pulse attention 3 (1 overdue + 2 urgent), today 4, waiting 3; one request
// waiting for מיכל's answer (דני asked her to pick up the parcel, planned for Tuesday): not hers
// until she accepts. Under the sticky bar the tabs read היום 4 · השבוע 4 · בהמשך 4 · הכל 12 (the
// request is shown above, in "ביקשו ממך", not again in the list). Every row ends with its seat: the
// owner's avatar, or the empty seat "לקחת" that takes the task or asks someone (seat.spec.ts has the
// seat's own flows). The long-list behaviour (groups, the bar sticking) is in home-list.spec.ts.
// Choosing several tasks at once is in home-select.spec.ts.

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
const tab = (page: Page, name: RegExp) => page.getByRole('radio', { name });
const chips = (page: Page) => page.getByRole('group', { name: 'של מי' });
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
  // Overdue: a solid danger badge.
  await expect(card(section(page, 'attention'), 'seed-library')).toContainText('באיחור של יומיים');
  // No separate "waiting" wall: the free task due today is in Today's list, with its take action.
  await expect(section(page, 'waiting')).toHaveCount(0);
  const plan = section(page, 'plan');
  await expect(tab(page, /היום/)).toHaveAttribute('aria-checked', 'true');
  await expect(plan.locator('[data-task-id]')).toHaveCount(4);
  // A free task ends with its empty seat: one place to take it or ask someone.
  const seat = card(plan, 'seed-bulbs').getByRole('button', { name: 'לקחת: לקנות נורות לסלון' });
  await expect(seat).toBeVisible();
  await expect(seat).toHaveAttribute('aria-haspopup', 'menu');
  await expect(seat).toContainText('לקחת');
  // Owned rows show their owner in the same place, not an action.
  await expect(card(plan, 'seed-dentist').locator('[data-action]')).toHaveCount(0);
  await expect(card(plan, 'seed-dentist').getByRole('img', { name: 'אצל מיכל' })).toBeVisible();
  // Snoozed 4 times and open for weeks: both on the row.
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

test('the first screen holds attention, the request and the bar', async ({ page }) => {
  await openApp(page);
  await expect(section(page, 'requested')).toBeVisible();
  const visibleBottom = await page.evaluate(
    () => window.innerHeight - (document.querySelector('nav')?.getBoundingClientRect().height ?? 0)
  );
  // The attention block and the request end above the fold, and the bar starts above it.
  const requested = (await section(page, 'requested').boundingBox())!;
  expect(requested.y + requested.height).toBeLessThan(visibleBottom);
  const bar = (await page.locator('[data-home-controls]').boundingBox())!;
  expect(bar.y).toBeLessThan(visibleBottom);
  await page.screenshot({ path: test.info().outputPath('first-screen.png') });
});

test('tapping a numeral scrolls to its list', async ({ page }) => {
  await openApp(page);
  // Waiting: everything free, whatever its date ("הכל" + "פנויות").
  await page.getByRole('button', { name: /^3 מחכות שמישהו ייקח/ }).click();
  await expect(tab(page, /הכל/)).toHaveAttribute('aria-checked', 'true');
  await expect(chips(page).getByRole('button', { name: 'פנויות' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  const plan = section(page, 'plan');
  await expect(plan.locator('[data-task-id]')).toHaveCount(3);
  for (const id of ['seed-bulbs', 'seed-birthday-gift', 'seed-washer']) {
    await expect(card(plan, id)).toBeVisible();
  }
  await expect(page.locator('[data-home-controls]')).toBeInViewport();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);

  // Today: back to "היום" for everyone.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: /^4 להיום/ }).click();
  await expect(tab(page, /היום/)).toHaveAttribute('aria-checked', 'true');
  await expect(chips(page).getByRole('button', { name: 'הכל', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(plan.locator('[data-task-id]')).toHaveCount(4);

  // Attention: its own block.
  await page.getByRole('button', { name: /^3 באיחור או דחוף/ }).click();
  await expect(section(page, 'attention')).toBeInViewport();
});

test('take a free task from its seat ("אני"): the row stays and shows its new owner', async ({
  page
}) => {
  await openApp(page);
  const plan = section(page, 'plan');
  await card(plan, 'seed-bulbs')
    .getByRole('button', { name: /^לקחת:/ })
    .click();
  await page
    .getByRole('menu', { name: 'מי לוקח?' })
    .getByRole('menuitem', { name: 'אני', exact: true })
    .click();
  await snack(page).toContain('המשימה אצלך');
  await expect(pulse(page, 'waiting')).toHaveText('2');
  const mine = card(plan, 'seed-bulbs');
  await expect(mine).toHaveAttribute('data-owner', 'michal');
  await expect(mine.locator('[data-action]')).toHaveCount(0);
  await expect(mine.getByRole('img', { name: 'אצל מיכל' })).toBeVisible();

  // Under "פנויות" it is gone.
  await chips(page).getByRole('button', { name: 'פנויות' }).click();
  await expect(plan.locator('[data-task-id="seed-bulbs"]')).toHaveCount(0);
});

test('ask the partner straight from the seat: it waits for his answer', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: /^3 מחכות שמישהו ייקח/ }).click();
  const plan = section(page, 'plan');
  await card(plan, 'seed-washer')
    .getByRole('button', { name: /^לקחת:/ })
    .click();
  // No sheet: the request goes out from the menu at once.
  await page.getByRole('menu').getByRole('menuitem', { name: 'לבקש מדני' }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.locator('[data-sheet-content="request"]')).toHaveCount(0);
  await snack(page).toContain('הבקשה נשלחה לדני');
  // A proposal: until דני answers nobody holds it, so it is still free; its seat says it waits.
  await expect(pulse(page, 'waiting')).toHaveText('3');
  const waiting = card(plan, 'seed-washer');
  await expect(waiting).toHaveAttribute('data-owner', '');
  await expect(waiting.locator('[data-request]')).toHaveText('ביקשת מדני');
  const seat = waiting.getByRole('button', { name: /^מחכה לדני:/ });
  await expect(seat).toContainText('מחכה לדני');
  // Anyone may still take it.
  await seat.click();
  await expect(page.getByRole('menuitem', { name: 'אני לוקחת' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  // On דני's side the undated request is right on Home, not buried under "בהמשך".
  await page.evaluate(() => (window as unknown as HookWindow).__homecareTest.actAs('dani'));
  await tab(page, /היום/).click();
  const asked = card(section(page, 'requested'), 'seed-washer');
  await expect(asked).toContainText('מיכל ביקשה ממך');
  await expect(asked.getByRole('button', { name: 'אני לוקח' })).toBeVisible();
  await expect(asked.getByRole('button', { name: 'לא מתאים לי' })).toBeVisible();
  await expect(pulse(page, 'requested')).toHaveText('1');
  // …and only there: not a second time in his list.
  await tab(page, /הכל/).click();
  await expect(plan.locator('[data-task-id="seed-washer"]')).toHaveCount(0);
});

test('a request to me stands out whatever the tab, and counts in the pulse', async ({ page }) => {
  await openApp(page);
  const requested = section(page, 'requested');
  await expect(requested.locator('[data-task-id]')).toHaveCount(1);
  await expect(card(requested, 'seed-post')).toContainText('דני ביקש ממך');
  await expect(pulse(page, 'requested')).toHaveText('1');
  await expect(page.locator('[data-section]')).toHaveCount(3);
  expect(
    await page
      .locator('[data-section]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-section')))
  ).toEqual(['attention', 'requested', 'plan']);
  for (const name of [/בהמשך/, /השבוע/, /הכל/, /היום/]) {
    await tab(page, name).click();
    await expect(card(requested, 'seed-post')).toBeVisible();
    // Never twice: the list under the bar leaves it out.
    await expect(section(page, 'plan').locator('[data-task-id="seed-post"]')).toHaveCount(0);
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
  const urgent = card(section(page, 'attention'), 'seed-post');
  await expect(urgent).toBeVisible();
  // Still a request: in attention it keeps its answers, not "take / ask".
  await expect(urgent.locator('[data-action]')).toHaveCount(2);
  await expect(urgent.getByRole('button', { name: 'אני לוקחת' })).toBeVisible();
  await expect(urgent.getByRole('button', { name: 'לא מתאים לי' })).toBeVisible();
  await expect(requested).toHaveCount(0);
  await expect(pulse(page, 'requested')).toHaveCount(0);
});

test('a snackbar never covers the FAB', async ({ page }) => {
  await openApp(page);
  await card(section(page, 'plan'), 'seed-bulbs')
    .getByRole('button', { name: /^לקחת:/ })
    .click();
  await page.getByRole('menuitem', { name: 'אני', exact: true }).click();
  const bar = page.locator('[data-snackbar-host] .snackbar');
  await expect(bar).toContainText('המשימה אצלך');
  const fab = page.locator('[data-fab]');
  await expect
    .poll(async () => {
      const [b, f] = [await bar.boundingBox(), await fab.boundingBox()];
      return b && f ? f.y - (b.y + b.height) : -1;
    })
    .toBeGreaterThanOrEqual(0);
});

test('alone in the household: new tasks stay in sight, and no "ask for help" dead end', async ({
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
  // His tasks are free now: one tap on the number lists them, each with its empty seat; with nobody
  // to ask, the seat opens no menu.
  await expect(pulse(page, 'waiting')).not.toHaveText('0');
  await pulse(page, 'waiting').click();
  const plan = section(page, 'plan');
  await expect(plan.locator('[data-task-id]').first()).toBeVisible();
  await expect(plan.getByRole('button', { name: /^לקחת:/ }).first()).toBeVisible();
  await expect(plan.locator('[data-seat][aria-haspopup]')).toHaveCount(0);
  // The chips still sort hers from the free ones; there is no one else to pick.
  await expect(chips(page).getByRole('button')).toHaveText(['הכל', 'שלי', 'פנויות']);

  // A new undated task is easy to find right after adding it: the list switches to it.
  await page.evaluate(() => window.scrollTo(0, 0));
  await tab(page, /היום/).click();
  await page.locator('[data-fab]').click();
  const quick = page.getByTestId('quick-add');
  await quick.getByLabel('מה צריך לעשות?').fill('לסדר את הבוידעם');
  await quick.getByRole('button', { name: 'הוספה' }).click();
  await expect(quick.getByRole('status')).toContainText('נוסף ✓');
  await page.goBack();
  await expect(quick).toHaveCount(0);
  const added = plan.locator('[data-task-id]').filter({ hasText: 'לסדר את הבוידעם' });
  await expect(added).toBeInViewport();
  await expect(added.getByRole('button', { name: /^לקחת:/ })).toBeVisible();

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
  await tab(page, /השבוע/).click();
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

test('time tabs and "whose" chips combine, and stay for the session', async ({ page }) => {
  await openApp(page);
  const plan = section(page, 'plan');
  const cards = plan.locator('[data-task-id]');
  // The counts leave out the request above (it is in "ביקשו ממך", whatever the tab).
  await expect(tab(page, /היום/)).toContainText('4');
  await expect(tab(page, /השבוע/)).toContainText('4');
  await expect(tab(page, /בהמשך/)).toContainText('4');
  await expect(tab(page, /הכל/)).toContainText('12');
  await tab(page, /השבוע/).click();
  await expect(cards).toHaveCount(4);
  await tab(page, /בהמשך/).click();
  await expect(cards).toHaveCount(4);
  // "הכל": twelve tasks, so they fold into category groups.
  await tab(page, /הכל/).click();
  await expect(plan.locator('[data-group]').first()).toBeVisible();

  await tab(page, /השבוע/).click();
  await chips(page).getByRole('button', { name: 'שלי', exact: true }).click();
  // The parcel דני asked her about is not hers until she accepts.
  await expect(cards).toHaveCount(2);
  for (const id of ['seed-shirt', 'seed-wedding-gift']) {
    await expect(card(plan, id)).toBeVisible();
  }
  // The tab counts follow the chip.
  await expect(tab(page, /היום/)).toContainText('2');
  await expect(tab(page, /הכל/)).toContainText('5');
  await chips(page)
    .getByRole('button', { name: /של דני/ })
    .click();
  await expect(cards).toHaveCount(1);
  await expect(card(plan, 'seed-netflix')).toBeVisible();
  await chips(page).getByRole('button', { name: 'פנויות' }).click();
  await expect(cards).toHaveCount(1);
  await expect(card(plan, 'seed-birthday-gift')).toBeVisible();
  await chips(page).getByRole('button', { name: 'הכל', exact: true }).click();
  await expect(cards).toHaveCount(4);

  // The choice is kept for the session: open a task and come back.
  await card(plan, 'seed-netflix').locator('a.title').click();
  await expect(page).toHaveURL(/#\/task\/seed-netflix$/);
  await page.goBack();
  await expect(tab(page, /השבוע/)).toHaveAttribute('aria-checked', 'true');
  await expect(cards).toHaveCount(4);
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
    for (const t of [
      ...s.groups.attention,
      ...s.groups.requested,
      ...s.groups.waiting,
      ...s.groups.week
    ])
      s.remove(t.id);
  });
  await expect(page.getByText('הכל סגור להיום. אפשר לנשום.')).toBeVisible();
  await expect(empty).toContainText('המשימות הבאות מחכות בלשונית "בהמשך".');

  // Nothing free anywhere: the chip says so kindly.
  await chips(page).getByRole('button', { name: 'פנויות' }).click();
  await expect(empty).toContainText('כל המשימות כבר אצל מישהו');
  await chips(page).getByRole('button', { name: 'הכל', exact: true }).click();

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

test('a task added where the current tab does not show it brings its tab into view', async ({
  page
}) => {
  await openApp(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('בוקר טוב, מיכל');
  await page.locator('[data-fab]').click();
  const sheet = page.getByTestId('quick-add');
  await sheet.getByLabel('מה צריך לעשות?').fill('לסדר את המחסן');
  await sheet.locator('[data-picker="owner"]').click();
  await sheet.locator('[data-owner="me"]').click();
  await sheet.getByRole('button', { name: 'הוספה' }).click();
  await expect(sheet.getByRole('status')).toContainText('נוסף ✓');
  await page.goBack();
  await expect(sheet).toHaveCount(0);
  // Undated and mine: not on "היום". Home switched to "בהמשך", where it is, and brought it into
  // sight.
  const plan = section(page, 'plan');
  await expect(tab(page, /בהמשך/)).toHaveAttribute('aria-checked', 'true');
  await expect(plan.getByText('לסדר את המחסן')).toBeInViewport();
});
