// owner: step 5.1 — a push registration that fails on the onboarding notifications step, against
// the emulators. The page is told notifications are allowed (Notification is stubbed), but the
// browser itself refuses the push subscription, so registering this device fails: the step must
// say so and offer a retry, and Settings must not call notifications active afterwards.
//
//   flock /tmp/homecare-emu.lock flock /tmp/homecare-e2e.lock env E2E_PORT=4203 \
//     npx firebase emulators:exec --only auth,firestore --project demo-homecare \
//     "npx playwright test --project=emulator tests/e2e-emulator/notifications.spec.ts"

import type { Page } from '@playwright/test';
import { expect, signIn, test } from './fixtures';

interface Hooks {
  state: {
    session: {
      phase: string;
      createHousehold(
        name: string,
        p: { displayName: string; photoURL: null; color: string; addressAs: 'f' | 'm' }
      ): Promise<string>;
    };
  };
}
type HookWindow = Window & { __homecareTest?: Hooks };

const phaseIs = (page: Page, phase: string) =>
  page.waitForFunction(
    (p) => (window as unknown as HookWindow).__homecareTest?.state.session.phase === p,
    phase,
    { timeout: 20_000 }
  );

test.use({ now: null });
const RUN = Date.now().toString(36);

test('a failed registration is shown with a retry, and Settings offers to turn it on again', async ({
  page
}) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    let permission: NotificationPermission = 'default';
    Object.defineProperty(Notification, 'permission', { get: () => permission });
    Notification.requestPermission = async () => (permission = 'granted');
  });
  await page.goto('./?emulator=1#/');
  await phaseIs(page, 'signed-out');
  await signIn(page, `n-mom-${RUN}`, 'מיכל');
  await phaseIs(page, 'no-household');
  await page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest!.state.session.createHousehold('הבית שלנו', {
      displayName: 'מיכל',
      photoURL: null,
      color: 'sage',
      addressAs: 'f'
    })
  );
  await phaseIs(page, 'ready');

  await page.evaluate(() => (location.hash = '#/onboarding/notifications'));
  await page.getByRole('button', { name: 'הפעלה' }).click();
  await expect(page.getByRole('alert')).toContainText('לא הצלחנו להפעיל את ההתראות');
  await expect(page).toHaveURL(/#\/onboarding\/notifications$/);
  await expect(page.getByRole('button', { name: 'נסו שוב' })).toBeVisible();

  await page.getByRole('button', { name: 'אחר כך' }).click();
  await expect(page).toHaveURL(/#\/$/);

  await page.evaluate(() => (location.hash = '#/settings'));
  await expect(page.locator('[data-push-status]')).toHaveText('ההתראות עוד לא מגיעות למכשיר הזה');
  await expect(page.getByRole('button', { name: 'הפעלה מחדש' })).toBeVisible();
});
