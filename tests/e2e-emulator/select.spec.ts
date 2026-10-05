// Choosing several tasks at once on Home (feature "seat", B1) between two members of one household,
// against the emulators (rules enforced): מיכל chooses two tasks with a long press and a tap and
// deletes them; after the 5-second undo window they are gone from Firestore and from דני's phone,
// the third stays. דני takes the free ones he chose in one go; she sees them become his. Only the
// existing writes are used (deleteTask per task, takeTask per task): no new data, no new rules.

import type { Browser, Locator, Page } from '@playwright/test';
import { expect, signIn, test } from './fixtures';

interface Profile {
  displayName: string;
  photoURL: null;
  color: string;
  addressAs: 'f' | 'm';
}
interface Hooks {
  state: {
    session: {
      phase: string;
      createHousehold(name: string, p: Profile): Promise<string>;
      joinHousehold(code: string, p: Profile): Promise<string>;
    };
    household: { createInvite(): Promise<{ code: string } | null> };
    tasks: {
      create(draft: { title: string }): string | null;
      byId(id: string): { ownerId: string | null } | null;
      open: { id: string }[];
    };
    ui: { current: { message: string } | null };
  };
}
type HookWindow = Window & { __homecareTest: Hooks };

// Unique accounts and no clearEmulators(): other emulator specs run against the same emulators.
const RUN = Date.now().toString(36);
const MOM = { uid: `sel-mom-${RUN}`, name: 'מיכל' };
const DAD = { uid: `sel-dad-${RUN}`, name: 'דני' };

test.use({ now: null });

const phaseIs = (page: Page, phase: string) =>
  page.waitForFunction(
    (p) => (window as unknown as HookWindow).__homecareTest?.state.session.phase === p,
    phase,
    { timeout: 20_000 }
  );

async function member(browser: Browser, who: { uid: string; name: string }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('./?emulator=1#/');
  await phaseIs(page, 'signed-out');
  await signIn(page, who.uid, who.name);
  await phaseIs(page, 'no-household');
  return { context, page };
}

const row = (page: Page, id: string) =>
  page.locator(`[data-section="plan"] [data-task-id="${id}"]`).first();
const openIds = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest.state.tasks.open.map((t) => t.id)
  );
const snackNow = (page: Page) =>
  page.evaluate(
    () => (window as unknown as HookWindow).__homecareTest.state.ui.current?.message ?? ''
  );

async function longPress(page: Page, target: Locator) {
  await target.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  // A smooth scroll (a pulse tap) may still be moving the list: press only once it rests.
  let box = (await target.boundingBox())!;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(50);
    const next = (await target.boundingBox())!;
    if (Math.abs(next.y - box.y) < 0.5) break;
    box = next;
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
}

test('delete several at once (one undo window), and take several at once, live on both phones', async ({
  browser
}) => {
  test.setTimeout(150_000);
  const mom = await member(browser, MOM);
  await mom.page.evaluate(
    (name) =>
      (window as unknown as HookWindow).__homecareTest.state.session.createHousehold('הבית שלנו', {
        displayName: name,
        photoURL: null,
        color: 'terracotta',
        addressAs: 'f'
      }),
    MOM.name
  );
  await phaseIs(mom.page, 'ready');
  const invite = await mom.page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest.state.household.createInvite()
  );
  const dad = await member(browser, DAD);
  await dad.page.evaluate(
    ([code, name]) =>
      (window as unknown as HookWindow).__homecareTest.state.session.joinHousehold(code!, {
        displayName: name!,
        photoURL: null,
        color: 'slate',
        addressAs: 'm'
      }),
    [invite!.code, DAD.name]
  );
  await phaseIs(dad.page, 'ready');

  const ids = (await mom.page.evaluate(() => {
    const t = (window as unknown as HookWindow).__homecareTest.state.tasks;
    return ['לסדר את המחסן', 'לתקן את הברז', 'לקנות סוללות', 'לשלם חשבון חשמל', 'לנקות מזגן'].map(
      (title) => t.create({ title })
    );
  })) as string[];
  const [shed, tap, batteries, bill, ac] = ids as [string, string, string, string, string];
  // Undated and free: "מחכות שמישהו ייקח" lists them ("הכל" + "פנויות").
  for (const p of [mom.page, dad.page]) {
    await expect(p.locator('[data-pulse="waiting"]')).toHaveText('5', { timeout: 10_000 });
    await p.locator('[data-pulse="waiting"]').click();
  }

  // ── מיכל: a long press on one, a tap on another, "מחיקה (2)" ──
  await longPress(mom.page, row(mom.page, shed).locator('a.title'));
  await expect(mom.page.locator('[data-select-count]')).toHaveText('נבחרה משימה אחת');
  await expect(row(mom.page, shed).locator('[data-pick]')).toHaveAttribute('aria-checked', 'true');
  await row(mom.page, tap).locator('article').click();
  await expect(mom.page.locator('[data-select-count]')).toHaveText('נבחרו 2');
  await mom.page.getByRole('button', { name: 'מחיקה (2)' }).click();
  await expect.poll(() => snackNow(mom.page)).toBe('נמחקו 2 משימות');
  // Gone from her Home at once; on his phone they stay until the undo window passes…
  await expect(row(mom.page, shed)).toHaveCount(0);
  expect(await openIds(dad.page)).toEqual(expect.arrayContaining([shed, tap]));
  // …then both leave his list too; the others stay.
  await expect
    .poll(async () => (await openIds(dad.page)).filter((id) => id === shed || id === tap), {
      timeout: 12_000
    })
    .toEqual([]);
  expect(await openIds(dad.page)).toEqual(expect.arrayContaining([batteries, bill, ac]));

  // ── דני: "בחירה", two of the free ones, "אני לוקח (2)" ──
  await dad.page.getByRole('button', { name: 'בחירה', exact: true }).click();
  await row(dad.page, batteries).locator('article').click();
  await row(dad.page, bill).locator('article').click();
  await dad.page.getByRole('button', { name: 'אני לוקח (2)' }).click();
  await expect.poll(() => snackNow(dad.page), { timeout: 5_000 }).toBe('2 משימות אצלך');
  // She sees them leave "פנויות" within 2 s; the air conditioner still waits for someone.
  await expect(row(mom.page, batteries)).toHaveCount(0, { timeout: 2_000 });
  await expect(row(mom.page, bill)).toHaveCount(0, { timeout: 2_000 });
  await expect(row(mom.page, ac)).toBeVisible();
  expect(
    await mom.page.evaluate(
      (id) => (window as unknown as HookWindow).__homecareTest.state.tasks.byId(id)?.ownerId,
      batteries
    )
  ).toBe(DAD.uid);

  await mom.context.close();
  await dad.context.close();
});
