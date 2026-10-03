// owner: step 1.1 — only that step edits this file (request additions via the orchestrator).
//
// Shared Playwright fixtures for the demo E2E project. Every spec imports from here:
//
//   import { test, expect, openApp, shot } from './fixtures';
//
//   test('home', async ({ page }) => {
//     await openApp(page);                       // ./?demo=1&reset=1#/  (fresh demo data)
//     await openApp(page, '#/task/t1', { reset: false });
//     await shot(page, 'home-light');           // tests/e2e/__screens__/home-light.png
//   });
//
// Fixed clock: an auto fixture starts Date at FIXED_NOW (time then flows normally) (Sunday 4 Oct 2026, 09:00 Asia/Jerusalem)
// before any navigation, so "today" buckets and date labels are deterministic; timers still run.
//   test.use({ now: new Date('2026-10-08T20:00:00+03:00') });   // override for a file / describe
//   test.use({ now: null });                                    // opt out (real time)

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect, type Page, type Response } from '@playwright/test';

/** Sunday 4 October 2026, 09:00 in Asia/Jerusalem (the E2E context's time zone). */
export const FIXED_NOW = new Date('2026-10-04T09:00:00+03:00');

interface Fixtures {
  /** The frozen "now" (option). `null` opts out of the fixed clock. */
  now: Date | null;
  /** Auto fixture: installs the fixed clock before the test body navigates. */
  fixedClock: void;
}

export const test = base.extend<Fixtures>({
  now: [FIXED_NOW, { option: true }],
  fixedClock: [
    async ({ page, now }, use) => {
      if (now) await page.clock.install({ time: now });
      await use();
    },
    { auto: true }
  ]
});

export { expect };

export interface OpenAppOptions {
  /** Boot the demo adapter (`?demo=1`). Default true. */
  demo?: boolean;
  /** Reset demo data to the seed (`&reset=1`). Default true. */
  reset?: boolean;
  /** Act as this seeded demo member (`&as=<id>`); implemented by steps 2.1/2.4. */
  as?: string;
}

/**
 * Opens the app at `hash` with a RELATIVE url (keeps the /tasks-management-app/ base path), e.g.
 * `./?demo=1&reset=1#/memory`, and waits until the app has rendered into #app.
 */
export async function openApp(
  page: Page,
  hash = '#/',
  opts: OpenAppOptions = {}
): Promise<Response | null> {
  const { demo = true, reset = true, as } = opts;
  const params = new URLSearchParams();
  if (demo) params.set('demo', '1');
  if (reset) params.set('reset', '1');
  if (as) params.set('as', as);
  const query = params.toString();
  const search = query ? `?${query}` : '';
  const path = hash.replace(/^#?\/?/, '');
  const response = await page.goto(`./${search}#/${path}`);
  await expect(page.locator('#app')).not.toBeEmpty();
  return response;
}

const SCREENS_DIR = join(dirname(fileURLToPath(import.meta.url)), '__screens__');

/** Full-page screenshot (animations disabled) to tests/e2e/__screens__/<name>.png, for review. */
export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: join(SCREENS_DIR, `${name}.png`),
    fullPage: true,
    animations: 'disabled',
    caret: 'hide'
  });
}
