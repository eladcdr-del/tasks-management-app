// owner: step 3.1 — onboarding against the emulators (rules enforced): ./?emulator=1 → welcome →
// "כניסה עם Google" (the repository's Google sign-in stubbed with the test credential) → profile
// (required: no house is ever created with a neutral "את/ה" founder) → create the household →
// install step → Home. The profile survives a reload between the steps.
//
//   flock /tmp/homecare-emu.lock flock /tmp/homecare-e2e.lock env E2E_PORT=4201 \
//     npx firebase emulators:exec --only auth,firestore --project demo-homecare \
//     "npx playwright test --project=emulator tests/e2e-emulator/onboarding.spec.ts"

import type { Page } from '@playwright/test';
import { expect, signIn, test } from './fixtures';

interface Hooks {
  state: {
    session: {
      phase: string;
      repo: {
        signInWithGoogle(): Promise<void>;
        signInWithTestCredential(uid: string, name: string): Promise<void>;
      } | null;
    };
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

/** The real welcome button, with the Google popup replaced by the emulator's test credential. */
async function stubGoogleSignIn(page: Page, uid: string, name: string) {
  await phaseIs(page, 'signed-out');
  await page.evaluate(
    ([u, n]) => {
      const repo = (window as unknown as HookWindow).__homecareTest!.state.session.repo!;
      repo.signInWithGoogle = () => repo.signInWithTestCredential(u, n);
    },
    [uid, name] as const
  );
}

test('a first-timer signs in, fills the profile, creates a household and reaches Home', async ({
  page
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('./?emulator=1#/');
  await expect(page).toHaveURL(/#\/welcome$/);
  await stubGoogleSignIn(page, `u-mom-${run}`, 'מיכל כהן');
  await page.getByRole('button', { name: 'כניסה עם Google' }).click();
  await phaseIs(page, 'no-household');

  // The profile comes first: address-as is required.
  await expect(page).toHaveURL(/#\/onboarding\/profile$/);
  const name = page.getByLabel('איך קוראים לך?');
  await expect(name).toHaveValue('מיכל'); // first name from Google
  await page.getByRole('button', { name: 'המשך' }).click();
  await expect(page.getByText('בחרו איך לפנות אליכם')).toBeVisible();
  await page.getByRole('radio', { name: /^את/ }).first().check({ force: true });
  await page.getByRole('radio', { name: 'מרווה' }).check({ force: true });
  await page.getByRole('button', { name: 'המשך' }).click();
  await expect(page).toHaveURL(/#\/onboarding\/household$/);

  // Android may reload the tab while she asks dad what to call the house: the choices stay.
  await page.reload();
  await phaseIs(page, 'no-household');
  await expect(page).toHaveURL(/#\/onboarding\/household$/);
  await expect(page.locator('[data-edit-profile]')).toContainText('מיכל');

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

test('without a profile, the household step sends her to fill it in first', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./?emulator=1#/');
  // The boot gate lands a signed-in newcomer on the household step (e.g. reopening the app).
  await signIn(page, `u-mom2-${run}`, 'מיכל');
  await phaseIs(page, 'no-household');
  await expect(page).toHaveURL(/#\/onboarding\/profile$/);
  await page.evaluate(() => (location.hash = '#/onboarding/household'));
  await expect(page).toHaveURL(/#\/onboarding\/profile$/);
  await expect(page.getByRole('button', { name: 'יצירת הבית' })).toHaveCount(0);
});
