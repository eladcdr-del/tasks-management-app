// owner: step 5.1. The service worker's push hand-off against the E2E (production) build, with
// pushes delivered straight to the SW over CDP. A push is never swallowed: while an app window is
// visible but its foreground handler is not wired (the demo never registers push, just like the
// welcome / onboarding screens or the boot splash), or while only another page on the origin is
// visible, the system notification is shown. Only a window that answers the SW's PUSH_PING gets
// the payload in Firebase's envelope (and shows its snackbar) instead.

import type { BrowserContext, Page } from '@playwright/test';
import { test, expect, openApp } from './fixtures';

// The headless shell keeps notifications denied whatever is granted; full Chromium in new headless
// mode shows them (and lists them through getNotifications()).
test.use({ channel: 'chromium' });

const BASE = '/tasks-management-app/';
const PUSH = {
  data: {
    type: 'requested',
    title: 'דני ביקש ממך',
    body: 'לקנות חלב',
    url: `${BASE}#/task/t1`,
    tag: 'req:t1'
  },
  from: '594233931298',
  fcmMessageId: 'm-1'
};

interface Shown {
  title: string;
  body: string;
  tag: string;
  url: string;
}

/** Opens the demo and waits for our SW to be active (it then receives pushes). */
async function openWithServiceWorker(page: Page, context: BrowserContext): Promise<void> {
  await context.grantPermissions(['notifications']);
  await openApp(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
}

/** Delivers `PUSH` to the app's service worker, as FCM would. */
async function deliverPush(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const registrationId = new Promise<string>((resolve) => {
    cdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => {
      const ours = registrations.find((r) => !r.isDeleted && r.scopeURL.endsWith(BASE));
      if (ours) resolve(ours.registrationId);
    });
  });
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.deliverPushMessage', {
    origin: new URL(page.url()).origin,
    registrationId: await registrationId,
    data: JSON.stringify(PUSH)
  });
}

const shown = (page: Page) =>
  page.evaluate(async (base) => {
    const reg = await navigator.serviceWorker.getRegistration(base);
    const list = (await reg?.getNotifications()) ?? [];
    return list.map((n) => ({
      title: n.title,
      body: n.body,
      tag: n.tag,
      url: (n.data as { url: string }).url
    }));
  }, BASE);

test('a push shows a notification while the open app is not listening for it', async ({
  page,
  context
}) => {
  await openWithServiceWorker(page, context);
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
  await deliverPush(page);
  await expect
    .poll(() => shown(page))
    .toEqual([
      {
        title: 'דני ביקש ממך',
        body: 'לקנות חלב',
        tag: 'req:t1',
        url: new URL(`${BASE}#/task/t1`, page.url()).href
      } satisfies Shown
    ]);
});

test('a push shows a notification while only another page on the origin is visible', async ({
  page,
  context
}) => {
  await openWithServiceWorker(page, context);
  await page.goto(new URL('/', page.url()).href); // e.g. another github.io project
  await deliverPush(page);
  await expect.poll(async () => (await shown(page)).length).toBe(1);
});

test('a listening app window gets the push in Firebase’s envelope, with no notification', async ({
  page,
  context
}) => {
  // Stands in for a page whose onMessage is wired: it answers the SW's PUSH_PING first (before the
  // app's own "not listening" answer) and records what the SW hands over.
  await page.addInitScript(() => {
    const w = window as unknown as { __received: unknown[] };
    w.__received = [];
    navigator.serviceWorker.addEventListener('message', (e) => {
      const data = e.data as { type?: string; isFirebaseMessaging?: boolean } | null;
      if (data?.type === 'PUSH_PING') {
        e.ports[0]?.postMessage(true);
        e.stopImmediatePropagation();
      } else if (data?.isFirebaseMessaging) {
        w.__received.push(data);
      }
    });
  });
  await openWithServiceWorker(page, context);
  await deliverPush(page);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __received: unknown[] }).__received))
    .toEqual([
      expect.objectContaining({
        data: PUSH.data,
        isFirebaseMessaging: true,
        messageType: 'push-received'
      })
    ]);
  expect(await shown(page)).toEqual([]);
});
