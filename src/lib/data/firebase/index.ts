// The Firebase adapter's entry point (Blueprint §5 "Adapter selection", owner step 2.2).
//
// FROZEN SHAPE: the state layer (2.4) imports exactly these names. This file must stay free of
// Firebase SDK imports (type-only imports are erased): the SDK is loaded by the dynamic import in
// `createFirebaseRepository`, so demo and setup users never download it, whether this file is
// imported statically or lazily. No top-level side effects anywhere in this folder.

import type { Repository } from '../repository';

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId: string;
  appId: string;
}

const REQUIRED_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId', 'messagingSenderId'] as const;

/** True when apiKey, authDomain, projectId, appId and messagingSenderId are all non-empty strings. */
export function firebaseConfigLooksComplete(
  cfg: Partial<FirebaseWebConfig> | undefined | null
): cfg is FirebaseWebConfig {
  if (!cfg || typeof cfg !== 'object') return false;
  return REQUIRED_KEYS.every((k) => {
    const v = cfg[k];
    return typeof v === 'string' && v.trim().length > 0;
  });
}

export interface FirebaseRepoOptions {
  emulator?: { host: string; firestorePort: number; authPort: number };
}

export interface FirebaseExtras {
  /** Emulator/test only: sign in with a fake Google credential. Throws outside emulator mode. */
  signInWithTestCredential(uid: string, displayName: string, email?: string): Promise<void>;
  /** The initialized app + firestore + auth, for 5.1 messaging and debugging. */
  readonly app: unknown;
  readonly firestore: unknown;
  readonly auth: unknown;
  dispose(): Promise<void>;
}

/**
 * Initializes Firebase (persistent offline cache, Google auth; the emulators when `opts.emulator`)
 * and returns the Repository. Loads the SDK on first call (a separate chunk).
 */
export async function createFirebaseRepository(
  cfg: FirebaseWebConfig,
  opts: FirebaseRepoOptions = {}
): Promise<Repository & FirebaseExtras> {
  const { createFirebaseRepositoryImpl } = await import('./firebaseRepository');
  return createFirebaseRepositoryImpl(cfg, opts);
}
