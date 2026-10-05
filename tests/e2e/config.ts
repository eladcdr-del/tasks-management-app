// The E2E build bakes in the real firebase-config.ts, so a visit without ?demo=1 boots into Firebase
// mode (the welcome screen). Specs that cover the "not connected yet" path (#/setup) blank the
// config in the served bundle instead: every JS response has the apiKey literal emptied, which is
// exactly what an unfilled firebase-config.ts looks like to select.ts.
//
//   test.use({ serviceWorkers: 'block' });   // a chunk served by the SW would bypass page.route
//   await withoutFirebaseConfig(page);       // before the first navigation

import type { Page } from '@playwright/test';
import { firebaseConfig } from '../../firebase-config';

export async function withoutFirebaseConfig(page: Page): Promise<void> {
  const key = firebaseConfig.apiKey;
  if (!key) return; // already unconfigured
  await page.route(/\/assets\/[^/]+\.js(\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({ response, body: body.replaceAll(key, '') });
  });
}
