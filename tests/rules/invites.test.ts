// owner: step 2.3 — invites/{code}: bearer-secret preview by code, never listable; created and
// revoked by members of the household only.

import { beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import {
  ALICE,
  BOB,
  CODE,
  EVE,
  HID,
  OLGA,
  OTHER_CODE,
  OTHER_HID,
  SPARE_CODE,
  as,
  inDays,
  inviteDoc,
  path,
  seed,
  seedTwoMemberHousehold,
  useRulesEnv
} from './factories';

const env = useRulesEnv();
const CODE_23 = 'InviteCodeShort00000001'; // 23 chars
const CODE_25 = 'InviteCodeLonger000000001'; // 25 chars

beforeEach(async () => {
  await seedTwoMemberHousehold(env());
  await seed(env(), async (db) => {
    await setDoc(doc(db, path.invite(CODE_23)), inviteDoc(HID, ALICE));
    await setDoc(doc(db, path.invite(CODE_25)), inviteDoc(HID, ALICE));
  });
});

describe('read', () => {
  it('allowed: any signed-in user gets an invite by its 24-char code (preview)', async () => {
    await assertSucceeds(getDoc(doc(as(env(), EVE), path.invite(CODE))));
    await assertSucceeds(getDoc(doc(as(env(), EVE), path.invite('NoSuchCode00000000000000'))));
  });
  it('denied: get with a code that is not 24 chars (23 / 25), even if the doc exists', async () => {
    await assertFails(getDoc(doc(as(env(), EVE), path.invite(CODE_23))));
    await assertFails(getDoc(doc(as(env(), ALICE), path.invite(CODE_25))));
  });
  it('denied: signed out', async () => {
    await assertFails(getDoc(doc(as(env(), null), path.invite(CODE))));
  });
  it('denied: listing invites (outsider and member, filtered or not)', async () => {
    await assertFails(getDocs(collection(as(env(), EVE), 'invites')));
    await assertFails(getDocs(collection(as(env(), ALICE), 'invites')));
    await assertFails(
      getDocs(query(collection(as(env(), ALICE), 'invites'), where('householdId', '==', HID)))
    );
  });
});

describe('create', () => {
  const create = (uid: string, code: string, overrides: Record<string, unknown> = {}) =>
    setDoc(doc(as(env(), uid), path.invite(code)), inviteDoc(HID, uid, overrides));

  it('allowed: a member creates an invite for their household (7 days max)', async () => {
    await assertSucceeds(create(BOB, SPARE_CODE, { expiresAt: inDays(7) }));
  });

  it('allowed: the createInvite batch (new invite + revoke old + household.invite)', async () => {
    const db = as(env(), ALICE);
    const expiresAt = inDays(6.9);
    const b = writeBatch(db);
    b.set(doc(db, path.invite(SPARE_CODE)), inviteDoc(HID, ALICE, { expiresAt }));
    b.update(doc(db, path.invite(CODE)), { revoked: true });
    b.update(doc(db, path.household()), { invite: { code: SPARE_CODE, expiresAt } });
    await assertSucceeds(b.commit());
  });

  it('denied: an outsider', async () => {
    await assertFails(setDoc(doc(as(env(), EVE), path.invite(SPARE_CODE)), inviteDoc(HID, EVE)));
  });
  it('denied: a member creating an invite for another household', async () => {
    await assertFails(
      setDoc(doc(as(env(), BOB), path.invite(SPARE_CODE)), inviteDoc(OTHER_HID, BOB))
    );
  });
  it("denied: overwriting another household's existing code", async () => {
    await assertFails(setDoc(doc(as(env(), BOB), path.invite(OTHER_CODE)), inviteDoc(HID, BOB)));
  });

  const invalid: Array<[string, Record<string, unknown>]> = [
    ['createdBy someone else', { createdBy: ALICE }],
    ['expiresAt beyond 7 days', { expiresAt: inDays(7.1) }],
    ['expiresAt in the past', { expiresAt: inDays(-1) }],
    ['revoked: true', { revoked: true }],
    ['client-side createdAt', { createdAt: Timestamp.fromMillis(Date.now()) }],
    ['memberCount 7', { memberCount: 7 }],
    ['empty householdName', { householdName: '' }],
    ['41-char inviterName', { inviterName: 'מ'.repeat(41) }],
    ['householdId with a slash', { householdId: `${HID}/members/x` }],
    ['an unknown extra key', { maxUses: 99 }],
    ['a stored code field', { code: SPARE_CODE }]
  ];
  for (const [label, overrides] of invalid) {
    it(`denied: ${label}`, async () => {
      await assertFails(create(BOB, SPARE_CODE, overrides));
    });
  }

  it('denied: a doc id that is not 24 base62 chars', async () => {
    await assertFails(create(BOB, 'InviteCodeShort00000002'));
    await assertFails(create(BOB, 'Invite-Code-Has-Dashes!!'));
  });
});

describe('update / delete', () => {
  it('allowed: a member revokes', async () => {
    await assertSucceeds(updateDoc(doc(as(env(), BOB), path.invite(CODE)), { revoked: true }));
  });
  it('denied: un-revoking', async () => {
    await seed(env(), (db) => updateDoc(doc(db, path.invite(CODE)), { revoked: true }));
    await assertFails(updateDoc(doc(as(env(), BOB), path.invite(CODE)), { revoked: false }));
  });
  it('denied: extending expiresAt or changing householdId alongside revoke', async () => {
    const ref = doc(as(env(), BOB), path.invite(CODE));
    await assertFails(updateDoc(ref, { expiresAt: inDays(7) }));
    await assertFails(updateDoc(ref, { revoked: true, householdId: OTHER_HID }));
    await assertFails(updateDoc(ref, { revoked: true, createdAt: serverTimestamp() }));
  });
  it('denied: outsider or another household revoking', async () => {
    await assertFails(updateDoc(doc(as(env(), EVE), path.invite(CODE)), { revoked: true }));
    await assertFails(updateDoc(doc(as(env(), OLGA), path.invite(CODE)), { revoked: true }));
  });
  it('denied: delete (member and outsider)', async () => {
    await assertFails(deleteDoc(doc(as(env(), ALICE), path.invite(CODE))));
    await assertFails(deleteDoc(doc(as(env(), EVE), path.invite(CODE))));
  });
});
