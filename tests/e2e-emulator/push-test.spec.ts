// "בדיקת התראות" and the installed app's own permission, against the emulators (rules enforced).
//
//  1. Settings: with notifications allowed and this device registered, the button shows a real
//     notification through our service worker at once (tag homecare-test-local, listed by
//     registration.getNotifications()) and writes testPushAt on this device's doc, which the
//     notifier answers on its next run. The panel says what to expect.
//  2. Home, in the installed app (display-mode standalone) without notification permission while
//     this device registered push for the household in the browser: a gentle note asks to allow
//     them here once; refused, it shows the Android steps; dismissed, it stays away after a reload.
//
// The browser cannot get an FCM token here (no network to FCM), so the device's registration is
// seeded the way a successful one leaves it: the device doc (registerDevice) and the local record.
//
//   flock /tmp/homecare-emu.lock flock /tmp/homecare-e2e.lock env E2E_PORT=4203 \
//     npx firebase emulators:exec --only auth,firestore --project demo-homecare \
//     "npx playwright test --project=emulator tests/e2e-emulator/push-test.spec.ts"

import type { Page } from '@playwright/test';
import { EMULATOR_PROJECT, expect, shot, signIn, test } from './fixtures';

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
      householdId: string | null;
      repo: {
        registerDevice(d: {
          deviceId: string;
          householdId: string;
          token: string;
          userAgent: string;
        }): Promise<void>;
      };
      createHousehold(name: string, p: Profile): Promise<string>;
    };
  };
}
type HookWindow = Window & { __homecareTest: Hooks };

// Full Chromium (new headless) shows notifications and lists them; the headless shell does not.
test.use({ now: null, channel: 'chromium' });

const RUN = Date.now().toString(36);
const BASE = '/tasks-management-app/';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';

const phaseIs = (page: Page, phase: string) =>
  page.waitForFunction(
    (p) => (window as unknown as HookWindow).__homecareTest?.state.session.phase === p,
    phase,
    { timeout: 20_000 }
  );

/** Signs in as a new account with a household of her own; returns the household id. */
async function newHousehold(page: Page, uid: string): Promise<string> {
  await page.goto('./?emulator=1#/');
  await phaseIs(page, 'signed-out');
  await signIn(page, uid, 'מיכל');
  await phaseIs(page, 'no-household');
  const hid = await page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest.state.session.createHousehold('הבית שלנו', {
      displayName: 'מיכל',
      photoURL: null,
      color: 'sage',
      addressAs: 'f'
    })
  );
  await phaseIs(page, 'ready');
  return hid;
}

/** What a successful registration leaves behind: the device doc and this browser's record. */
async function seedRegistration(page: Page, hid: string, deviceId: string): Promise<void> {
  await page.evaluate(
    async ([h, id]) => {
      localStorage.setItem('homecare.deviceId', id);
      await (window as unknown as HookWindow).__homecareTest.state.session.repo.registerDevice({
        deviceId: id,
        householdId: h,
        token: `tok-${id}`,
        userAgent: navigator.userAgent
      });
      localStorage.setItem('homecare.pushReg', `${h}|tok-${id}|${Date.now()}`);
    },
    [hid, deviceId] as const
  );
}

/** A device doc's field, read as an admin (rules bypassed). */
async function deviceField(uid: string, deviceId: string, field: string): Promise<unknown> {
  const url = `http://${FIRESTORE_HOST}/v1/projects/${EMULATOR_PROJECT}/databases/(default)/documents/users/${uid}/devices/${deviceId}`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer owner' } });
  if (!res.ok) return undefined;
  const body = (await res.json()) as { fields?: Record<string, Record<string, string>> };
  return body.fields?.[field];
}

const shownNotifications = (page: Page) =>
  page.evaluate(async (base) => {
    const reg = await navigator.serviceWorker.getRegistration(base);
    const list = (await reg?.getNotifications()) ?? [];
    return list.map((n) => ({
      title: n.title,
      body: n.body,
      tag: n.tag,
      dir: n.dir,
      lang: n.lang,
      url: (n.data as { url?: string } | null)?.url
    }));
  }, BASE);

