// Firebase initialization (owner step 2.2): app, Firestore with a persistent offline cache, Auth
// (Google's sign-in resolver only while nobody is signed in, see initAuth), and the emulators in
// test/E2E mode. Called only
// from createFirebaseRepositoryImpl; no top-level side effects.

import { deleteApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
  type FirestoreLocalCache
} from 'firebase/firestore';
import { hasSignedInHint } from './auth';
import type { FirebaseRepoOptions, FirebaseWebConfig } from './index';

export interface FirebaseHandles {
  app: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
  /** Set when connected to the emulators (enables signInWithTestCredential). */
  emulator: FirebaseRepoOptions['emulator'] | null;
  /** 'persistent' (IndexedDB, multi-tab) or 'memory' (no IndexedDB: Node, some private modes). */
  cache: 'persistent' | 'memory';
}

let warnedMemory = false;

/**
 * The local cache: IndexedDB-backed and shared between tabs when IndexedDB exists, otherwise in
 * memory. If IndexedDB exists but cannot be opened (Firefox private mode, quota, a newer schema in
 * another tab), the SDK itself falls back to the memory cache at start-up and logs
 * "Error using user provided cache. Falling back to memory cache" — the app keeps working online.
 */
function chooseCache(): { cache: FirestoreLocalCache; kind: FirebaseHandles['cache'] } {
  if (typeof indexedDB !== 'undefined') {
    try {
      return {
        cache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        kind: 'persistent'
      };
    } catch (e) {
      if (!warnedMemory) console.warn('[firebase] offline cache unavailable, using memory', e);
      warnedMemory = true;
    }
  }
  return { cache: memoryLocalCache(), kind: 'memory' };
}

/**
 * Auth, with Google's popup/redirect resolver only while nobody is signed in on this device.
 * With the resolver, mobile browsers make the launch wait for Google's sign-in script
 * (apis.google.com) and iframe before reporting the stored user: on a weak connection a signed-in
 * member would stare at the splash, so a signed-in device (auth.ts hint) starts without it and the
 * resolver is passed only where it is needed (auth.ts: the sign-in itself, a redirect this tab
 * started). On the welcome screen the same warm-up is what lets the first tap open Google's popup
 * at once (it opens only after the script loads). Never with the emulators: they sign in with a
 * test credential. The stored user lives in IndexedDB (localStorage as the fallback).
 */
function initAuth(app: FirebaseApp, warmSignIn: boolean): Auth {
  try {
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      ...(warmSignIn ? { popupRedirectResolver: browserPopupRedirectResolver } : {})
    });
  } catch {
    // Already initialized for this app (HMR, tests): reuse it.
    return getAuth(app);
  }
}

/**
 * Initializes (or, after HMR / in tests, reuses) the default app. Firestore settings can only be
 * applied once per app, so a second call reuses the running instance; emulator connections that
 * are already made are left alone.
 */
export function initFirebase(cfg: FirebaseWebConfig, opts: FirebaseRepoOptions): FirebaseHandles {
  const existing = getApps().find((a) => a.name === '[DEFAULT]');
  const app = existing ?? initializeApp(cfg);

  const { cache, kind } = chooseCache();
  let firestore: Firestore;
  let fresh = true;
  try {
    firestore = initializeFirestore(app, { localCache: cache });
  } catch {
    // Already initialized for this app (HMR): reuse it with the settings it was started with.
    firestore = getFirestore(app);
    fresh = false;
  }

  const emu = opts.emulator ?? null;
  const auth = initAuth(app, !emu && !hasSignedInHint());
  if (emu) {
    if (fresh) {
      try {
        connectFirestoreEmulator(firestore, emu.host, emu.firestorePort);
      } catch (e) {
        console.warn('[firebase] could not connect the Firestore emulator', e);
      }
    }
    if (!auth.emulatorConfig) {
      connectAuthEmulator(auth, `http://${emu.host}:${emu.authPort}`, { disableWarnings: true });
    }
  }
  if (kind === 'memory' && !emu && !warnedMemory) {
    warnedMemory = true;
    console.warn('[firebase] IndexedDB is unavailable: changes are kept in memory only');
  }
  return { app, firestore, auth, emulator: emu, cache: kind };
}

/** Tears the app down (terminates Firestore and Auth). Safe to call twice. */
export async function disposeFirebase(h: FirebaseHandles): Promise<void> {
  try {
    await deleteApp(h.app);
  } catch {
    // already deleted
  }
}
