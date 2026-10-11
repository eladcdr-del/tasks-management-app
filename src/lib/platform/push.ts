// owner: step 5.1. Web push on the client (Blueprint §9).
//
//   pushSupport()      'unsupported' | 'demo' | 'not-configured' | 'default' | 'granted' | 'denied'
//   pushStatus()       the same, with 'unregistered' for a granted permission whose device
//                      registration for this household has not succeeded (Settings)
//   enablePush()       permission prompt → (lazy) Firebase messaging → getToken on our SW →
//                      repo.registerDevice({ deviceId, householdId, token, userAgent })
//   refreshPush()      app start / household ready with permission already granted: the same,
//                      silently, writing the device doc only when the token or household changed
//                      (or the last write is a week old); blocked or reset, it forgets the
//                      registration so that allowing again writes the device doc afresh
//   disablePush()      sign-out: unregisterDevice + delete the FCM token (best effort, bounded)
//   forgetPushRegistration()  the household was left: the next refresh registers again
//   watchPushPermission()     permission re-allowed while the app is open: register right away
//   testPush()         "בדיקת התראות" (Settings): a notification shown by this phone at once, and a
//                      request for a real one from the notifier (repo.requestTestPush)
//   appPermissionMissing() / appPushPrompt()
//                      the installed app (Android WebAPK) has no notification permission of its
//                      own although push was turned on for this household in the Chrome tab (where
//                      onboarding asks), or it is the app's first launch: Settings and Home's banner
//                      then offer "אישור התראות" (enablePush, from the tap)
//
// Foreground messages (the app is visible) arrive through Firebase's onMessage and are shown as a
// snackbar with an "open" action. The SW hands a push to a visible window only when this page
// answers its PUSH_PING with "listening" (listenForSwMessages), so nothing is swallowed before
// onMessage is wired. The Firebase messaging SDK is only ever loaded by the dynamic import below,
// so demo / setup users and the entry chunk never carry it.

import type { FirebaseApp } from 'firebase/app';
import type { Repository } from '$lib/data/repository';
import {
  configLooksComplete,
  safeLocalStorage,
  type AppMode,
  type StorageLike
} from '$lib/data/select';
import { RepoError } from '$lib/data/repository';
import { deviceId as newDeviceId } from '$lib/domain/ids';
import { he } from '$lib/i18n/he';
import { router } from '$lib/router/router.svelte';
import { session } from '$lib/state/session.svelte';
import { ui } from '$lib/state/ui.svelte';
import { firebaseConfig, vapidKey as configVapidKey } from '../../../firebase-config';
import type { ForegroundMessage } from '$lib/data/firebase/messaging';

export type PushSupport =
  'unsupported' | 'demo' | 'not-configured' | 'default' | 'granted' | 'denied';

export type PushStatus = PushSupport | 'unregistered';

export type EnableResult = 'enabled' | 'denied' | 'default' | 'unavailable' | 'error';

export const DEVICE_ID_KEY = 'homecare.deviceId';
/** `${householdId}|${token}|${writtenAtMs}` of the last successful registerDevice. */
export const PUSH_REG_KEY = 'homecare.pushReg';
/**
 * The household whose registration refreshPush dropped because the permission here is not granted:
 * in the installed app that is the WebAPK without Android's own permission, so the app asks for it
 * (appPermissionMissing). Cleared by a new registration, by leaving the household and signing out.
 */
export const PUSH_DROPPED_KEY = 'homecare.pushDropped';
/** Set on the installed app's first launch (its banner may show once without a registration). */
export const APP_LAUNCHED_KEY = 'homecare.appLaunched';
/** When Home's installed-app banner was dismissed (epoch ms); it stays away APP_PROMPT_SNOOZE_MS. */
export const APP_PROMPT_DISMISSED_KEY = 'homecare.appPushPromptDismissed';
export const APP_PROMPT_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
/** The local test notification's tag ("בדיקת התראות"). */
export const TEST_LOCAL_TAG = 'homecare-test-local';
const REWRITE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const DISABLE_TIMEOUT_MS = 4000;
/** No active service worker by then (the dev server, a broken install): the local test fails. */
const SW_READY_TIMEOUT_MS = 5000;

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
  /** Running as the installed app (display-mode standalone), not in a browser tab. */
  standalone: () => boolean;
}

