// Deleting the jar and earned treats against the emulators (rules enforced), two members live:
// מיכל and דני earn a treat; דני deletes the jar from its edit sheet, and מיכל's phone shows "no
// jar" once the undo window is over; מיכל starts a new one (jar 2: a round is never used twice);
// מיכל deletes the earned treat from the history and it leaves דני's list too.
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
      setJar(j: { treat: string; mode: 'each'; share: number }): void;
      household: { jar: { round: number } | null; nextJarRound?: number } | null;
    };
    tasks: {
      create(draft: { title: string }): string | null;
      complete(
        id: string,
        c: { note: string; cost: number | null; place: string; contact: string }
      ): Promise<{ jarFilled: boolean } | null>;
    };
  };
}
type HookWindow = Window & { __homecareTest: Hooks };

const RUN = Date.now().toString(36);
const MOM = { uid: `jardel-mom-${RUN}`, name: 'מיכל' };
const DAD = { uid: `jardel-dad-${RUN}`, name: 'דני' };

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

/** Creates a task and completes it as whoever is signed in on `page`. */
const closeOne = (page: Page, title: string) =>
  page.evaluate(async (t) => {
    const s = (window as unknown as HookWindow).__homecareTest.state.tasks;
    const id = s.create({ title: t })!;
    for (let i = 0; i < 100 && !(s as unknown as { byId(x: string): unknown }).byId(id); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    await s.complete(id, { note: '', cost: null, place: '', contact: '' });
  }, title);

const stored = (page: Page) =>
  page.evaluate(() => {
    const h = (window as unknown as HookWindow).__homecareTest.state.household.household;
    return { round: h?.jar?.round ?? null, nextJarRound: h?.nextJarRound ?? null };
  });

test('delete the jar and an earned treat, live between two phones, with the rules enforced', async ({
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

  // Jar 1, one each: both close one, מיכל redeems: "גלידה" is earned (treats/1); jar 2 starts.
  await mom.page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest.state.household.setJar({
      treat: 'גלידה',
      mode: 'each',
      share: 1
    })
  );
  await mom.page.evaluate(() => (location.hash = '#/jar'));
  await expect(mom.page.locator('[data-jar-count]')).toHaveText('0 מתוך 2', { timeout: 10_000 });
  await closeOne(mom.page, 'לקנות חלב');
  await closeOne(dad.page, 'לזרוק את הזבל');
  await expect(mom.page.locator('[data-celebration]')).toBeVisible({ timeout: 10_000 });
  await mom.page.getByRole('button', { name: 'איזה כיף' }).click();
  await mom.page.getByRole('button', { name: 'מימשנו! צנצנת חדשה' }).click();
  await mom.page.keyboard.press('Escape');
  await expect(mom.page.locator('[data-treat="1"]')).toContainText('גלידה', { timeout: 10_000 });
  await expect
    .poll(() => stored(mom.page), { timeout: 10_000 })
    .toEqual({
      round: 2,
      nextJarRound: null
    });

  // דני deletes the jar from its edit sheet.
  await dad.page.evaluate(() => (location.hash = '#/jar'));
  await expect(dad.page.locator('[data-jar-count]')).toHaveText('0 מתוך 2', { timeout: 10_000 });
  await dad.page.getByRole('button', { name: 'עריכת הצנצנת' }).click();
  await dad.page.getByRole('button', { name: 'מחיקת הצנצנת' }).click();
  await dad.page.getByRole('alertdialog').getByRole('button', { name: 'מחיקה' }).click();
  await expect(dad.page.locator('[data-jar="none"]')).toBeVisible();
  // After the undo window it reaches the server; מיכל's phone shows "no jar", history intact.
  await expect(mom.page.locator('[data-jar="none"]')).toBeVisible({ timeout: 15_000 });
  await expect(mom.page.locator('[data-treat="1"]')).toContainText('גלידה');
  expect(await stored(mom.page)).toEqual({ round: null, nextJarRound: 3 });

  // מיכל starts a new jar: jar 3, from zero, live on דני's phone.
  await mom.page.getByRole('button', { name: 'להגדיר צנצנת' }).click();
  const sheet = mom.page.locator('[data-sheet-content="jarSetup"]');
  await sheet.getByRole('button', { name: 'ערב סרט' }).click();
  await sheet.getByRole('button', { name: 'להתחיל צנצנת' }).click();
  await expect(mom.page.locator('[data-jar-count]')).toHaveText('0 מתוך 10', { timeout: 10_000 });
  await expect(dad.page.locator('[data-jar-count]')).toHaveText('0 מתוך 10', { timeout: 10_000 });
  await expect
    .poll(() => stored(dad.page), { timeout: 10_000 })
    .toEqual({
      round: 3,
      nextJarRound: 3
    });

  // מיכל deletes the earned treat; it leaves דני's history once the undo window is over.
  await mom.page.getByRole('button', { name: 'אפשרויות ל״גלידה״' }).click();
  await mom.page.getByRole('menuitem', { name: 'מחיקה מההיסטוריה' }).click();
  await mom.page.getByRole('alertdialog').getByRole('button', { name: 'מחיקה' }).click();
  await expect(mom.page.locator('[data-treat]')).toHaveCount(0);
  await expect(dad.page.locator('[data-treat]')).toHaveCount(0, { timeout: 15_000 });
  await expect(dad.page.getByRole('heading', { name: /צ׳ופרים שהרווחנו/ })).toHaveCount(0);

  await mom.context.close();
  await dad.context.close();
});
