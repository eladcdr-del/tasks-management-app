// Requests between two members, against the emulators (rules enforced): מיכל asks דני from the
// RequestSheet; until he answers, the task waits for someone to take it on her side (with her quiet
// line) and is "ביקשו ממך" on his. He accepts one (it becomes his; she sees "לבקשתך") and declines
// another (it waits for anyone again). Both answers are written as events with a pending push.
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
    household: { createInvite(): Promise<{ code: string } | null> };
    tasks: {
      create(draft: { title: string }): string | null;
      recentEvents: {
        type: string;
        taskId: string | null;
        targetId: string | null;
        push: string;
      }[];
    };
  };
}
type HookWindow = Window & { __homecareTest: Hooks };

// Unique accounts and no clearEmulators(): other emulator specs run against the same emulators.
const RUN = Date.now().toString(36);
const MOM = { uid: `rq-mom-${RUN}`, name: 'מיכל' };
const DAD = { uid: `rq-dad-${RUN}`, name: 'דני' };

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

const inSection = (page: Page, section: string, id: string) =>
  page.locator(`[data-section="${section}"] [data-task-id="${id}"]`);

/** Asks דני from the row's seat: the request goes out from its menu at once. */
async function ask(page: Page, id: string) {
  await inSection(page, 'plan', id)
    .getByRole('button', { name: /^לקחת:/ })
    .click();
  await page.getByRole('menu').getByRole('menuitem', { name: 'לבקש מדני' }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
}

const answerEvents = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest.state.tasks.recentEvents
      .filter((e) => e.type === 'accepted' || e.type === 'declined')
      .map((e) => ({ type: e.type, taskId: e.taskId, targetId: e.targetId, push: e.push }))
  );

test('a request waits for the answer; accept and decline reach the other member live', async ({
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

  const create = (title: string) =>
    mom.page.evaluate(
      (t) => (window as unknown as HookWindow).__homecareTest.state.tasks.create({ title: t }),
      title
    );
  const parcel = (await create('לאסוף חבילה מהדואר'))!;
  const gift = (await create('לקנות מתנה לנועה'))!;
  // Undated and free: "מחכות שמישהו ייקח" lists them ("הכל" + "פנויות").
  await expect(mom.page.locator('[data-pulse="waiting"]')).toHaveText('2', { timeout: 10_000 });
  await mom.page.locator('[data-pulse="waiting"]').click();
  await expect(inSection(mom.page, 'plan', gift)).toBeVisible({ timeout: 10_000 });

  // ── מיכל asks דני twice ──
  await ask(mom.page, parcel);
  await ask(mom.page, gift);
  // On her side they still wait for someone to take them, with her quiet line.
  for (const id of [parcel, gift]) {
    const card = inSection(mom.page, 'plan', id);
    await expect(card.locator('[data-request]')).toHaveText('ביקשת מדני');
    await expect(card.getByRole('button', { name: /^מחכה לדני:/ })).toBeVisible();
    await expect(card).toHaveAttribute('data-owner', '');
  }
  // On his: "ביקשו ממך", with his answers.
  const asked = (id: string) => inSection(dad.page, 'requested', id);
  await expect(asked(parcel)).toBeVisible({ timeout: 5_000 });
  await expect(asked(gift).locator('[data-request]')).toHaveText('מיכל ביקשה ממך');
  await expect(dad.page.locator('[data-pulse="requested"]')).toHaveText('2');

  // ── דני says yes to the parcel: it is his; she sees it live, "at her request" ──
  await asked(parcel).getByRole('button', { name: 'אני לוקח' }).click();
  await expect(asked(parcel)).toHaveCount(0);
  await expect(inSection(mom.page, 'plan', parcel)).toHaveCount(0, { timeout: 2_000 });
  await mom.page.getByRole('group', { name: 'של מי' }).getByRole('button', { name: 'הכל' }).click();
  await mom.page.getByRole('radio', { name: /בהמשך/ }).click();
  const hers = inSection(mom.page, 'plan', parcel);
  await expect(hers).toHaveAttribute('data-owner', DAD.uid);
  await expect(hers.locator('[data-request]')).toHaveText('לבקשתך');

  // ── …and a gentle no to the gift: it waits for anyone again ──
  await asked(gift).getByRole('button', { name: 'לא מתאים לי' }).click();
  await expect(dad.page.locator('[data-section="requested"]')).toHaveCount(0);
  await mom.page
    .getByRole('group', { name: 'של מי' })
    .getByRole('button', { name: 'פנויות' })
    .click();
  const back = inSection(mom.page, 'plan', gift);
  await expect(back.locator('[data-request]')).toHaveCount(0, { timeout: 2_000 });
  await expect(back.getByRole('button', { name: /^לקחת:/ })).toBeVisible();

  // Both answers are stored for the notifier (a push to her, the asker).
  await expect
    .poll(() => answerEvents(mom.page), { timeout: 5_000 })
    .toEqual(
      expect.arrayContaining([
        { type: 'accepted', taskId: parcel, targetId: MOM.uid, push: 'pending' },
        { type: 'declined', taskId: gift, targetId: MOM.uid, push: 'pending' }
      ])
    );

  await mom.context.close();
  await dad.context.close();
});
