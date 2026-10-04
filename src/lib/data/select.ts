// Adapter selection (Blueprint §5 "Adapter selection"), step 2.4.
//
//   resolveMode(location, storage, config)  → which backend this page load uses (pure but for the
//                                             one storage write it owns: homecare.mode)
//   createRepository(resolution)            → the Repository for that mode (both adapters lazy)
//   exitDemo() / enterDemo()                → leave / enter the stored demo mode (full reload)
//
// Order (first match wins):
//   1. ?exit-demo=1   clears the stored mode, then resolution continues at 4. (never demo)
//   2. ?demo=1        demo; persists localStorage['homecare.mode']='demo'. &reset=1 reseeds,
//                     &as=<uid> acts as that member (both honoured in any demo resolution).
//   3. ?emulator=1    Firebase against the local emulators: ONLY in dev and E2E builds.
//   4. stored 'demo'  demo (with the "מצב תצוגה" banner).
//   5. firebase-config.ts complete (apiKey, authDomain, projectId, appId, messagingSenderId) → firebase.
//   6. otherwise      setup (#/setup explains how to connect Firebase and offers the demo).
//
// Both adapters are loaded with `import()`, so the initial chunk holds neither the demo seed nor
// the Firebase SDK; setup mode downloads nothing more.

import type { Repository } from './repository';
import type { DemoRepository, DemoRepositoryOptions } from './demo/demoRepository';
import { stripQueryParam } from '../router/router.svelte';
import { firebaseConfig } from '../../../firebase-config';

export type AppMode = 'demo' | 'emulator' | 'firebase' | 'setup';

export interface ModeResolution {
  mode: AppMode;
  /** Demo only: start from a fresh seed (`&reset=1`). */
  reset: boolean;
  /** Demo only: act as this member (`&as=dani`). */
  actAs?: string;
}

/** localStorage key holding the sticky mode. Only 'demo' is ever stored. */
export const MODE_STORAGE_KEY = 'homecare.mode';

/** Query params consumed at boot and stripped from the URL afterwards (reloads must not repeat them). */
export const CONSUMED_PARAMS = ['reset', 'as', 'exit-demo'] as const;

/** Relative link that enters the demo (Setup's "נסו את הדמו" may use it as a plain `<a href>`). */
export const DEMO_ENTRY_HREF = './?demo=1#/';

// ── Firebase entry point (structural; the real module is step 2.2's, loaded lazily) ──────────────

/** The public web config (firebase-config.ts). */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId: string;
  appId: string;
}

export interface EmulatorHosts {
  host: string;
  firestorePort: number;
  authPort: number;
}

/** What 2.4 needs beyond the Repository: the E2E sign-in hook. */
export interface FirebaseTestExtras {
  signInWithTestCredential(uid: string, displayName: string, email?: string): Promise<void>;
  dispose(): Promise<void>;
}

/** `$lib/data/firebase` as select.ts uses it (method syntax: tolerant of the real config type). */
export interface FirebaseModule {
  createFirebaseRepository(
    cfg: FirebaseWebConfig,
    opts?: { emulator?: EmulatorHosts }
  ): Promise<Repository & FirebaseTestExtras>;
}

/** The emulators `npm run test:e2e:emu` starts (firebase.json, project demo-homecare). */
export const EMULATOR_HOSTS: EmulatorHosts = {
  host: '127.0.0.1',
  firestorePort: 8080,
  authPort: 9099
};

/** Config for emulator mode: a `demo-*` project never reaches a real backend. */
export const EMULATOR_CONFIG: FirebaseWebConfig = {
  apiKey: 'demo-homecare-api-key',
  authDomain: 'demo-homecare.firebaseapp.com',
  projectId: 'demo-homecare',
  storageBucket: '',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000'
};

const REQUIRED_CONFIG_KEYS = [
  'apiKey',
  'authDomain',
  'projectId',
  'appId',
  'messagingSenderId'
] as const satisfies readonly (keyof FirebaseWebConfig)[];

/**
 * Whether firebase-config.ts has been filled in: the five required fields are non-empty strings.
 * Mirrors the adapter's `firebaseConfigLooksComplete` without importing it (that module pulls in the
 * Firebase SDK, which must stay out of the initial chunk).
 */
export function configLooksComplete(cfg: unknown): cfg is FirebaseWebConfig {
  if (typeof cfg !== 'object' || cfg === null) return false;
  const c = cfg as Record<string, unknown>;
  return REQUIRED_CONFIG_KEYS.every((k) => typeof c[k] === 'string' && c[k].trim().length > 0);
}

// ── Mode resolution ──────────────────────────────────────────────────────────────────────────────

/** The slice of Storage this module uses (tests pass a Map-backed fake; null = storage blocked). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ResolveOptions {
  /** Whether `?emulator=1` is honoured. Default: dev and E2E builds only. */
  allowEmulator?: boolean;
}

function storageGet(storage: StorageLike | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null; // storage blocked (private mode): behave as if nothing is stored
  }
}

function storageSet(storage: StorageLike | null, key: string, value: string | null): void {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch {
    // Storage blocked: the mode then lasts for this page load only.
  }
}

