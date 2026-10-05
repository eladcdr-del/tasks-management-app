import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { withoutFirebaseConfig } from './config';
import { expect, openApp, shot, test } from './fixtures';

// Boot & adapter selection (step 2.4): setup when nothing is configured, the demo (?demo=1, reset,
// as, stored mode, exit), and the phase gating of routes. The fixed clock (fixtures.ts) puts the
// seed on Sunday 2026-10-04 09:00, where the pulse reads attention 3 / today 4 / waiting 3.
// firebase-config.ts is filled in (the live project), so the build boots into Firebase mode; the
// setup-screen tests blank the config in the served bundle (config.ts).

const SETUP_TITLE = 'האפליקציה עוד לא חוברה ל-Firebase';
const BANNER = 'מצב תצוגה';

/** The test hooks of E2E builds (src/main.ts), as far as these tests use them. */
interface Hooks {
  state: {
    session: {
      phase: string;
      mode: string | null;
      user: { uid: string } | null;
      signIn(): Promise<void>;
      signOut(): Promise<void>;
    };
    tasks: { create(draft: { title: string; priority?: string }): string | null };
  };
  clock: { today: string; wall: { hour: number; minute: number; weekday: number } };
  actAs(uid: string): Promise<void>;
  flush(): Promise<void>;
}
type HookWindow = Window & { __homecareTest: Hooks };

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Ignored: favicon probes, and Google's sign-in script, which a signed-out device loads ahead of
  // the first tap (init.ts) and which this sandbox's network may refuse.
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon\.ico|apis\.google\.com/.test(m.location().url ?? ''))
      errors.push(m.text());
  });
  return errors;
}

async function expectPulse(page: Page, attention: number, today: number, waiting: number) {
  await expect(page.locator('[data-pulse="attention"]')).toHaveText(String(attention));
  await expect(page.locator('[data-pulse="today"]')).toHaveText(String(today));
  await expect(page.locator('[data-pulse="waiting"]')).toHaveText(String(waiting));
}

const banner = (page: Page) => page.getByRole('complementary', { name: BANNER });
const hooksReady = (page: Page) =>
  page.waitForFunction(
    () => (window as unknown as HookWindow).__homecareTest?.state.session.phase !== 'booting'
  );
const phase = (page: Page) =>
  page.evaluate(() => (window as unknown as HookWindow).__homecareTest.state.session.phase);

test.describe('without a Firebase config', () => {
  test.use({ serviceWorkers: 'block' }); // every chunk through page.route

  test.beforeEach(async ({ page }) => {
    await withoutFirebaseConfig(page);
  });

  test('no config and no stored mode → the setup screen, whatever the deep link', async ({
    page
  }) => {
    const errors = trackErrors(page);
    await page.goto('./#/memory');
    await expect(page.getByRole('heading', { level: 1, name: SETUP_TITLE })).toBeVisible();
    await expect(page).toHaveURL(/\/tasks-management-app\/#\/setup$/);
    await expect(banner(page)).toHaveCount(0);
    await expect(page.getByRole('navigation')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('homecare.mode'))).toBeNull();
    expect(errors).toEqual([]);
  });

  test('entering the demo (?demo=1) from setup → Home with the seeded data and the banner', async ({
    page
  }) => {
    const errors = trackErrors(page);
    await page.goto('./#/');
    await expect(page.getByRole('heading', { level: 1, name: SETUP_TITLE })).toBeVisible();

    await page.goto('./?demo=1#/');
    await expectPulse(page, 3, 4, 3);
    await expect(page.getByText('ארוחה במסעדה · 7 מתוך 10')).toBeVisible();
    await expect(page.locator('[data-me]')).toHaveText('מיכל');
    await expect(banner(page)).toContainText('מצב תצוגה · הנתונים לדוגמה');
    await expect(page.getByRole('navigation', { name: 'ניווט ראשי' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('homecare.mode'))).toBe('demo');
    expect(await phase(page)).toBe('ready');

    // The app clock is exposed for assertions (fixed clock: Sunday 09:00).
    const clock = await page.evaluate(() => {
      const c = (window as unknown as HookWindow).__homecareTest.clock; // fields are getters
      return { today: c.today, wall: c.wall };
    });
    expect(clock.today).toBe('2026-10-04');
    expect(clock.wall).toMatchObject({ hour: 9, weekday: 0 });

    // The banner is accessible in both themes (contrast, names).
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      const axe = await new AxeBuilder({ page }).include('.demo-banner').analyze();
      expect(axe.violations.map((v) => v.id)).toEqual([]);
    }
    await page.emulateMedia({ colorScheme: 'light' });
    await shot(page, 'boot-demo-home');
    expect(errors).toEqual([]);
  });
});

test('with the live config, a fresh visit lands on the welcome screen', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#/memory');
  await expect(page.getByRole('button', { name: 'כניסה עם Google' })).toBeVisible();
  await expect(page).toHaveURL(/\/tasks-management-app\/#\/welcome$/);
  expect(await page.evaluate(() => localStorage.getItem('homecare.mode'))).toBeNull();
  expect(await phase(page)).toBe('signed-out');
  expect(
    await page.evaluate(() => (window as unknown as HookWindow).__homecareTest.state.session.mode)
  ).toBe('firebase');
  expect(errors).toEqual([]);
});

