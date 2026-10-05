// owner: step 2.2 — the Firebase adapter booted by the real app against the emulators (rules
// enforced): ./?emulator=1 → signed-out → test sign-in → create a household → 'ready' → a task
// created through the tasks store reaches the server and is still there after a reload.
//
//   flock /tmp/homecare-emu.lock flock /tmp/homecare-e2e.lock env E2E_PORT=4195 \
//     npx firebase emulators:exec --only auth,firestore --project demo-homecare \
//     "npx playwright test --project=emulator tests/e2e-emulator/boot.spec.ts"
// (`npm run test:e2e:emu` runs the whole folder; extra args after `--` reach `firebase`, which
// rejects them, not Playwright.)
//
// The onboarding screens are still stubs, so the stores are driven through the E2E test hook
// (window.__homecareTest, src/main.ts).

import type { Page } from '@playwright/test';
import { clearEmulators, EMULATOR_PROJECT, expect, signIn, test } from './fixtures';

/** The test hook of E2E builds (src/main.ts), as far as this spec uses it. */
interface Hooks {
  state: {
    session: {
      phase: string;
      mode: string | null;
      user: { uid: string; displayName: string } | null;
      householdId: string | null;
      signOut(): Promise<void>;
      createHousehold(
        name: string,
        profile: { displayName: string; photoURL: string | null; color: string; addressAs: string }
      ): Promise<string>;
    };
    household: { me: { uid: string; displayName: string; role: string } | null };
    tasks: {
      openLoaded: boolean;
      create(draft: { title: string; priority?: string }): string | null;
      byId(id: string): { id: string; title: string; priority: string; pending?: boolean } | null;
    };
  };
}
type HookWindow = Window & { __homecareTest?: Hooks };

const MOM = { uid: 'u-mom', name: 'מיכל' };
const TITLE = 'לתקן את הברז במטבח';
const FIRESTORE = `http://${process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'}`;

/** A document as stored on the emulator, read as an admin (rules bypassed); null if absent. */
async function serverDoc(path: string): Promise<Record<string, Record<string, unknown>> | null> {
  const res = await fetch(
    `${FIRESTORE}/v1/projects/${EMULATOR_PROJECT}/databases/(default)/documents/${path}`,
    { headers: { Authorization: 'Bearer owner' } }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`serverDoc ${path}: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { fields?: Record<string, Record<string, unknown>> }).fields ?? {};
}

const phaseIs = (page: Page, phase: string) =>
  page.waitForFunction(
    (p) => (window as unknown as HookWindow).__homecareTest?.state.session.phase === p,
    phase
  );

function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

// Real time: server timestamps and Auth emulator tokens come from the real clock.
test.use({ now: null });

test.beforeEach(async () => {
  await clearEmulators();
});

test('emulator boot: sign in, create a household, create a task, and it survives a reload', async ({
  page
}) => {
  test.setTimeout(90_000);
  const errors = trackPageErrors(page);

  await page.goto('./?emulator=1#/');
  await phaseIs(page, 'signed-out');
  expect(
    await page.evaluate(() => (window as unknown as HookWindow).__homecareTest!.state.session.mode)
  ).toBe('emulator');
  await expect(page).toHaveURL(/#\/welcome$/);

  await signIn(page, MOM.uid, MOM.name);
  await phaseIs(page, 'no-household');

  const hid = await page.evaluate(
    (name) =>
      (window as unknown as HookWindow).__homecareTest!.state.session.createHousehold('הבית שלנו', {
        displayName: name,
        photoURL: null,
        color: 'terracotta',
        addressAs: 'f'
      }),
    MOM.name
  );
  await phaseIs(page, 'ready');
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('[data-me]')).toHaveText(MOM.name);
  // The founder batch is on the server, exactly as the rules accepted it.
  expect((await serverDoc(`households/${hid}/members/${MOM.uid}`))?.role).toEqual({
    stringValue: 'owner'
  });
  expect((await serverDoc(`users/${MOM.uid}`))?.householdId).toEqual({ stringValue: hid });

  // A task through the tasks store: shown at once, then acknowledged by the server.
  const id = await page.evaluate(
    (title) =>
      (window as unknown as HookWindow).__homecareTest!.state.tasks.create({
        title,
        priority: 'urgent'
      }),
    TITLE
  );
  expect(id).toBeTruthy();
  await page.waitForFunction((taskId) => {
    const t = (window as unknown as HookWindow).__homecareTest!.state.tasks.byId(taskId);
    return t !== null && t.pending === false;
  }, id!);
  await expect
    .poll(async () => (await serverDoc(`households/${hid}/tasks/${id}`))?.title)
    .toEqual({ stringValue: TITLE });
  const stored = await serverDoc(`households/${hid}/tasks/${id}`);
  expect(stored?.weekPlan).toEqual({ booleanValue: false });
  expect(stored?.createdBy).toEqual({ stringValue: MOM.uid });

  // Reload: Auth keeps the session, the household is found again, and the task is still there.
  await page.reload();
  await phaseIs(page, 'ready');
  expect(
    await page.evaluate(
      () => (window as unknown as HookWindow).__homecareTest!.state.session.householdId
    )
  ).toBe(hid);
  await page.waitForFunction(
    (taskId) => (window as unknown as HookWindow).__homecareTest!.state.tasks.byId(taskId) !== null,
    id!
  );
  expect(
    await page.evaluate(
      (taskId) => (window as unknown as HookWindow).__homecareTest!.state.tasks.byId(taskId),
      id!
    )
  ).toMatchObject({ id, title: TITLE, priority: 'urgent', pending: false });
  await expect(page.locator('[data-me]')).toHaveText(MOM.name);

  expect(errors).toEqual([]);
});

/** Google's sign-in script host: the SDK loads it (and then an iframe) for popups and redirects. */
const GOOGLE_SCRIPT = /^https:\/\/apis\.google\.com\//;

test('a signed-in launch never waits for Google’s sign-in script, even when it hangs', async ({
  page
}) => {
  test.setTimeout(90_000);
  const errors = trackPageErrors(page);
  await page.goto('./?emulator=1#/');
  await signIn(page, MOM.uid, MOM.name);
  await page.evaluate(
    (name) =>
      (window as unknown as HookWindow).__homecareTest!.state.session.createHousehold('הבית שלנו', {
        displayName: name,
        photoURL: null,
        color: 'terracotta',
        addressAs: 'f'
      }),
    MOM.name
  );
  await phaseIs(page, 'ready');

  // A weak connection: Google's script never answers (no failure either).
  const googleRequests: string[] = [];
  page.on('request', (r) => {
    if (GOOGLE_SCRIPT.test(r.url())) googleRequests.push(r.url());
  });
  await page.route(GOOGLE_SCRIPT, () => {
    /* never fulfilled */
  });

  const started = Date.now();
  await page.reload();
  await expect(page.locator('[data-me]')).toHaveText(MOM.name, { timeout: 8_000 });
  expect(Date.now() - started).toBeLessThan(8_000);
  expect(googleRequests).toEqual([]);

  // Signed out, the welcome screen does not wait for it either (it loads on the tap).
  await page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest!.state.session.signOut()
  );
  await expect(page).toHaveURL(/#\/welcome$/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'כניסה עם Google' })).toBeVisible({
    timeout: 8_000
  });
  expect(googleRequests).toEqual([]);
  expect(errors).toEqual([]);
});
