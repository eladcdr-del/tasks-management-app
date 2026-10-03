// PLACEHOLDER — replaced by step 2.2
//
// The Firebase adapter's frozen entry point (.god-mode/logs/decisions.md). Step 2.4 codes against
// these signatures through a lazy `await import('$lib/data/firebase')` (src/lib/data/select.ts);
// this file exists only so the build resolves that module until step 2.2 lands the real adapter.

import type { Repository } from '../repository';

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId: string;
  appId: string;
}

export interface FirebaseExtras {
  signInWithTestCredential(uid: string, displayName: string, email?: string): Promise<void>;
  app: unknown;
  firestore: unknown;
  auth: unknown;
  dispose(): Promise<void>;
}

export function firebaseConfigLooksComplete(cfg: unknown): cfg is FirebaseWebConfig {
  void cfg;
  throw new Error('firebase adapter not built yet');
}

export async function createFirebaseRepository(
  cfg: FirebaseWebConfig,
  opts?: { emulator?: { host: string; firestorePort: number; authPort: number } }
): Promise<Repository & FirebaseExtras> {
  void cfg;
  void opts;
  throw new Error('firebase adapter not built yet');
}
