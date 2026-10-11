// owner: step 5.1. The service worker's push hand-off against the E2E (production) build, with
// pushes delivered straight to the SW over CDP. A push is never swallowed: while an app window is
// visible but its foreground handler is not wired (the demo never registers push, just like the
// welcome / onboarding screens or the boot splash), or while only another page on the origin is
// visible, the system notification is shown. Only a window that answers the SW's PUSH_PING gets
// the payload in Firebase's envelope (and shows its snackbar) instead. A test push ("בדיקת
// התראות") is the exception: it is always shown as a notification, and a fresh one.

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

/** Delivers `push` to the app's service worker, as FCM would. */
async function deliverPush(page: Page, push: object = PUSH): Promise<void> {
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
    data: JSON.stringify(push)
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

/**
 * Stands in for a page whose onMessage is wired: it answers the SW's PUSH_PING first (before the
 * app's own "not listening" answer) and records what the SW hands over.
 */
async function listenLikeFirebase(page: Page): Promise<void> {
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
}

const received = (page: Page) =>
  page.evaluate(() => (window as unknown as { __received: unknown[] }).__received);

test('a listening app window gets the push in Firebase’s envelope, with no notification', async ({
  page,
  context
}) => {
  await listenLikeFirebase(page);
  await openWithServiceWorker(page, context);
  await deliverPush(page);
  await expect
    .poll(() => received(page))
    .toEqual([
      expect.objectContaining({
        data: PUSH.data,
        isFirebaseMessaging: true,
        messageType: 'push-received'
      })
    ]);
  expect(await shown(page)).toEqual([]);
});

test('a test push is shown as a notification even to a listening window, one at a time', async ({
  page,
  context
}) => {
  const TEST = {
    data: {
      type: 'test',
      title: 'HomeCare: ההתראות מגיעות ✓',
      body: 'זו התראת בדיקה מהשרת. מעכשיו בקשות ותזכורות יגיעו לכאן.',
      url: `${BASE}#/settings`,
      tag: 'homecare-test'
    },
    from: '594233931298',
    fcmMessageId: 'm-test'
  };
  await listenLikeFirebase(page);
  await openWithServiceWorker(page, context);
  await deliverPush(page, TEST);
  const expected: Shown = {
    title: TEST.data.title,
    body: TEST.data.body,
    tag: 'homecare-test',
    url: new URL(`${BASE}#/settings`, page.url()).href
  };
  await expect.poll(() => shown(page)).toEqual([expected]);
  expect(await received(page)).toEqual([]);

  await deliverPush(page, { ...TEST, fcmMessageId: 'm-test-2' });
  await page.waitForTimeout(300);
  expect(await shown(page)).toEqual([expected]);
});