test('?demo=1&reset=1 reseeds and strips reset from the URL; without it changes persist', async ({
  page
}) => {
  await openApp(page); // ./?demo=1&reset=1#/
  await expectPulse(page, 3, 4, 3);
  await expect(page).toHaveURL(/\/tasks-management-app\/\?demo=1#\/$/);

  await page.evaluate(async () => {
    const hooks = (window as unknown as HookWindow).__homecareTest;
    hooks.state.tasks.create({ title: 'לסגור את הברז הראשי', priority: 'urgent' });
    await hooks.flush();
  });
  await expectPulse(page, 4, 4, 3);

  await page.reload(); // URL no longer carries reset=1: the saved demo comes back
  await expectPulse(page, 4, 4, 3);

  await openApp(page, '#/memory'); // reset=1 again: fresh seed
  await expect(page).toHaveURL(/\/tasks-management-app\/\?demo=1#\/memory$/);
  await hooksReady(page);
  await page.evaluate(() => (window as unknown as HookWindow).__homecareTest.flush());
  await page.goto('./#/');
  await expectPulse(page, 3, 4, 3);
});

test('a stored demo survives a reload without any params', async ({ page }) => {
  await openApp(page);
  await expectPulse(page, 3, 4, 3);
  await page.goto('./#/');
  await expectPulse(page, 3, 4, 3);
  await expect(banner(page)).toBeVisible();
  await page.reload();
  await expect(banner(page)).toBeVisible();
  await expectPulse(page, 3, 4, 3);
});

test('exiting the demo returns to the welcome screen (live config) and forgets the mode', async ({
  page
}) => {
  const errors = trackErrors(page);
  await openApp(page, '#/memory');
  await banner(page).getByRole('button', { name: 'יציאה מהדמו' }).click();
  await expect(page.getByRole('button', { name: 'כניסה עם Google' })).toBeVisible();
  await expect(page).toHaveURL(/\/tasks-management-app\/#\/welcome$/);
  await expect(banner(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('homecare.mode'))).toBeNull();
  await page.reload();
  await expect(page.getByRole('button', { name: 'כניסה עם Google' })).toBeVisible();
  expect(await phase(page)).toBe('signed-out');
  expect(errors).toEqual([]);
});

test('#/setup and #/welcome are not reachable when ready', async ({ page }) => {
  await openApp(page, '#/setup');
  await expect(page).toHaveURL(/#\/$/);
  await expectPulse(page, 3, 4, 3);
  await page.evaluate(() => (location.hash = '#/welcome'));
  await expect(page).toHaveURL(/#\/$/);
  await page.evaluate(() => (location.hash = '#/memory'));
  await expect(page).toHaveURL(/#\/memory$/);
});

test('?as=dani acts as דני (and is not repeated on reload)', async ({ page }) => {
  await openApp(page, '#/', { as: 'dani' });
  await expect(page.locator('[data-me]')).toHaveText('דני');
  await expect(page).toHaveURL(/\?demo=1#\/$/);
  const uid = await page.evaluate(
    () => (window as unknown as HookWindow).__homecareTest.state.session.user?.uid
  );
  expect(uid).toBe('dani');
  // The parcel he asked מיכל about waits for her answer: for him it waits for someone (4).
  await expectPulse(page, 3, 4, 4);
});

test('gating: signed out → welcome; an invite opened signed out comes back after sign-in', async ({
  page
}) => {
  const errors = trackErrors(page);
  await openApp(page);
  await hooksReady(page);

  // A user with no household lands on onboarding, profile first (no silent neutral profile).
  await page.evaluate(() => (window as unknown as HookWindow).__homecareTest.actAs('newcomer'));
  await expect(page).toHaveURL(/#\/onboarding\/profile$/);
  expect(await phase(page)).toBe('no-household');

  // Signed out: everything leads to #/welcome; a join link is kept for after sign-in.
  await page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest.state.session.signOut()
  );
  await expect(page).toHaveURL(/#\/welcome$/);
  await page.evaluate(() => (location.hash = '#/join/HomeCareTestInvite0000001'));
  await expect(page).toHaveURL(/#\/welcome$/);
  expect(await page.evaluate(() => sessionStorage.getItem('homecare.pendingInvite'))).toBe(
    'HomeCareTestInvite0000001'
  );
  await expect(page.getByText('הוזמנת להצטרף לבית')).toBeVisible();

  await page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest.state.session.signIn()
  );
  await expect(page).toHaveURL(/#\/join\/HomeCareTestInvite0000001$/);
  expect(await phase(page)).toBe('no-household');
  expect(await page.evaluate(() => sessionStorage.getItem('homecare.pendingInvite'))).toBeNull();

  // Back to a member: ready, and the join route is no longer reachable.
  await page.evaluate(() => (window as unknown as HookWindow).__homecareTest.actAs('michal'));
  await expect(page).toHaveURL(/#\/$/);
  await expectPulse(page, 3, 4, 3);
  expect(errors).toEqual([]);
});
