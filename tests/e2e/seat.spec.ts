import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, openApp, shot, test } from './fixtures';

// The seat (feature "seat", the design the family picked: "מקום פנוי"). The end of every row answers
// "who does it?": the owner's avatar, or an empty seat — a dashed circle with "+" and "לקחת" — whose
// small menu "מי לוקח?" takes the task ("אני", first) or asks anyone at once ("לבקש מדני"), in the
// household's order, nobody suggested. A request that waits shows a faded ring with the asked
// member's initial and "מחכה לדני"; its menu takes it, asks someone else, or (for the one who asked)
// withdraws it. Demo seed, Sunday 2026-10-04 09:00, signed in as מיכל.

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
    ui: { current: { message: string; action?: string; onAction?: () => void } | null };
    household: { createInvite(): Promise<{ code: string } | null> };
    session: { joinHousehold(code: string, profile: object): Promise<string> };
  };
}
type HookWindow = Window & { __homecareTest: Hooks };

const section = (page: Page, name: string) => page.locator(`[data-section="${name}"]`);
const card = (scope: Page | Locator, id: string) => scope.locator(`[data-task-id="${id}"]`).first();
const seatOf = (row: Locator) => row.locator('[data-seat]');
const menu = (page: Page) => page.getByRole('menu');
/** What the menu's items say, in order (their avatars are decorative). */
const menuLabels = (page: Page) => menu(page).locator('[role="menuitem"] .label');
const taskById = (page: Page, id: string) =>
  page.evaluate((id) => {
    const t = (window as unknown as HookWindow).__homecareTest.state.tasks.byId(id);
    return t ? (JSON.parse(JSON.stringify(t)) as TaskLite) : null;
  }, id);
const snackNow = (page: Page) =>
  page.evaluate(
    () => (window as unknown as HookWindow).__homecareTest.state.ui.current?.message ?? ''
  );

/** נועה and איתי join the house (an invite from מיכל), then מיכל is back on her phone. */
async function kidsJoin(page: Page) {
  await page.evaluate(async () => {
    const h = (window as unknown as HookWindow).__homecareTest;
    const invite = await h.state.household.createInvite();
    for (const [uid, name, color, addressAs] of [
      ['noa', 'נועה', 'plum', 'f'],
      ['itai', 'איתי', 'teal', 'm']
    ] as const) {
      await h.actAs(uid);
      await h.state.session.joinHousehold(invite!.code, {
        displayName: name,
        photoURL: null,
        color,
        addressAs
      });
    }
    await h.actAs('michal');
  });
}

test('one column answers "who does it?": avatars and empty seats share it', async ({ page }) => {
  await openApp(page);
  const plan = section(page, 'plan');
  const free = seatOf(card(plan, 'seed-bulbs'));
  const owned = seatOf(card(plan, 'seed-dentist'));
  await expect(free).toHaveAttribute('data-seat', 'free');
  await expect(free).toContainText('לקחת');
  await expect(owned).toHaveAttribute('data-seat', 'owned');
  await expect(owned.getByRole('img', { name: 'אצל מיכל' })).toBeVisible();
  // The same column: their centres line up, and the seat is a full-size tap target.
  const [f, o] = [(await free.boundingBox())!, (await owned.boundingBox())!];
  expect(Math.abs(f.x + f.width / 2 - (o.x + o.width / 2))).toBeLessThan(1);
  expect(f.width).toBeGreaterThanOrEqual(44);
  expect(f.height).toBeGreaterThanOrEqual(44);
  // The old pill and hand icon are gone.
  await expect(page.getByRole('button', { name: 'לבקש מ…' })).toHaveCount(0);
  await expect(plan.getByRole('button', { name: 'אני לוקחת', exact: true })).toHaveCount(0);
});