/** Implements the order in the file header. Writes only `homecare.mode`. */
export function resolveMode(
  location: { readonly search: string },
  storage: StorageLike | null,
  config: unknown,
  opts: ResolveOptions = {}
): ModeResolution {
  const q = new URLSearchParams(location.search);
  const allowEmulator =
    opts.allowEmulator ?? (import.meta.env.DEV || import.meta.env.VITE_E2E === '1');
  const demo = (): ModeResolution => {
    const as = q.get('as')?.trim();
    return { mode: 'demo', reset: q.get('reset') === '1', ...(as ? { actAs: as } : {}) };
  };

  const exiting = q.get('exit-demo') === '1';
  if (exiting) storageSet(storage, MODE_STORAGE_KEY, null);
  else if (q.get('demo') === '1') {
    storageSet(storage, MODE_STORAGE_KEY, 'demo');
    return demo();
  }
  if (q.get('emulator') === '1' && allowEmulator) return { mode: 'emulator', reset: false };
  if (!exiting && storageGet(storage, MODE_STORAGE_KEY) === 'demo') return demo();
  if (configLooksComplete(config)) return { mode: 'firebase', reset: false };
  return { mode: 'setup', reset: false };
}

// ── Repository creation ──────────────────────────────────────────────────────────────────────────

export interface CreateRepositoryDeps {
  /** The web config for firebase mode. Default: firebase-config.ts. */
  config?: unknown;
  /** Loads the Firebase adapter. Default: `import('$lib/data/firebase')`. */
  loadFirebase?: () => Promise<FirebaseModule>;
  /** Extra demo options (tests: `persistence: 'memory'`, a fixed `now`). */
  demoOptions?: Partial<DemoRepositoryOptions>;
  /** Window whose URL loses the consumed params. Default: the global window, when there is one. */
  win?: Window | null;
}

/**
 * Creates the Repository for a resolved mode. Demo: `createDemoRepository({ now: Date.now, reset })`
 * then `actAs`, after which `reset` / `as` are stripped from the URL so a reload neither reseeds nor
 * re-impersonates. Firebase / emulator: the adapter is imported lazily. Setup has no repository.
 */
export async function createRepository(
  resolution: ModeResolution,
  deps: CreateRepositoryDeps = {}
): Promise<Repository> {
  const win = deps.win !== undefined ? deps.win : typeof window === 'undefined' ? null : window;
  switch (resolution.mode) {
    case 'demo': {
      const { createDemoRepository } = await import('./demo/demoRepository');
      const repo = await createDemoRepository({
        now: () => Date.now(),
        reset: resolution.reset,
        ...deps.demoOptions
      });
      if (resolution.actAs) repo.actAs(resolution.actAs);
      if (win) for (const p of ['reset', 'as'] as const) stripQueryParam(p, win);
      return repo;
    }
    case 'emulator': {
      // Inlined build-time gate (same as the dev routes): production builds never get here.
      if (!(import.meta.env.DEV || import.meta.env.VITE_E2E === '1')) {
        throw new Error('emulator mode is only available in dev and E2E builds');
      }
      const mod = await (deps.loadFirebase ?? loadFirebaseModule)();
      return mod.createFirebaseRepository(EMULATOR_CONFIG, { emulator: EMULATOR_HOSTS });
    }
    case 'firebase': {
      const config = deps.config !== undefined ? deps.config : firebaseConfig;
      if (!configLooksComplete(config)) throw new Error('firebase-config.ts is incomplete');
      const mod = await (deps.loadFirebase ?? loadFirebaseModule)();
      return mod.createFirebaseRepository(config);
    }
    case 'setup':
      throw new Error('setup mode has no repository');
  }
}

/** The lazy Firebase import: its own chunk, fetched only in firebase / emulator mode. */
function loadFirebaseModule(): Promise<FirebaseModule> {
  return import('$lib/data/firebase');
}

// ── Mode-specific extras (type guards) ───────────────────────────────────────────────────────────

/** The demo adapter (actAs, resetDemo, simulateJoin, flush…). */
export function isDemoRepository(repo: Repository | null): repo is DemoRepository {
  return repo?.kind === 'demo' && typeof (repo as Partial<DemoRepository>).actAs === 'function';
}

/** A Firebase repository with the E2E credential hook (emulator mode). */
export function hasTestSignIn(
  repo: Repository | null
): repo is Repository & Pick<FirebaseTestExtras, 'signInWithTestCredential'> {
  return (
    repo?.kind === 'firebase' &&
    typeof (repo as Partial<FirebaseTestExtras>).signInWithTestCredential === 'function'
  );
}

// ── Entering / leaving the demo (full reloads: a fresh boot picks the new mode) ──────────────────

/** Reloads the page at `url` (same-document URL changes alone would not reboot the app). */
function reloadAt(win: Window, url: URL): void {
  win.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  win.location.reload();
}

/**
 * Leaves demo mode: forgets the stored mode and reloads at `#/` without the demo params. The next
 * boot lands on Firebase (welcome) when firebase-config.ts is filled in, else on #/setup. The demo's
 * data stays in IndexedDB for the next visit.
 */
export function exitDemo(win: Window = window): void {
  storageSet(safeLocalStorage(win), MODE_STORAGE_KEY, null);
  const url = new URL(win.location.href);
  for (const p of ['demo', 'emulator', ...CONSUMED_PARAMS]) url.searchParams.delete(p);
  url.hash = '#/';
  reloadAt(win, url);
}

/** Enters the demo (`?demo=1`, keeping its saved data) and reloads at `#/`. */
export function enterDemo(win: Window = window): void {
  const url = new URL(win.location.href);
  for (const p of ['emulator', ...CONSUMED_PARAMS]) url.searchParams.delete(p);
  url.searchParams.set('demo', '1');
  url.hash = '#/';
  reloadAt(win, url);
}

/** `window.localStorage`, or null where touching it throws (blocked storage). */
export function safeLocalStorage(
  win: Window | null = typeof window === 'undefined' ? null : window
): StorageLike | null {
  try {
    return win?.localStorage ?? null;
  } catch {
    return null;
  }
}
