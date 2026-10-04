// owner: step 3.1 — onboarding against the emulators (rules enforced): ./?emulator=1 → welcome →
// test sign-in → profile → create the household → install step → Home.
//
//   flock /tmp/homecare-emu.lock flock /tmp/homecare-e2e.lock env E2E_PORT=4201 \
//     npx firebase emulators:exec --only auth,firestore --project demo-homecare \
//     "npx playwright test --project=emulator tests/e2e-emulator/onboarding.spec.ts"

import type { Page } from '@playwright/test';
import { expect, signIn, test } from './fixtures';

interface Hooks {
  state: {
    session: { phase: string };
    household: {
      household: { name: string } | null;
      me: { displayName: string; addressAs: string; color: string; role: string } | null;
    };
  };
}
type HookWindow = Window & { __homecareTest?: Hooks };

const phaseIs = (page: Page, phase: string) =>
  page.waitForFunction(
    (p) => (window as unknown as HookWindow).__homecareTest?.state.session.phase === p,
    phase
  );

test.use({ now: null });
// No clearEmulators(): specs share the emulators with parallel workers, so each run uses fresh uids.
const run = Date.now().toString(36);

test('a first-timer signs in, fills the profile, creates a household and reaches Home', async ({
  page
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('./?emulator=1#/');
  await expect(page).toHaveURL(/#\/welcome$/);
  await expect(page.getByRole('button', { name: 'כניסה עם Google' })).toBeVisible();

  await signIn(page, `u-mom-${run}`, 'מיכל כהן');
  await phaseIs(page, 'no-household');
  await expect(page).toHaveURL(/#\/onboarding\/household$/);

  // Fill in my details first.
  await page.locator('[data-edit-profile]').click();
  await expect(page).toHaveURL(/#\/onboarding\/profile$/);
  const name = page.getByLabel('איך קוראים לך?');
  await expect(name).toHaveValue('מיכל'); // first name from Google
  await page.getByRole('button', { name: 'המשך' }).click();
  await expect(page.getByText('בחרו איך לפנות אליכם')).toBeVisible(); // address-as is required
  await page.getByRole('radio', { name: /^את/ }).first().check({ force: true });
  await page.getByRole('radio', { name: 'מרווה' }).check({ force: true });
  await page.getByRole('button', { name: 'המשך' }).click();
  await expect(page).toHaveURL(/#\/onboarding\/household$/);

  // Create the household.
  await expect(page.getByLabel('שם הבית')).toHaveValue('הבית שלנו');
  await page.getByLabel('שם הבית').fill('בית כהן');
  await page.getByRole('button', { name: 'יצירת הבית' }).click();
  await expect(page).toHaveURL(/#\/onboarding\/install$/);
  await phaseIs(page, 'ready');
  await page.waitForFunction(
    () => (window as unknown as HookWindow).__homecareTest?.state.household.me != null
  );
  const me = await page.evaluate(() => {
    const s = (window as unknown as HookWindow).__homecareTest!.state.household;
    return { me: s.me, name: s.household?.name };
  });
  expect(me.me).toMatchObject({
    displayName: 'מיכל',
    addressAs: 'f',
    color: 'sage',
    role: 'owner'
  });
  expect(me.name).toBe('בית כהן');

  // Install step → (notifications, 5.1) → Home.
  await page.getByRole('button', { name: 'המשך' }).click();
  await expect(page).toHaveURL(/#\/onboarding\/notifications$/);
  await page.evaluate(() => (location.hash = '#/'));
  await expect(page.locator('[data-me]')).toHaveText('מיכל');
  await expect(page.getByRole('navigation', { name: 'ניווט ראשי' })).toBeVisible();
  expect(errors).toEqual([]);
});
