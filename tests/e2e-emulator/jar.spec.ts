// The jar as a team goal against the emulators (rules enforced), two members live: מיכל sets up
// "כל אחד תורם" (2 each) in the sheet; her completions fill her part (the third is a bonus), דני
// sees it live; an undo takes back exactly one; the jar fills only when דני has done his part too,
// with a pending jar_filled push; both celebrate; redeeming records who took part and starts over.
//
//   flock /tmp/homecare-emu.lock flock /tmp/homecare-e2e.lock npm run test:e2e:emu

import type { Browser, Page } from '@playwright/test';
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
    household: {
      createInvite(): Promise<{ code: string } | null>;
      jar: { count: number; counts?: Record<string, number> } | null;
    };
    tasks: {
      create(draft: { title: string }): string | null;
      complete(
        id: string,
        c: { note: string; cost: number | null; place: string; contact: string }
      ): Promise<{ jarFilled: boolean } | null>;
      reopen(id: string): void;
      recentEvents: { type: string; push: string; actorId: string }[];
    };
  };
}
type HookWindow = Window & { __homecareTest: Hooks };

// Unique accounts and no clearEmulators(): other emulator specs run against the same emulators.
const RUN = Date.now().toString(36);
const MOM = { uid: `jar-mom-${RUN}`, name: 'מיכל' };
const DAD = { uid: `jar-dad-${RUN}`, name: 'דני' };

test.use({ now: null });

const phaseIs = (page: Page, phase: string) =>
  page.waitForFunction(
    (p) => (window as unknown as HookWindow).__homecareTest?.state.session.phase === p,
    phase,
    { timeout: 20_000 }
  );

async function member(browser: Browser, who: { uid: string; name: string }) {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('./?emulator=1#/');
  await phaseIs(page, 'signed-out');
  await signIn(page, who.uid, who.name);
  await phaseIs(page, 'no-household');
  return { context, page };
}

/** Creates a task and completes it as whoever is signed in on `page`; returns its id. */
const closeOne = (page: Page, title: string) =>
  page.evaluate(async (t) => {
    const s = (window as unknown as HookWindow).__homecareTest.state.tasks;
    const id = s.create({ title: t })!;
    for (let i = 0; i < 100 && !(s as unknown as { byId(x: string): unknown }).byId(id); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const r = await s.complete(id, { note: '', cost: null, place: '', contact: '' });
    return { id, jarFilled: r?.jarFilled ?? null };
  }, title);

const part = (page: Page, uid: string) => page.locator(`[data-part="${uid}"]`);

test('everyone does their part, live between two phones, with the rules enforced', async ({
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

  // מיכל sets up the jar in the sheet: "כל אחד תורם" is the default; 2 each.
  await mom.page.evaluate(() => (location.hash = '#/jar'));
  await mom.page.getByRole('button', { name: 'להגדיר צנצנת' }).click();
  const sheet = mom.page.locator('[data-sheet-content="jarSetup"]');
  await sheet.getByRole('button', { name: 'גלידה' }).click();
  await expect(sheet.locator('[data-mode="each"] input')).toBeChecked();
  for (let i = 0; i < 3; i++) await sheet.getByRole('button', { name: 'הפחתה' }).click();
  await expect(sheet.locator('[data-share-total]')).toHaveText('ביחד: 4 משימות בצנצנת');
  await sheet.getByRole('button', { name: 'להתחיל צנצנת' }).click();
  await expect(mom.page.locator('[data-jar-goal]')).toHaveText('כל אחד מאיתנו סוגר 2 משימות');
  await expect(mom.page.locator('[data-jar-count]')).toHaveText('0 מתוך 4', { timeout: 10_000 });

  await dad.page.evaluate(() => (location.hash = '#/jar'));
  await expect(dad.page.locator('[data-jar-count]')).toHaveText('0 מתוך 4', { timeout: 10_000 });

  // מיכל closes three: two fill her part, the third is a shared bonus.
  for (const t of ['לקנות חלב', 'להשקות עציצים', 'לתלות כביסה']) {
    expect((await closeOne(mom.page, t)).jarFilled).toBe(false);
  }
  await expect(part(dad.page, MOM.uid)).toHaveAttribute('data-complete', 'true', {
    timeout: 10_000
  });
  await expect(dad.page.locator('[data-jar-count]')).toHaveText('2 מתוך 4');
  await expect(dad.page.locator('[data-jar-bonus]')).toHaveText('ועוד משימה אחת בונוס');
  await expect(dad.page.locator('[data-jar-left]')).toHaveText('עוד 2 משימות שלך ואנחנו בצ׳ופר');

  // דני closes one and undoes it: exactly one comes back out.
  const oops = await closeOne(dad.page, 'לזרוק את הזבל');
  await expect(part(mom.page, DAD.uid)).toContainText('1 מתוך 2', { timeout: 10_000 });
  await dad.page.evaluate(
    (id) => (window as unknown as HookWindow).__homecareTest.state.tasks.reopen(id),
    oops.id
  );
  await expect(part(mom.page, DAD.uid)).toContainText('0 מתוך 2', { timeout: 10_000 });

  // His part: the second one fills the jar.
  expect((await closeOne(dad.page, 'לנקות את המרפסת')).jarFilled).toBe(false);
  expect((await closeOne(dad.page, 'לקנות נורות')).jarFilled).toBe(true);
  await expect(dad.page.locator('[data-celebration]')).toBeVisible({ timeout: 10_000 });
  await expect(mom.page.locator('[data-celebration]')).toBeVisible({ timeout: 10_000 });
  const filled = await dad.page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest.state.tasks.recentEvents
      .filter((e) => e.type === 'jar_filled')
      .map((e) => ({ push: e.push, actorId: e.actorId }))
  );
  expect(filled).toEqual([{ push: 'pending', actorId: DAD.uid }]);

  // מיכל redeems: the treat records who took part; the next round starts from zero.
  await mom.page.getByRole('button', { name: 'איזה כיף' }).click();
  await mom.page.getByRole('button', { name: 'מימשנו! צנצנת חדשה' }).click();
  await expect(mom.page.locator('[data-sheet-content="jarSetup"]')).toBeVisible();
  await mom.page.keyboard.press('Escape');
  await expect(mom.page.locator('[data-jar-count]')).toHaveText('0 מתוך 4', { timeout: 10_000 });
  const treat = mom.page.locator('[data-treat="1"]');
  await expect(treat).toContainText('גלידה');
  await expect(treat.getByRole('img', { name: 'השתתפו: מיכל, דני' })).toBeVisible();
  await expect(dad.page.locator('[data-jar-count]')).toHaveText('0 מתוך 4', { timeout: 10_000 });

  await mom.context.close();
  await dad.context.close();
});