test('the menu: me first, then the others in the house order; nobody suggested', async ({
  page
}) => {
  await openApp(page);
  await kidsJoin(page);
  const row = card(section(page, 'plan'), 'seed-bulbs');
  const seat = row.getByRole('button', { name: 'לקחת: לקנות נורות לסלון' });
  await expect(seat).toHaveAttribute('aria-expanded', 'false');
  await seat.click();
  await expect(seat).toHaveAttribute('aria-expanded', 'true');
  await expect(menu(page)).toHaveAccessibleName('מי לוקח?');
  await expect(menuLabels(page)).toHaveText(['אני', 'לבקש מדני', 'לבקש מנועה', 'לבקש מאיתי']);
  // Every item looks the same: no highlight, no badge, no "recommended".
  const looks = await menu(page)
    .getByRole('menuitem')
    .evaluateAll((items) =>
      items.map((i) => {
        const s = getComputedStyle(i);
        return `${s.backgroundColor}|${s.fontWeight}|${s.color}`;
      })
    );
  expect(new Set(looks.slice(1)).size).toBe(1);
  // In the top layer: the list's rounded surface does not clip it, and it stays on screen.
  expect(await menu(page).evaluate((el) => el.matches(':popover-open'))).toBe(true);
  const box = (await menu(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.waitForTimeout(250);
  await shot(page, 'seat-menu-family');

  await menu(page).getByRole('menuitem', { name: 'לבקש מאיתי' }).click();
  await expect.poll(() => snackNow(page)).toBe('הבקשה נשלחה לאיתי');
  expect(await taskById(page, 'seed-bulbs')).toMatchObject({
    ownerId: null,
    requestedOf: 'itai',
    requestedBy: 'michal'
  });
  // The seat now waits for him; asking someone else leaves him out of the list.
  const waiting = row.getByRole('button', { name: /^מחכה לאיתי:/ });
  await expect(waiting).toContainText('מחכה לאיתי');
  await waiting.click();
  await expect(menu(page)).toHaveAccessibleName('ביקשת מאיתי');
  await expect(menuLabels(page)).toHaveText([
    'אני לוקחת',
    'לבקש מדני',
    'לבקש מנועה',
    'ביטול הבקשה'
  ]);
  await menu(page).getByRole('menuitem', { name: 'לבקש מנועה' }).click();
  await expect.poll(async () => (await taskById(page, 'seed-bulbs'))?.requestedOf).toBe('noa');

  // נועה, on her phone, has it to answer ("ביקשו ממך"), with no seat to tap.
  await page.evaluate(() => (window as unknown as HookWindow).__homecareTest.actAs('noa'));
  const asked = card(section(page, 'requested'), 'seed-bulbs');
  await expect(asked.getByRole('button', { name: 'אני לוקחת' })).toBeVisible();
  await expect(seatOf(asked)).toHaveCount(0);
  // איתי sees a request between two others: take it, or ask someone else; no withdraw.
  await page.evaluate(() => (window as unknown as HookWindow).__homecareTest.actAs('itai'));
  await card(section(page, 'plan'), 'seed-bulbs')
    .getByRole('button', { name: /^מחכה לנועה:/ })
    .click();
  await expect(menu(page)).toHaveAccessibleName('מיכל ביקשה מנועה');
  await expect(menuLabels(page)).toHaveText(['אני לוקח', 'לבקש ממיכל', 'לבקש מדני']);
});

test('"אני": the seat turns into my avatar; the row stays where it was', async ({ page }) => {
  await openApp(page);
  await page.getByRole('radio', { name: /הכל/ }).click();
  const row = card(section(page, 'plan'), 'seed-washer');
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const before = (await row.boundingBox())!.y;
  await row.getByRole('button', { name: /^לקחת:/ }).click();
  await menu(page).getByRole('menuitem', { name: 'אני', exact: true }).click();
  await expect.poll(() => snackNow(page)).toBe('המשימה אצלך');
  const seat = seatOf(row);
  await expect(seat).toHaveAttribute('data-seat', 'owned');
  await expect(seat).toHaveClass(/arrive/);
  await expect(seat.getByRole('img', { name: 'אצל מיכל' })).toBeVisible();
  expect(Math.abs((await row.boundingBox())!.y - before)).toBeLessThan(2);
  // The arrival is a short spring, then it rests.
  await expect
    .poll(() =>
      seat
        .locator('.avatar')
        .evaluate((el) => el.getAnimations().filter((a) => a.playState === 'running').length)
    )
    .toBe(0);
});

test('a fresh request can be taken back from its snackbar; the asker can withdraw it later', async ({
  page
}) => {
  await openApp(page);
  const row = card(section(page, 'plan'), 'seed-bulbs');
  await row.getByRole('button', { name: /^לקחת:/ }).click();
  await menu(page).getByRole('menuitem', { name: 'לבקש מדני' }).click();
  const bar = page.locator('[data-snackbar-host] .snackbar');
  await expect(bar).toContainText('הבקשה נשלחה לדני');
  await bar.getByRole('button', { name: 'ביטול' }).click();
  await expect
    .poll(async () => (await taskById(page, 'seed-bulbs'))?.requestedOf ?? null)
    .toBe(null);
  await expect(seatOf(row)).toHaveAttribute('data-seat', 'free');

  // Asked again; later, from the waiting seat: "ביטול הבקשה".
  await row.getByRole('button', { name: /^לקחת:/ }).click();
  await menu(page).getByRole('menuitem', { name: 'לבקש מדני' }).click();
  await expect(seatOf(row)).toHaveAttribute('data-seat', 'waiting');
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(250);
  await shot(page, 'seat-waiting');
  await row.getByRole('button', { name: /^מחכה לדני:/ }).click();
  await menu(page).getByRole('menuitem', { name: 'ביטול הבקשה' }).click();
  await expect.poll(() => snackNow(page)).toBe('הבקשה בוטלה');
  await expect(seatOf(row)).toHaveAttribute('data-seat', 'free');
});

test('the waiting seat: anyone may still take it', async ({ page }) => {
  await openApp(page);
  // דני asked מיכל (seed-post); on his phone it waits for her answer.
  await page.evaluate(() => (window as unknown as HookWindow).__homecareTest.actAs('dani'));
  await page.getByRole('radio', { name: /השבוע/ }).click();
  const row = card(section(page, 'plan'), 'seed-post');
  await row.getByRole('button', { name: /^מחכה למיכל:/ }).click();
  await menu(page).getByRole('menuitem', { name: 'אני לוקח' }).click();
  await expect.poll(async () => (await taskById(page, 'seed-post'))?.ownerId).toBe('dani');
  await expect(seatOf(row)).toHaveAttribute('data-seat', 'owned');
});

test('closing the menu: Escape, a tap outside (it opens nothing), Tab; keyboard all the way', async ({
  page
}) => {
  await openApp(page);
  const row = card(section(page, 'plan'), 'seed-bulbs');
  const seat = row.getByRole('button', { name: /^לקחת:/ });

  // Keyboard: Enter opens with focus on "אני"; arrows move; Escape closes back to the seat.
  await seat.focus();
  await page.keyboard.press('Enter');
  const items = menu(page).getByRole('menuitem');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(seat).toBeFocused();
  await expect(page).toHaveURL(/#\/$/);

  // A tap outside closes it, and does not open the task under the finger.
  await seat.click();
  await expect(menu(page)).toBeVisible();
  const other = card(section(page, 'plan'), 'seed-dentist').locator('a.title');
  await other.click();
  await expect(menu(page)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/$/);
  // The next tap is an ordinary tap again.
  await other.click();
  await expect(page).toHaveURL(/#\/task\/seed-dentist$/);
  await page.goBack();

  // Tab leaves the menu and lets it go; Enter on "אני" takes the task.
  await seat.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(menu(page)).toHaveCount(0);
  await seat.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await taskById(page, 'seed-bulbs'))?.ownerId).toBe('michal');
  // Nothing taken by a closing gesture: the Escape and the outside tap did not act.
  expect((await taskById(page, 'seed-bulbs'))?.requestedOf ?? null).toBeNull();
});

test('reduced motion: the menu fades in place and the seat changes without the spring', async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page);
  const row = card(section(page, 'plan'), 'seed-bulbs');
  await row.getByRole('button', { name: /^לקחת:/ }).click();
  // (Svelte scopes keyframe names: "svelte-xyz-menu-fade".)
  expect(await menu(page).evaluate((el) => getComputedStyle(el).animationName)).toMatch(
    /menu-fade$/
  );
  expect(await menu(page).evaluate((el) => getComputedStyle(el).scale)).toBe('1');
  await menu(page).getByRole('menuitem', { name: 'אני', exact: true }).click();
  await expect(seatOf(row)).toHaveAttribute('data-seat', 'owned');
  expect(
    await seatOf(row)
      .locator('.avatar')
      .evaluate((el) => getComputedStyle(el).animationName)
  ).toMatch(/seat-fade$/);
  await expect(seatOf(row).locator('.ghost')).toBeHidden();
});

test('the seat and its menu pass axe, in light and dark', async ({ page }) => {
  await openApp(page);
  await card(section(page, 'plan'), 'seed-bulbs')
    .getByRole('button', { name: /^לקחת:/ })
    .click();
  await expect(menu(page)).toBeVisible();
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForTimeout(250);
    await shot(page, `seat-menu-${scheme}`);
    const axe = await new AxeBuilder({ page }).include('[data-section="plan"]').analyze();
    const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  }
});
