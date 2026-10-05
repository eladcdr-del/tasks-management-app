/// <reference lib="webworker" />
// owner: step 5.1. The single service worker, built by vite-plugin-pwa (injectManifest) to
// `<base>sw.js` with scope `<base>` (Blueprint §1, §9, §10).
//
//   precache      the app shell, fonts and icons (the Firebase SDK chunks are left out on purpose,
//                 see vite.config.ts `globIgnores`, so demo users never download them)
//   navigation    every in-scope navigation is answered with the precached index.html (hash routes)
//   runtime       lazy JS chunks under <base>assets/ that are not precached (the Firebase SDK):
//                 CacheFirst — names are content-hashed, so a cached file never goes stale.
//                 Google profile photos: StaleWhileRevalidate.
//   update        registerType 'prompt': UpdatePrompt posts SKIP_WAITING to the waiting worker.
//   push          FCM data-only messages {type,title,body,url,tag} (scripts/notify/sender.ts). The
//                 Firebase messaging SW SDK is NOT bundled: its two jobs are reproduced here —
//                 a visible app window whose `onMessage` is wired (it answers our PUSH_PING, see
//                 platform/push.ts) receives the payload in Firebase's own envelope and shows a
//                 snackbar; otherwise (no such window: closed, hidden, a screen before sign-in,
//                 another site on this origin) we show the notification ourselves (RTL, Hebrew,
//                 icon, badge, tag, deep link), so a push is never swallowed.
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope;

/** The SW's own directory is the app's base path (it is served at `<base>sw.js`). */
const BASE = new URL('./', self.location.href);
const basePath = BASE.pathname;
const abs = (path: string) => new URL(path, BASE).href;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Hash routing: any navigation inside the scope gets the app shell (offline too).
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Lazy chunks that are not precached (the Firebase SDK): cached on first use, so the Firebase
// mode keeps working offline after one online visit.
registerRoute(
  ({ url, request }) =>
    url.origin === self.location.origin &&
    url.pathname.startsWith(`${basePath}assets/`) &&
    (request.destination === 'script' || url.pathname.endsWith('.js')),
  new CacheFirst({
    cacheName: 'homecare-chunks',
    plugins: [new ExpirationPlugin({ maxEntries: 40, purgeOnQuotaError: true })]
  })
);

// Google account photos (Avatar): show the cached one at once, refresh in the background.
registerRoute(
  ({ url }) => url.hostname.endsWith('.googleusercontent.com'),
  new StaleWhileRevalidate({
    cacheName: 'homecare-avatars',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 30 * 24 * 60 * 60,
        purgeOnQuotaError: true
      })
    ]
  })
);

// registerType 'prompt': UpdatePrompt asks the waiting worker to take over.
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data: unknown = event.data;
  if (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === 'SKIP_WAITING'
  ) {
    void self.skipWaiting();
  }
});

// ── Web push (FCM) ──────────────────────────────────────────────────────────────────────────────

interface PushData {
  type?: string;
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

/** FCM's web push envelope: `{ data: {...}, from, fcmMessageId, ... }` (data-only messages). */
function readPush(event: PushEvent): { envelope: Record<string, unknown>; data: PushData } | null {
  if (!event.data) return null;
  try {
    const envelope = event.data.json() as unknown;
    if (typeof envelope !== 'object' || envelope === null) return null;
    const env = envelope as Record<string, unknown>;
    const raw = typeof env.data === 'object' && env.data !== null ? env.data : env;
    return { envelope: env, data: raw as PushData };
  } catch {
    return null; // not JSON: not one of ours
  }
}

/** Only same-origin URLs inside the app's scope; anything else opens Home. */
function safeUrl(url: string | undefined): string {
  if (!url) return abs('#/');
  try {
    const u = new URL(url, BASE);
    if (u.origin === self.location.origin && u.pathname.startsWith(basePath)) return u.href;
  } catch {
    // fall through
  }
  return abs('#/');
}

async function windowClients(): Promise<readonly WindowClient[]> {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
}

/** A window of this app (matchAll also returns other pages on the same origin). */
const inScope = (c: Client) => new URL(c.url).pathname.startsWith(basePath);

const PING_TIMEOUT_MS = 1000;

/** Asks a window whether the app's foreground handler is wired there (it answers on the port). */
function isListening(client: WindowClient): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), PING_TIMEOUT_MS);
    channel.port1.onmessage = (e: MessageEvent) => {
      clearTimeout(timer);
      resolve(e.data === true);
    };
    client.postMessage({ type: 'PUSH_PING' }, [channel.port2]);
  });
}

async function handlePush(event: PushEvent): Promise<void> {
  const msg = readPush(event);
  if (!msg) return;
  const visible = (await windowClients()).filter(
    (c) => c.visibilityState === 'visible' && inScope(c)
  );
  const answers = await Promise.all(visible.map(isListening));
  const listening = visible.filter((_, i) => answers[i]);
  if (listening.length > 0) {
    // Foreground: hand it to the page's Firebase SDK (`onMessage`), in the SDK's own envelope.
    const payload = { ...msg.envelope, isFirebaseMessaging: true, messageType: 'push-received' };
    for (const client of listening) client.postMessage(payload);
    return;
  }
  const { title, body, url, tag, type } = msg.data;
  await self.registration.showNotification(title || 'HomeCare', {
    body: body ?? '',
    dir: 'rtl',
    lang: 'he',
    icon: abs('icons/icon-192.png'),
    badge: abs('icons/badge-96.png'),
    tag: tag || type || undefined,
    data: { url: safeUrl(url) }
  });
}

self.addEventListener('push', (event: PushEvent) => {
  event.waitUntil(handlePush(event));
});

async function openFromNotification(url: string): Promise<void> {
  const clients = await windowClients();
  const appWindow = clients.find(inScope);
  if (appWindow) {
    const focused = await appWindow.focus();
    try {
      await focused.navigate(url);
    } catch {
      // An uncontrolled client cannot be navigated: tell the page to route itself.
      focused.postMessage({ type: 'NAVIGATE', url });
    }
    return;
  }
  await self.clients.openWindow(url);
}

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const data = event.notification.data as { url?: string } | null;
  event.waitUntil(openFromNotification(safeUrl(data?.url)));
});
