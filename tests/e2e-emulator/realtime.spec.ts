// owner: step 3.2 — realtime between two members of one household, against the emulators (rules
// enforced): one takes a waiting task on Home, the other sees it move within 2 s; a second take of
// the same task gets TakeResult { ok: false } and the snackbar names who was faster.
//
//   flock /tmp/homecare-emu.lock flock /tmp/homecare-e2e.lock env E2E_PORT=4202 \
//     npx firebase emulators:exec --only auth,firestore --project demo-homecare \
//     "npx playwright test --project=emulator tests/e2e-emulator/realtime.spec.ts"

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
    household: { createInvite(): Promise<{ code: string } | null>; members: unknown[] };
    tasks: {
      create(draft: { title: string }): string | null;
      byId(id: string): { ownerId: string | null; pending?: boolean } | null;
    };
    ui: { current: { message: string } | null };
  };
}
type HookWindow = Window & {
  __homecareTest: Hooks;
  __homecareTaskActions: { takeTask(id: string): Promise<unknown> };
};

// Unique accounts and no clearEmulators(): other emulator specs run in parallel workers against the
// same emulators, and wiping them mid-run would break those specs.
const RUN = Date.now().toString(36);
const MOM = { uid: `rt-mom-${RUN}`, name: 'מיכל' };
const DAD = { uid: `rt-dad-${RUN}`, name: 'דני' };
const TITLE = 'לקנות נורות לסלון';

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

test('one takes a waiting task, the other sees it within 2 s; a late take names the taker', async ({
  browser
}) => {
  test.setTimeout(120_000);
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
  expect(invite?.code).toBeTruthy();

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

  // Dad adds an unowned task; it reaches mom's Home as "waiting".
  const id = await dad.page.evaluate(
    (title) => (window as unknown as HookWindow).__homecareTest.state.tasks.create({ title }),
    TITLE
  );
  expect(id).toBeTruthy();
  const momCard = mom.page.locator(`[data-section="waiting"] [data-task-id="${id}"]`);
  await expect(momCard).toBeVisible({ timeout: 10_000 });
  const dadWaiting = dad.page.locator(`[data-section="waiting"] [data-task-id="${id}"]`);
  await expect(dadWaiting).toBeVisible();

  // Mom takes it with one tap; dad sees it leave "waiting" and land with mom as owner within 2 s.
  await momCard.getByRole('button', { name: 'אני לוקחת' }).click();
  await expect(dadWaiting).toHaveCount(0, { timeout: 2_000 });
  // Undated, so on dad's Home it now sits in "בהמשך", owned by mom.
  await dad.page.getByRole('radio', { name: /בהמשך/ }).click();
  await expect(dad.page.locator(`[data-section="plan"] [data-task-id="${id}"]`)).toHaveAttribute(
    'data-owner',
    MOM.uid
  );

  // A second, late take (a stale tap) gets { ok: false, takenBy } and says who was faster.
  const result = await dad.page.evaluate(
    (taskId) => (window as unknown as HookWindow).__homecareTaskActions.takeTask(taskId),
    id!
  );
  expect(result).toEqual({ ok: false, takenBy: MOM.uid });
  await expect
    .poll(() =>
      dad.page.evaluate(
        () => (window as unknown as HookWindow).__homecareTest.state.ui.current?.message ?? ''
      )
    )
    .toBe('מיכל כבר לקחה את המשימה');
  expect(
    await dad.page.evaluate(
      (taskId) =>
        (window as unknown as HookWindow).__homecareTest.state.tasks.byId(taskId)?.ownerId,
      id!
    )
  ).toBe(MOM.uid);

  await mom.context.close();
  await dad.context.close();
});
