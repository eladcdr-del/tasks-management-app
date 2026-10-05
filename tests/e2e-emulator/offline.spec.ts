// Firebase mode offline, against the emulators: after a SINGLE online visit the Firebase chunks are
// in the service worker's caches (precached when firebase-config.ts is filled in, as the E2E
// build's is; the first visit is not controlled by the worker, so runtime caching alone would miss
// them) and the app opens without a connection; changes made offline stay counted as waiting after
// an offline reload (Firestore keeps them queued; the count comes from the snapshots' pending
// writes).
//
//   flock /tmp/homecare-emu.lock flock /tmp/homecare-e2e.lock \
//     npx firebase emulators:exec --only auth,firestore --project demo-homecare \
//     "npx playwright test --project=emulator tests/e2e-emulator/offline.spec.ts"

import type { Page } from '@playwright/test';
import { EMULATOR_PROJECT, expect, signIn, test } from './fixtures';

interface Hooks {
  state: {
    session: {
      phase: string;
      createHousehold(
        name: string,
        profile: { displayName: string; photoURL: null; color: string; addressAs: string }
      ): Promise<string>;
    };
    sync: { status: string; pendingWrites: number };
    tasks: { create(draft: { title: string }): string | null };
  };
}
type HookWindow = Window & { __homecareTest?: Hooks };

const FIRESTORE = `http://${process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'}`;
const TITLES = ['לקנות חלב', 'להחליף נורה במרפסת'];

const phaseIs = (page: Page, phase: string) =>
  page.waitForFunction(
    (p) => (window as unknown as HookWindow).__homecareTest?.state.session.phase === p,
    phase
  );
const syncState = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as HookWindow).__homecareTest!.state.sync;
    return { status: s.status, pendingWrites: s.pendingWrites };
  });

async function serverHasTask(hid: string, id: string): Promise<boolean> {
  const res = await fetch(
    `${FIRESTORE}/v1/projects/${EMULATOR_PROJECT}/databases/(default)/documents/households/${hid}/tasks/${id}`,
    { headers: { Authorization: 'Bearer owner' } }
  );
  return res.ok;
}

test.use({ now: null });
const run = Date.now().toString(36);

test('opened offline after one visit: Home opens, and unsent changes stay counted', async ({
  page,
  context
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // The one online visit: sign in and found the house.
  await page.goto('./?emulator=1#/');
  await signIn(page, `u-off-${run}`, 'מיכל');
  const hid = await page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest!.state.session.createHousehold('הבית שלנו', {
      displayName: 'מיכל',
      photoURL: null,
      color: 'terracotta',
      addressAs: 'f'
    })
  );
  await phaseIs(page, 'ready');
  await expect(page.locator('[data-me]')).toHaveText('מיכל');
  // The service worker installed during this visit, but does not control this page, so nothing
  // this page loaded went through its runtime cache. The Firebase chunks must already be in its
  // caches. (Read directly: here a missing chunk would still be fetched from the running preview
  // server by the worker even with the page offline, so the reload below cannot prove it alone.)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  const cached = await page.evaluate(async () => {
    const paths: string[] = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys())
        paths.push(new URL(req.url).pathname);
    }
    return paths;
  });
  for (const chunk of [
    /\/assets\/firebaseRepository-[^/]+\.js$/,
    /\/assets\/index\.esm-[^/]+\.js$/
  ]) {
    expect(
      cached.some((p) => chunk.test(p)),
      String(chunk)
    ).toBe(true);
  }

  // No connection: two new tasks wait to be sent.
  await context.setOffline(true);
  const ids = await page.evaluate(
    (titles) =>
      titles.map((title) =>
        (window as unknown as HookWindow).__homecareTest!.state.tasks.create({ title })
      ),
    TITLES
  );
  // On screen means applied to the local cache (Firestore stores the write before showing it).
  for (const title of TITLES) await expect(page.getByText(title)).toBeVisible();
  await expect.poll(() => syncState(page)).toEqual({ status: 'offline', pendingWrites: 2 });
  await expect(page.getByRole('status').filter({ hasText: 'אין רשת' })).toContainText(
    '2 שינויים ממתינים'
  );

  // Reopened while still offline: the app opens, with the tasks and the waiting count.
  await page.reload();
  await expect(page.locator('[data-me]')).toHaveText('מיכל', { timeout: 15_000 });
  for (const title of TITLES) await expect(page.getByText(title)).toBeVisible();
  await expect.poll(() => syncState(page)).toEqual({ status: 'offline', pendingWrites: 2 });
  await expect(page.getByRole('status').filter({ hasText: 'אין רשת' })).toContainText(
    '2 שינויים ממתינים'
  );

  // Back online: they reach the server, and only then does it say everything is saved.
  await context.setOffline(false);
  await expect
    .poll(() => syncState(page), { timeout: 20_000 })
    .toEqual({ status: 'synced', pendingWrites: 0 });
  for (const id of ids) expect(await serverHasTask(hid, id!)).toBe(true);
  expect(errors).toEqual([]);
});
