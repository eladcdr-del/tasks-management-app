// owner: step 2.3 — users/{uid} and users/{uid}/devices/{deviceId} are owner-only; the notifier's
// households/{hid}/sent/{key} log has no client access at all.

import { beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc
} from 'firebase/firestore';
import {
  ALICE,
  BOB,
  EVE,
  HID,
  OTHER_HID,
  as,
  deviceDoc,
  path,
  seed,
  seedTwoMemberHousehold,
  userDoc,
  useRulesEnv
} from './factories';

const env = useRulesEnv();
const DEVICE = '3f2b8c1e-9d4a-4f6b-8a2e-1c7d5e9f0a3b';

beforeEach(async () => {
  await seedTwoMemberHousehold(env());
});

describe('users/{uid}', () => {
  it('allowed: own create (householdId of own household), get, update, delete', async () => {
    const ref = doc(as(env(), BOB), path.user(BOB));
    await assertSucceeds(setDoc(ref, userDoc(HID)));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(updateDoc(ref, { householdId: null }));
    await assertSucceeds(setDoc(ref, userDoc(HID))); // re-set: createdAt may be re-stamped to now
    await assertSucceeds(deleteDoc(ref));
  });
  it('allowed: a user with no household yet', async () => {
    await assertSucceeds(setDoc(doc(as(env(), EVE), path.user(EVE)), userDoc(null)));
  });
  it("denied: reading or writing someone else's user doc", async () => {
    await seed(env(), (db) => setDoc(doc(db, path.user(ALICE)), userDoc(HID)));
    const ref = doc(as(env(), EVE), path.user(ALICE));
    await assertFails(getDoc(ref));
    await assertFails(setDoc(ref, userDoc(null)));
    await assertFails(updateDoc(ref, { householdId: null }));
    await assertFails(deleteDoc(ref));
    await assertFails(getDoc(doc(as(env(), BOB), path.user(ALICE)))); // housemates too
  });
  it('denied: listing users', async () => {
    await assertFails(getDocs(collection(as(env(), ALICE), 'users')));
  });
  it('denied: householdId of a household the caller is not a member of', async () => {
    await assertFails(setDoc(doc(as(env(), EVE), path.user(EVE)), userDoc(HID)));
    await assertFails(setDoc(doc(as(env(), BOB), path.user(BOB)), userDoc(OTHER_HID)));
  });
  it('denied: extra keys, client createdAt, unsafe householdId', async () => {
    const ref = doc(as(env(), BOB), path.user(BOB));
    await assertFails(setDoc(ref, userDoc(HID, { isAdmin: true })));
    await assertFails(setDoc(ref, userDoc(HID, { createdAt: Timestamp.fromMillis(0) })));
    await assertFails(setDoc(ref, userDoc(`${HID}/members/x`)));
  });
});

describe('users/{uid}/devices/{deviceId}', () => {
  it('allowed: own register (create), refresh (update), get, list, unregister (delete)', async () => {
    const db = as(env(), BOB);
    const ref = doc(db, path.device(BOB, DEVICE));
    await assertSucceeds(setDoc(ref, deviceDoc(HID)));
    await assertSucceeds(
      updateDoc(ref, { token: 'fcm-token-rotated', updatedAt: serverTimestamp() })
    );
    await assertSucceeds(setDoc(ref, deviceDoc(HID))); // full re-set on refresh is fine too
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(getDocs(collection(db, `users/${BOB}/devices`)));
    await assertSucceeds(deleteDoc(ref));
  });
  it("denied: reading, listing or writing another user's devices", async () => {
    await seed(env(), (db) => setDoc(doc(db, path.device(ALICE, DEVICE)), deviceDoc(HID)));
    const db = as(env(), BOB);
    await assertFails(getDoc(doc(db, path.device(ALICE, DEVICE))));
    await assertFails(getDocs(collection(db, `users/${ALICE}/devices`)));
    await assertFails(setDoc(doc(db, path.device(ALICE, 'bob-device')), deviceDoc(HID)));
    await assertFails(deleteDoc(doc(db, path.device(ALICE, DEVICE))));
    await assertFails(getDoc(doc(as(env(), EVE), path.device(ALICE, DEVICE))));
  });
  it("denied: registering a device for a household the caller doesn't belong to", async () => {
    await assertFails(setDoc(doc(as(env(), EVE), path.device(EVE, DEVICE)), deviceDoc(HID)));
  });
  it('denied: invalid fields', async () => {
    const ref = doc(as(env(), BOB), path.device(BOB, DEVICE));
    await assertFails(setDoc(ref, deviceDoc(HID, { token: '' })));
    await assertFails(setDoc(ref, deviceDoc(HID, { token: 't'.repeat(4097) })));
    await assertFails(setDoc(ref, deviceDoc(HID, { userAgent: 'u'.repeat(513) })));
    await assertFails(setDoc(ref, deviceDoc(HID, { updatedAt: Timestamp.fromMillis(0) })));
    await assertFails(setDoc(ref, deviceDoc(HID, { deviceId: DEVICE })));
    await assertFails(setDoc(ref, deviceDoc(HID, { extra: 1 })));
  });
  it('denied: a device id over 64 chars', async () => {
    const ref = doc(as(env(), BOB), path.device(BOB, 'd'.repeat(65)));
    await assertFails(setDoc(ref, deviceDoc(HID)));
  });
});

describe('households/{hid}/sent/{key}: no client access', () => {
  beforeEach(async () => {
    await seed(env(), (db) =>
      setDoc(doc(db, path.sent('ev:1:bob')), { at: Timestamp.now(), expireAt: Timestamp.now() })
    );
  });
  it('the Admin SDK (rules bypassed) can write it; that is the only writer', async () => {
    await seed(env(), (db) =>
      setDoc(doc(db, path.sent('due:t1:2026-10-04:bob')), { at: 1, expireAt: 2 })
    );
  });
  for (const uid of [ALICE, BOB, EVE]) {
    it(`denied: get / list / create / update / delete as ${uid}`, async () => {
      const db = as(env(), uid);
      await assertFails(getDoc(doc(db, path.sent('ev:1:bob'))));
      await assertFails(getDocs(collection(db, `households/${HID}/sent`)));
      await assertFails(setDoc(doc(db, path.sent('ev:2:bob')), { at: 1, expireAt: 2 }));
      await assertFails(updateDoc(doc(db, path.sent('ev:1:bob')), { at: 3 }));
      await assertFails(deleteDoc(doc(db, path.sent('ev:1:bob'))));
    });
  }
  it('denied: signed out', async () => {
    await assertFails(getDoc(doc(as(env(), null), path.sent('ev:1:bob'))));
  });
});