test('בדיקת התראות: a notification from the phone at once, and testPushAt for the notifier', async ({
  page,
  context
}) => {
  test.setTimeout(90_000);
  await context.grantPermissions(['notifications']);
  const uid = `pt-mom-${RUN}`;
  const deviceId = `e2e-phone-${RUN}`;
  const hid = await newHousehold(page, uid);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await seedRegistration(page, hid, deviceId);

  await page.evaluate(() => (location.hash = '#/settings'));
  await expect(page.locator('[data-push-status]')).toHaveText('ההתראות פעילות במכשיר הזה');
  const before = Date.now();
  await page.getByRole('button', { name: 'בדיקת התראות' }).click();

  await expect
    .poll(() => shownNotifications(page))
    .toEqual([
      {
        title: 'בדיקה: כך נראית התראה מ-HomeCare',
        body: 'אם רואים אותה, הטלפון מציג התראות של האפליקציה',
        tag: 'homecare-test-local',
        dir: 'rtl',
        lang: 'he',
        url: new URL(`${BASE}#/settings`, page.url()).href
      }
    ]);

  const panel = page.locator('[data-test-result]');
  await expect(panel).toHaveAttribute('data-test-result', 'local server');
  await expect(panel).toContainText(
    'שלחנו התראה לטלפון הזה עכשיו, ותוך כמה דקות תגיע עוד אחת מהשרת.'
  );
  await expect(panel).toContainText('ספרי לנו ונבדוק');

  const stored = (await deviceField(uid, deviceId, 'testPushAt')) as { integerValue?: string };
  expect(stored?.integerValue).toBeDefined();
  const at = Number(stored.integerValue);
  expect(at).toBeGreaterThanOrEqual(before - 1000);
  expect(at).toBeLessThanOrEqual(Date.now() + 1000);

  await shot(page, 'push-test-settings-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, 'push-test-settings-dark');
});

test('Home, in the installed app without its own permission: allow here once, or the Android steps', async ({
  page
}) => {
  test.setTimeout(90_000);
  // The installed app (standalone) on Android 13+, which was never given notification permission:
  // the page reads it as not asked yet; asking opens Android's dialog (refused here).
  await page.addInitScript(() => {
    const plain = window.matchMedia.bind(window);
    window.matchMedia = (query: string) =>
      query.includes('display-mode: standalone')
        ? ({
            matches: true,
            media: query,
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            addListener: () => {},
            removeListener: () => {},
            dispatchEvent: () => false
          } as MediaQueryList)
        : plain(query);
    let permission: NotificationPermission = 'default';
    Object.defineProperty(Notification, 'permission', { get: () => permission });
    Notification.requestPermission = async () => (permission = 'denied');
  });
  const uid = `pt-app-${RUN}`;
  const hid = await newHousehold(page, uid);
  // Push was turned on for this household in the Chrome tab (onboarding), and this is not the
  // installed app's first launch.
  await seedRegistration(page, hid, `e2e-app-${RUN}`);
  await page.evaluate(() => localStorage.setItem('homecare.appLaunched', '1'));
  await page.reload();
  await phaseIs(page, 'ready');

  const note = page.locator('[data-app-push]');
  await expect(note).toHaveAttribute('data-app-push', 'ask');
  await expect(note).toContainText(
    'כדי שההתראות יגיעו גם לאפליקציה המותקנת, צריך לאשר אותן כאן פעם אחת'
  );
  await shot(page, 'push-app-banner-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, 'push-app-banner-dark');
  await page.emulateMedia({ colorScheme: 'light' });

  // Settings tells the same story.
  await page.evaluate(() => (location.hash = '#/settings'));
  await expect(page.locator('[data-push-status]')).toHaveText(
    'כדי שההתראות יגיעו גם לאפליקציה המותקנת, צריך לאשר אותן כאן פעם אחת'
  );
  await expect(page.getByRole('button', { name: 'אישור התראות' })).toBeVisible();
  await page.evaluate(() => (location.hash = '#/'));

  await note.getByRole('button', { name: 'אישור התראות' }).click();
  await expect(note).toHaveAttribute('data-app-push', 'blocked');
  await expect(note.locator('bdi')).toHaveText([
    'לחיצה ארוכה על הסמל של HomeCare',
    '"פרטי האפליקציה"',
    '"התראות"',
    'לאפשר'
  ]);
  await shot(page, 'push-app-banner-blocked-light');

  await note.getByRole('button', { name: 'לא עכשיו' }).click();
  await expect(note).toHaveCount(0);
  await page.reload();
  await phaseIs(page, 'ready');
  await expect(page.locator('[data-section="plan"], .all-clear').first()).toBeVisible();
  await expect(page.locator('[data-app-push]')).toHaveCount(0);
});
