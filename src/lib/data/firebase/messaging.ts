// owner: step 5.1. Firebase Cloud Messaging for the page (Blueprint §9). Loaded ONLY through the
// dynamic import in src/lib/platform/push.ts, so the messaging SDK never reaches the entry chunk.
//
// The service worker is our own (src/sw.ts, registered by UpdatePrompt): getToken subscribes it
// to push with the default VAPID key, or firebase-config.ts's `vapidKey` when Elad sets one.

import type { FirebaseApp } from 'firebase/app';
import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type Messaging
} from 'firebase/messaging';

/** Foreground message fields (the notifier sends data-only {type,title,body,url,tag}). */
export interface ForegroundMessage {
  type?: string;
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

let cached: { app: FirebaseApp; messaging: Messaging } | null = null;

async function messagingFor(app: FirebaseApp): Promise<Messaging | null> {
  if (cached?.app === app) return cached.messaging;
  if (!(await isSupported())) return null;
  cached = { app, messaging: getMessaging(app) };
  return cached.messaging;
}

/** Subscribes `registration` to FCM and returns the token, or null where FCM is unsupported. */
export async function getPushToken(
  app: FirebaseApp,
  registration: ServiceWorkerRegistration,
  vapidKey?: string
): Promise<string | null> {
  const messaging = await messagingFor(app);
  if (!messaging) return null;
  const token = await getToken(messaging, {
    serviceWorkerRegistration: registration,
    ...(vapidKey ? { vapidKey } : {})
  });
  return token || null;
}

/** Unsubscribes this browser from FCM (best effort). */
export async function deletePushToken(app: FirebaseApp): Promise<void> {
  const messaging = await messagingFor(app);
  if (messaging) await deleteToken(messaging);
}

/** Calls `cb` for messages that arrive while the app is visible. Returns an unsubscribe. */
export async function onForegroundMessage(
  app: FirebaseApp,
  cb: (msg: ForegroundMessage) => void
): Promise<() => void> {
  const messaging = await messagingFor(app);
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => cb((payload.data ?? {}) as ForegroundMessage));
}
