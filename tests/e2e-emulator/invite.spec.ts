// owner: step 3.1 — the invite flow against the emulators: the owner creates a link on
// #/household; a second person opens #/join/<code> signed out, signs in, joins, and both see both
// members. A revoked link shows a Hebrew error.
//
//   flock /tmp/homecare-emu.lock flock /tmp/homecare-e2e.lock env E2E_PORT=4201 \
//     npx firebase emulators:exec --only auth,firestore --project demo-homecare \
//     "npx playwright test --project=emulator tests/e2e-emulator/invite.spec.ts"

import type { Browser, Page } from '@playwright/test';
import { expect, signIn, test } from './fixtures';

interface Hooks {
  state: {
    session: {
      phase: string;
      createHousehold(
        name: string,
        profile: { displayName: string; photoURL: null; color: string; addressAs: string }
      ): Promise<string>;
    };
  };
}
type HookWindow = Window & { __homecareTest?: Hooks; opened?: string[] };

const phaseIs = (page: Page, phase: string) =>
  page.waitForFunction(
    (p) => (window as unknown as HookWindow).__homecareTest?.state.session.phase === p,
    phase
  );

async function newPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 },
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem'
  });
  return ctx.newPage();
}

/** No real share sheet or popup: record what would have been opened. */
async function stubShare(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as HookWindow;
    w.opened = [];
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    window.open = ((url?: string | URL) => {
      w.opened!.push(String(url));
      return { opener: null } as unknown as Window;
    }) as typeof window.open;
  });
}

test.use({ now: null });
// No clearEmulators(): specs share the emulators with parallel workers, so each run uses fresh uids.
const run = Date.now().toString(36);

test('an invite link brings a second member in; a revoked link explains itself', async ({
  page,
  browser
}) => {
  test.setTimeout(120_000);

  // Owner: a household, then an invite from the household screen.
  await stubShare(page);
  await page.goto('./?emulator=1#/');
  await signIn(page, `u-mom-${run}`, 'מיכל');
  await phaseIs(page, 'no-household');
  await page.evaluate(() =>
    (window as unknown as HookWindow).__homecareTest!.state.session.createHousehold('הבית שלנו', {
      displayName: 'מיכל',
      photoURL: null,
      color: 'terracotta',
      addressAs: 'f'
    })
  );
  await phaseIs(page, 'ready');
  await page.evaluate(() => (location.hash = '#/household'));
  const card = page.locator('[data-invite-card]');
  await card.getByRole('button', { name: 'הזמנה בוואטסאפ' }).click();
  const linkText = (await card.locator('[data-invite-link]').textContent()) ?? '';
  const code = /#\/join\/(.+)$/.exec(linkText)?.[1];
  expect(code).toBeTruthy();
  await expect(card.locator('[data-invite-valid]')).toHaveText(/^בתוקף/);

  // Partner: opens the link signed out → welcome → signs in → back on the join screen.
  const dad = await newPage(browser);
  await dad.goto(`./?emulator=1#/join/${code}`);
  await expect(dad).toHaveURL(/#\/welcome$/);
  await signIn(dad, `u-dad-${run}`, 'דני לוי');
  await expect(dad).toHaveURL(new RegExp(`#/join/${code}$`));
  await expect(
    dad.getByRole('heading', { level: 1, name: 'הזמנה ממיכל להצטרף ל״הבית שלנו״' })
  ).toBeVisible();
  await expect(dad.getByLabel('איך קוראים לך?')).toHaveValue('דני');
  await dad.getByRole('radio', { name: /^אתה/ }).check({ force: true });
  await dad.getByRole('button', { name: 'הצטרפות' }).click();
  await expect(dad).toHaveURL(/#\/onboarding\/install$/);
  await phaseIs(dad, 'ready');

  // Both see both.
  await dad.evaluate(() => (location.hash = '#/household'));
  for (const p of [page, dad]) {
    await expect(p.getByText('מיכל', { exact: true })).toBeVisible();
    await expect(p.getByText('דני', { exact: true })).toBeVisible();
  }

  // The owner revokes the link: a third person gets a Hebrew explanation.
  await page.reload();
  await phaseIs(page, 'ready');
  await page
    .getByRole('button', { name: 'הזמנה בוואטסאפ' })
    .or(page.getByRole('button', { name: 'ביטול קישור' }))
    .first()
    .waitFor();
  await page.getByRole('button', { name: 'ביטול קישור' }).click();
  await expect(card.getByRole('button', { name: 'הזמנה בוואטסאפ' })).toBeVisible();

  const guest = await newPage(browser);
  await guest.goto('./?emulator=1#/');
  await signIn(guest, `u-guest-${run}`, 'רותי');
  await phaseIs(guest, 'no-household');
  await guest.evaluate((c) => (location.hash = `#/join/${c}`), code!);
  await expect(
    guest.getByText('הקישור הזה בוטל. אפשר לבקש קישור חדש ממי ששלח אותו.')
  ).toBeVisible();
  await expect(guest.getByRole('link', { name: 'ליצירת בית חדש' })).toBeVisible();
});
