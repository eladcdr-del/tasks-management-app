// Firebase initialization (owner step 2.2): app, Firestore with a persistent offline cache, Auth,
// and the emulators in test/E2E mode. Called only from createFirebaseRepositoryImpl; no top-level
// side effects.

import { deleteApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
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

  const auth = getAuth(app);
  const emu = opts.emulator ?? null;
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
