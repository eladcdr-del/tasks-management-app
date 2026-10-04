// owner: step 5.1. Web push on the client (Blueprint §9).
//
//   pushSupport()      'unsupported' | 'demo' | 'not-configured' | 'default' | 'granted' | 'denied'
//   enablePush()       permission prompt → (lazy) Firebase messaging → getToken on our SW →
//                      repo.registerDevice({ deviceId, householdId, token, userAgent })
//   refreshPush()      app start / household ready with permission already granted: the same,
//                      silently, writing the device doc only when the token or household changed
//                      (or the last write is a week old)
//   disablePush()      sign-out: unregisterDevice + delete the FCM token (best effort, bounded)
//   forgetPushRegistration()  the household was left: the next refresh registers again
//
// Foreground messages (the app is visible) arrive through Firebase's onMessage and are shown as a
// snackbar with an "open" action. The Firebase messaging SDK is only ever loaded by the dynamic
// import below, so demo / setup users and the entry chunk never carry it.

import type { FirebaseApp } from 'firebase/app';
import type { Repository } from '$lib/data/repository';
import {
  configLooksComplete,
  safeLocalStorage,
  type AppMode,
  type StorageLike
} from '$lib/data/select';
import { deviceId as newDeviceId } from '$lib/domain/ids';
import { he } from '$lib/i18n/he';
import { router } from '$lib/router/router.svelte';
import { session } from '$lib/state/session.svelte';
import { ui } from '$lib/state/ui.svelte';
import { firebaseConfig, vapidKey as configVapidKey } from '../../../firebase-config';
import type { ForegroundMessage } from '$lib/data/firebase/messaging';

export type PushSupport =
  'unsupported' | 'demo' | 'not-configured' | 'default' | 'granted' | 'denied';

export type EnableResult = 'enabled' | 'denied' | 'default' | 'unavailable' | 'error';

export const DEVICE_ID_KEY = 'homecare.deviceId';
/** `${householdId}|${token}|${writtenAtMs}` of the last successful registerDevice. */
export const PUSH_REG_KEY = 'homecare.pushReg';
const REWRITE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const DISABLE_TIMEOUT_MS = 4000;

type MessagingModule = typeof import('$lib/data/firebase/messaging');

/** Everything push needs from the outside world (tests pass fakes). */
export interface PushDeps {
  mode: AppMode | null;
  repo: Repository | null;
  householdId: string | null;
  config: unknown;
  vapidKey: string;
  win: (Window & typeof globalThis) | null;
  storage: StorageLike | null;
  loadMessaging: () => Promise<MessagingModule>;
  /** The active SW registration (navigator.serviceWorker.ready). */
  swReady: () => Promise<ServiceWorkerRegistration>;
  now: () => number;
  onForeground: (msg: ForegroundMessage) => void;
}

function defaultDeps(): PushDeps {
  const win = typeof window === 'undefined' ? null : window;
  return {
    mode: session.mode,
    repo: session.repo,
    householdId: session.householdId,
    config: firebaseConfig,
    vapidKey: configVapidKey,
    win,
    storage: safeLocalStorage(win),
    loadMessaging: () => import('$lib/data/firebase/messaging'),
    swReady: () => navigator.serviceWorker.ready,
    now: () => Date.now(),
    onForeground: showForeground
  };
}

const withDefaults = (deps: Partial<PushDeps>): PushDeps => ({ ...defaultDeps(), ...deps });

/** Whether this browser can do web push at all (Notification + service worker + PushManager). */
function browserSupports(win: PushDeps['win']): boolean {
  return (
    win !== null &&
    'Notification' in win &&
    'serviceWorker' in win.navigator &&
    'PushManager' in win &&
    win.isSecureContext !== false
  );
}

export function pushSupport(deps: Partial<PushDeps> = {}): PushSupport {
  const d = withDefaults(deps);
  if (d.mode === 'demo') return 'demo';
  if (d.mode === 'setup' || !configLooksComplete(d.config)) return 'not-configured';
  if (!browserSupports(d.win)) return 'unsupported';
  const perm = d.win!.Notification.permission;
  return perm === 'granted' ? 'granted' : perm === 'denied' ? 'denied' : 'default';
}

/** This install's device id (a UUID kept in localStorage; a fresh one if storage is blocked). */
export function getDeviceId(storage: StorageLike | null = safeLocalStorage()): string {
  try {
    const existing = storage?.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
  } catch {
    // blocked storage: fall through
  }
  const id = newDeviceId();
  try {
    storage?.setItem(DEVICE_ID_KEY, id);
  } catch {
    // ignore
  }
  return id;
}

function firebaseApp(repo: Repository | null): FirebaseApp | null {
  if (repo?.kind !== 'firebase') return null;
  const app = (repo as { app?: unknown }).app;
  return app ? (app as FirebaseApp) : null;
}

function readReg(storage: StorageLike | null): { hid: string; token: string; at: number } | null {
  try {
    const raw = storage?.getItem(PUSH_REG_KEY);
    if (!raw) return null;
    const [hid, token, at] = raw.split('|');
    if (!hid || !token || !at) return null;
    return { hid, token, at: Number(at) };
  } catch {
    return null;
  }
}

