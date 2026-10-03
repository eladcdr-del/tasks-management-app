// owner: step 1.1 — only that step edits this file (request additions via the orchestrator).
//
// Fixtures for the emulator E2E project (npm run test:e2e:emu, under `firebase emulators:exec`).
// Lock order when running: flock /tmp/homecare-emu.lock flock /tmp/homecare-e2e.lock … (emu first).
//
//   import { test, expect, openApp, clearEmulators, signIn } from './fixtures';
//
//   test.beforeEach(async () => clearEmulators());
//   test('two members', async ({ page }) => {
//     await openApp(page, '#/', { demo: false, reset: false });   // emulator mode is gated by 2.4
//     await signIn(page, 'u-michal', 'מיכל');
//   });

import type { Page } from '@playwright/test';

export { FIXED_NOW, expect, openApp, shot, test } from '../e2e/fixtures';

export const EMULATOR_PROJECT = 'demo-homecare';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

/** Deletes every Firestore document and every Auth account in the emulators (project demo-homecare). */
export async function clearEmulators(): Promise<void> {
  const targets = [
    `http://${FIRESTORE_HOST}/emulator/v1/projects/${EMULATOR_PROJECT}/databases/(default)/documents`,
    `http://${AUTH_HOST}/emulator/v1/projects/${EMULATOR_PROJECT}/accounts`
  ];
  for (const url of targets) {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error(`clearEmulators: DELETE ${url} → ${res.status} ${res.statusText}`);
  }
}

/** Test hooks the app exposes in E2E builds. Implemented by step 2.4 (gated like DEV_ROUTES_ENABLED). */
interface HomecareTestHooks {
  signIn(uid: string, name: string): Promise<void>;
}

/**
 * Signs in to the Auth emulator as `uid` with display name `name`, through
 * `window.__homecareTest.signIn(uid, name)`. Step 2.4 implements that hook (E2E builds only, with
 * `?emulator=1`); until then this waits and times out.
 */
export async function signIn(page: Page, uid: string, name: string): Promise<void> {
  await page.waitForFunction(
    () =>
      typeof (window as unknown as { __homecareTest?: HomecareTestHooks }).__homecareTest
        ?.signIn === 'function'
  );
  await page.evaluate(
    ([u, n]) =>
      (window as unknown as { __homecareTest: HomecareTestHooks }).__homecareTest.signIn(u, n),
    [uid, name] as const
  );
}
