// owner: step 2.2 — the shared Repository contract against the Firebase adapter, on the emulators
// with firestore.rules ENFORCED (firebase.json loads them): the same suite the demo adapter passes.
//
// One repository (and Firebase app) per test, disposed afterwards; users are fresh uids per test,
// so the shared emulator only needs clearing once per file. There is no injectable clock (server
// timestamps), so the suite skips its time-travel test; signInWithGoogle needs a popup, so the
// interactive sign-in test is skipped too.

import { beforeAll } from 'vitest';
import { runRepositoryContract } from '../contract/repositoryContract';
import { clearEmulators, createTestRepository } from './emulator';

beforeAll(async () => {
  await clearEmulators();
});

/** A readable display name for a contract uid such as `michal-x1y2z3-7`. */
const nameOf = (uid: string) => uid.split('-')[0] || uid;

runRepositoryContract(
  'firebase',
  async () => {
    const repo = await createTestRepository();
    return {
      repo,
      asUser: (uid: string) => repo.signInWithTestCredential(uid, nameOf(uid)),
      interactiveSignIn: false,
      cleanup: () => repo.dispose()
    };
  },
  { timeoutMs: 10_000 }
);