/** Stands in for blocked localStorage, so a session keeps one device id and knows it registered. */
const memoryStorage: StorageLike = (() => {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k)
  };
})();

const localStore = (win: PushDeps['win'] = typeof window === 'undefined' ? null : window) =>
  safeLocalStorage(win) ?? memoryStorage;

function defaultDeps(): PushDeps {
  const win = typeof window === 'undefined' ? null : window;
  return {
    mode: session.mode,
    repo: session.repo,
    householdId: session.householdId,
    config: firebaseConfig,
    vapidKey: configVapidKey,
    win,
    storage: localStore(win),
    loadMessaging: () => import('$lib/data/firebase/messaging'),
    swReady: () => navigator.serviceWorker.ready,
    now: () => Date.now(),
    onForeground: showForeground,
    standalone: () =>
      win?.matchMedia?.('(display-mode: standalone)').matches === true ||
      (win?.navigator as { standalone?: boolean } | undefined)?.standalone === true
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

/** This install's device id (a UUID kept in localStorage; per session if storage is blocked). */
export function getDeviceId(storage: StorageLike | null = localStore()): string {
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

function storageGet(storage: StorageLike | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function storageSet(storage: StorageLike | null, key: string, value: string | null): void {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch {
    // ignore
  }
}

const regListeners = new Set<() => void>();

/** A registration (or none). A new registration settles the dropped marker too. */
function writeReg(storage: StorageLike | null, value: string | null): void {
  storageSet(storage, PUSH_REG_KEY, value);
  if (value !== null) storageSet(storage, PUSH_DROPPED_KEY, null);
  for (const cb of regListeners) cb();
}

/** Calls `cb` whenever this device's registration record changes. Returns an unsubscribe. */
export function onPushRegistrationChange(cb: () => void): () => void {
  regListeners.add(cb);
  return () => {
    regListeners.delete(cb);
  };
}

/** Whether this device has registered for the current household (a token the notifier can use). */
export function pushRegistered(deps: Partial<PushDeps> = {}): boolean {
  const d = withDefaults(deps);
  return d.householdId !== null && readReg(d.storage)?.hid === d.householdId;
}

/** pushSupport(), except that 'granted' needs this device registered for the household too. */
export function pushStatus(deps: Partial<PushDeps> = {}): PushStatus {
  const d = withDefaults(deps);
  const support = pushSupport(d);
  return support === 'granted' && !pushRegistered(d) ? 'unregistered' : support;
}

let foregroundFor: FirebaseApp | null = null;
/** Firebase's onMessage is wired in this page: the SW may hand us pushes (see PUSH_PING). */
let foregroundReady = false;

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
    foregroundReady = false;
    messaging.onForegroundMessage(app, d.onForeground).then(
      () => {
        foregroundReady = foregroundFor === app;
      },
      () => {
        foregroundFor = null;
      }
    );
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
  const support = pushSupport(d);
  // Blocked or reset: the browser dropped its push subscription, so register afresh once allowed.
  // Which household it was for is kept: the installed app asks for its own permission then.
  const reg = readReg(d.storage);
  if ((support === 'denied' || support === 'default') && reg !== null) {
    storageSet(d.storage, PUSH_DROPPED_KEY, reg.hid);
    writeReg(d.storage, null);
  }
  if (support !== 'granted') return;
  try {
    await register(d, false);
  } catch (e) {
    console.warn('[homecare] push refresh failed', e);
  }
}

/** The household was left (its device docs are deleted by the repository): register anew later. */
export function forgetPushRegistration(storage: StorageLike | null = localStore()): void {
  storageSet(storage, PUSH_DROPPED_KEY, null);
  writeReg(storage, null);
}

/**
 * Notifications re-allowed (system or site settings) while the app is open: registers this device
 * when the app comes back to the foreground, or when the Permissions API reports the change,
 * without waiting for the next cold start (a block in between forgets the old registration, see
 * refreshPush). Loads nothing while registered or not allowed. Returns an unsubscribe.
 */
export function watchPushPermission(
  win: Window = window,
  deps: Partial<PushDeps> = {}
): () => void {
  const check = () => {
    if (win.document.visibilityState === 'hidden') return;
    if (pushSupport(deps) !== 'granted' || !pushRegistered(deps)) void refreshPush(deps);
  };
  win.document.addEventListener('visibilitychange', check);
  let status: PermissionStatus | null = null;
  let disposed = false;
  win.navigator.permissions
    ?.query({ name: 'notifications' })
    .then((s) => {
      if (disposed) return;
      status = s;
      s.addEventListener('change', check);
    })
    .catch(() => {});
  return () => {
    disposed = true;
    win.document.removeEventListener('visibilitychange', check);
    status?.removeEventListener('change', check);
  };
}

/** Sign-out: removes this device's doc and FCM token. Best effort, bounded; never rejects. */
export async function disablePush(deps: Partial<PushDeps> = {}): Promise<void> {
  const d = withDefaults(deps);
  const registered = readReg(d.storage) !== null;
  storageSet(d.storage, PUSH_DROPPED_KEY, null);
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

// ── "בדיקת התראות" ──────────────────────────────────────────────────────────────────────────────

export interface PushTestResult {
  /** A notification was shown on this phone right away (as the SW shows a push). */
  local: boolean;
  /** The notifier was asked (testPushAt): a real push reaches this device on its next run. */
  server: boolean;
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timed out')), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

/** Shows the local test notification through our SW, with the options the SW gives a push. */
async function showLocalTest(d: PushDeps): Promise<boolean> {
  try {
    const registration = await timeout(d.swReady(), SW_READY_TIMEOUT_MS);
    const base = registration.scope; // the app's base URL (the SW's scope)
    // A test shown earlier with this tag would be replaced silently: close it, so this one alerts.
    const earlier = await registration.getNotifications({ tag: TEST_LOCAL_TAG }).catch(() => []);
    for (const n of earlier) n.close();
    await registration.showNotification(he.notifications.test.localTitle, {
      body: he.notifications.test.localBody,
      dir: 'rtl',
      lang: 'he',
      icon: new URL('icons/icon-192.png', base).href,
      badge: new URL('icons/badge-96.png', base).href,
      tag: TEST_LOCAL_TAG,
      data: { url: new URL('#/settings', base).href }
    });
    return true;
  } catch (e) {
    console.warn('[homecare] the local test notification failed', e);
    return false;
  }
}

/** Asks the notifier for a push to this device, registering it first when needed. */
async function requestServerTest(d: PushDeps): Promise<boolean> {
  const repo = d.repo;
  if (!repo || d.householdId === null || pushSupport(d) !== 'granted') return false;
  try {
    if (!pushRegistered(d) && !(await register(d, true))) return false;
    const deviceId = getDeviceId(d.storage);
    try {
      await repo.requestTestPush(deviceId);
    } catch (e) {
      // The notifier dropped this device (a dead token), or its doc names another household:
      // register it again, then ask once more.
      const code = e instanceof RepoError ? e.code : null;
      if (code !== 'not-found' && code !== 'permission') throw e;
      if (!(await register(d, true))) return false;
      await repo.requestTestPush(deviceId);
    }
    return true;
  } catch (e) {
    console.warn('[homecare] the test push request failed', e);
    return false;
  }
}

/**
 * "בדיקת התראות": shows a notification from this phone at once and asks the notifier for a real one
 * (on its next run, within about 5 minutes). Both start together; never rejects.
 */
export async function testPush(deps: Partial<PushDeps> = {}): Promise<PushTestResult> {
  const d = withDefaults(deps);
  const [local, server] = await Promise.all([showLocalTest(d), requestServerTest(d)]);
  return { local, server };
}

// ── The installed app's own permission ──────────────────────────────────────────────────────────

export type AppPushPrompt = 'ask' | 'blocked';

/** Push is possible here but not allowed: 'ask' (never asked here) or 'blocked'; else null. */
function notAllowed(d: PushDeps): AppPushPrompt | null {
  const support = pushSupport(d);
  return support === 'default' ? 'ask' : support === 'denied' ? 'blocked' : null;
}

/**
 * The installed app runs without notification permission while this device turned push on for the
 * current household: it was allowed in the Chrome tab (onboarding asks there, right after the
 * install step), but Android never gave the installed app (WebAPK) its own permission, so its
 * notifications are dropped. 'ask': "אישור התראות" from a tap; 'blocked': the Android steps.
 */
export function appPermissionMissing(deps: Partial<PushDeps> = {}): AppPushPrompt | null {
  const d = withDefaults(deps);
  if (!d.standalone() || d.householdId === null) return null;
  const state = notAllowed(d);
  if (state === null) return null;
  const hadPush =
    readReg(d.storage)?.hid === d.householdId ||
    storageGet(d.storage, PUSH_DROPPED_KEY) === d.householdId;
  return hadPush ? state : null;
}

/** Storage → whether its installed app is on its first launch (decided once per page load). */
const firstLaunchOf = new WeakMap<StorageLike, boolean>();

/**
 * True during the installed app's first launch: the first page load in standalone mode that asks,
 * remembered in localStorage. Never true without real storage (it would be true on every launch).
 */
function firstAppLaunch(d: PushDeps): boolean {
  const storage = d.storage;
  if (!storage || storage === memoryStorage || !d.standalone()) return false;
  let first = firstLaunchOf.get(storage);
  if (first === undefined) {
    const before = storageGet(storage, APP_LAUNCHED_KEY);
    storageSet(storage, APP_LAUNCHED_KEY, String(d.now()));
    first = before === null && storageGet(storage, APP_LAUNCHED_KEY) !== null;
    firstLaunchOf.set(storage, first);
  }
  return first;
}

/**
 * Home's banner: appPermissionMissing(), or, on the installed app's first launch, any permission
 * not granted yet (onboarding asked in the tab, so this is the app's own first chance). Nothing for
 * APP_PROMPT_SNOOZE_MS after it was dismissed.
 */
export function appPushPrompt(deps: Partial<PushDeps> = {}): AppPushPrompt | null {
  const d = withDefaults(deps);
  if (!d.standalone() || d.householdId === null) return null;
  const first = firstAppLaunch(d); // decided now even when nothing shows, so it never comes later
  const dismissedAt = Number(storageGet(d.storage, APP_PROMPT_DISMISSED_KEY));
  if (dismissedAt > 0 && d.now() - dismissedAt < APP_PROMPT_SNOOZE_MS) return null;
  return appPermissionMissing(d) ?? (first ? notAllowed(d) : null);
}

/** Home's banner was dismissed: it stays away for a few days. */
export function dismissAppPushPrompt(deps: Partial<PushDeps> = {}): void {
  const d = withDefaults(deps);
  storageSet(d.storage, APP_PROMPT_DISMISSED_KEY, String(d.now()));
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
 * Page side of the SW's messages. Returns an unsubscribe.
 *   PUSH_PING   before handing a push to a visible window, the SW asks through a MessagePort
 *               whether our foreground handler is wired here; it shows the notification otherwise
 *   NAVIGATE    the notificationclick fallback: an uncontrolled window cannot be navigated by the
 *               SW, so it posts { type: 'NAVIGATE', url }
 */
export function listenForSwMessages(win: Window = window): () => void {
  const sw = win.navigator.serviceWorker as ServiceWorkerContainer | undefined;
  if (!sw) return () => {};
  const onMessage = (e: MessageEvent) => {
    const data = e.data as { type?: unknown; url?: unknown } | null;
    if (data?.type === 'PUSH_PING') {
      e.ports[0]?.postMessage(foregroundReady);
      return;
    }
    if (data?.type !== 'NAVIGATE' || typeof data.url !== 'string') return;
    const hash = appHash(data.url, new URL('./', win.document.baseURI).href);
    if (hash) router.navigate(hash);
  };
  sw.addEventListener('message', onMessage);
  return () => sw.removeEventListener('message', onMessage);
}