function writeReg(storage: StorageLike | null, value: string | null): void {
  try {
    if (value === null) storage?.removeItem(PUSH_REG_KEY);
    else storage?.setItem(PUSH_REG_KEY, value);
  } catch {
    // ignore
  }
}

let foregroundFor: FirebaseApp | null = null;

/** Gets the token and writes the device doc (when needed). Throws on failure. */
async function register(d: PushDeps, force: boolean): Promise<boolean> {
  const app = firebaseApp(d.repo);
  const repo = d.repo;
  const hid = d.householdId;
  if (!app || !repo || !hid) return false;
  const [messaging, registration] = await Promise.all([d.loadMessaging(), d.swReady()]);
  const token = await messaging.getPushToken(app, registration, d.vapidKey || undefined);
  if (!token) return false;
  if (foregroundFor !== app) {
    foregroundFor = app;
    void messaging.onForegroundMessage(app, d.onForeground);
  }
  const prev = readReg(d.storage);
  const fresh =
    prev !== null &&
    prev.hid === hid &&
    prev.token === token &&
    d.now() - prev.at < REWRITE_AFTER_MS;
  if (fresh && !force) return true;
  await repo.registerDevice({
    deviceId: getDeviceId(d.storage),
    householdId: hid,
    token,
    userAgent: d.win?.navigator.userAgent ?? ''
  });
  writeReg(d.storage, `${hid}|${token}|${d.now()}`);
  return true;
}

/**
 * "הפעלת התראות": asks for permission (must run inside the tap), then registers this device.
 * Never rejects.
 */
export async function enablePush(deps: Partial<PushDeps> = {}): Promise<EnableResult> {
  const d = withDefaults(deps);
  const support = pushSupport(d);
  if (support === 'demo' || support === 'not-configured' || support === 'unsupported') {
    return 'unavailable';
  }
  let perm: NotificationPermission;
  try {
    perm = await d.win!.Notification.requestPermission();
  } catch {
    return 'error';
  }
  if (perm !== 'granted') return perm;
  try {
    return (await register(d, true)) ? 'enabled' : 'error';
  } catch (e) {
    console.warn('[homecare] push registration failed', e);
    return 'error';
  }
}

/** App start / household ready: refresh the token silently when permission is already granted. */
export async function refreshPush(deps: Partial<PushDeps> = {}): Promise<void> {
  const d = withDefaults(deps);
  if (pushSupport(d) !== 'granted') return;
  try {
    await register(d, false);
  } catch (e) {
    console.warn('[homecare] push refresh failed', e);
  }
}

/** The household was left (its device docs are deleted by the repository): register anew later. */
export function forgetPushRegistration(storage: StorageLike | null = safeLocalStorage()): void {
  writeReg(storage, null);
}

/** Sign-out: removes this device's doc and FCM token. Best effort, bounded; never rejects. */
export async function disablePush(deps: Partial<PushDeps> = {}): Promise<void> {
  const d = withDefaults(deps);
  const registered = readReg(d.storage) !== null;
  writeReg(d.storage, null);
  const app = firebaseApp(d.repo);
  if (!registered || !app || !d.repo) return;
  const repo = d.repo;
  const work = (async () => {
    await repo.unregisterDevice(getDeviceId(d.storage)).catch(() => {});
    const messaging = await d.loadMessaging();
    await messaging.deletePushToken(app).catch(() => {});
  })();
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, DISABLE_TIMEOUT_MS))]);
}

/** In-app hash for a notification URL (same app), e.g. `#/task/abc`; null when foreign. */
export function appHash(url: string | undefined, base: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, base);
    const b = new URL(base);
    if (u.origin !== b.origin || !u.pathname.startsWith(b.pathname)) return null;
    return u.hash.startsWith('#/') ? u.hash : '#/';
  } catch {
    return null;
  }
}

function showForeground(msg: ForegroundMessage): void {
  const text = [msg.title, msg.body].filter(Boolean).join(' · ');
  if (!text) return;
  const hash = appHash(msg.url, new URL('./', document.baseURI).href);
  ui.show(
    text,
    hash && hash !== '#/'
      ? { action: he.notifications.open, onAction: () => router.navigate(hash) }
      : {}
  );
}

/**
 * Page side of the SW's notificationclick fallback: an uncontrolled window cannot be navigated by
 * the SW, so it posts { type: 'NAVIGATE', url }. Returns an unsubscribe.
 */
export function listenForSwNavigation(win: Window = window): () => void {
  const sw = win.navigator.serviceWorker as ServiceWorkerContainer | undefined;
  if (!sw) return () => {};
  const onMessage = (e: MessageEvent) => {
    const data = e.data as { type?: unknown; url?: unknown } | null;
    if (data?.type !== 'NAVIGATE' || typeof data.url !== 'string') return;
    const hash = appHash(data.url, new URL('./', win.document.baseURI).href);
    if (hash) router.navigate(hash);
  };
  sw.addEventListener('message', onMessage);
  return () => sw.removeEventListener('message', onMessage);
}
