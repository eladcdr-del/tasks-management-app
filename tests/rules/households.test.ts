// owner: step 2.3 — households/{hid}: founder create, member edits (name / jar / invite), protected
// membership fields, no delete.

import { beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  arrayUnion,
  deleteDoc,
  deleteField,
  doc,
  increment,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import {
  ALICE,
  BOB,
  EVE,
  HID,
  SPARE_CODE,
  as,
  founderBatch,
  householdDoc,
  inDays,
  jarDoc,
  memberDoc,
  path,
  seedHousehold,
  seedTwoMemberHousehold,
  treatDoc,
  useRulesEnv
} from './factories';

const env = useRulesEnv();
const NEW_HID = 'hhNew000000000000003';

describe('create (founder batch)', () => {
  it('allowed: self as sole member + own members doc (owner) in the same batch', async () => {
    await assertSucceeds(founderBatch(as(env(), EVE), EVE, NEW_HID).commit());
  });

  it('allowed: with a fresh jar and the users doc in the same batch', async () => {
    const db = as(env(), EVE);
    const household = householdDoc(EVE, { jar: jarDoc() });
    await assertSucceeds(founderBatch(db, EVE, NEW_HID, { household, user: true }).commit());
  });

  it('denied: household without the members doc in the same batch', async () => {
    await assertFails(founderBatch(as(env(), EVE), EVE, NEW_HID, { member: null }).commit());
  });

  it('denied: members doc first, household afterwards (not atomic)', async () => {
    const db = as(env(), EVE);
    await assertFails(setDoc(doc(db, path.member(EVE, NEW_HID)), memberDoc('owner')));
  });

  const badHouseholds: Array<[string, Record<string, unknown>]> = [
    ['another uid as a member', { memberIds: [EVE, BOB], memberCount: 2 }],
    ['only another uid as member', { memberIds: [BOB] }],
    ['memberCount 2', { memberCount: 2 }],
    ['maxMembers 10', { maxMembers: 10 }],
    ['createdBy someone else', { createdBy: BOB }],
    ['an invite already set', { invite: { code: SPARE_CODE, expiresAt: inDays(3) } }],
    ['a pre-filled jar (count 9)', { jar: jarDoc({ count: 9 }) }],
    ['a jar in round 3', { jar: jarDoc({ round: 3 }) }],
    ['a jar with target 2', { jar: jarDoc({ target: 2 }) }],
    ['a client-side createdAt', { createdAt: Timestamp.fromMillis(Date.now()) }],
    ['an empty name', { name: '' }],
    ['a 61-char name', { name: 'א'.repeat(61) }],
    ['an unknown extra key', { plan: 'pro' }]
  ];
  for (const [label, overrides] of badHouseholds) {
    it(`denied: ${label}`, async () => {
      const db = as(env(), EVE);
      const household = householdDoc(EVE, overrides);
      await assertFails(founderBatch(db, EVE, NEW_HID, { household }).commit());
    });
  }

  it('denied: founder members doc with role member / an invite code', async () => {
    const db = as(env(), EVE);
    await assertFails(
      founderBatch(db, EVE, NEW_HID, { member: memberDoc('member', SPARE_CODE) }).commit()
    );
    await assertFails(
      founderBatch(db, EVE, NEW_HID, { member: memberDoc('owner', SPARE_CODE) }).commit()
    );
  });

  it('denied: signed out', async () => {
    await assertFails(founderBatch(as(env(), null), 'anon', NEW_HID).commit());
  });

  it('denied: "creating" an existing household id is an update and fails', async () => {
    await seedHousehold(env());
    await assertFails(founderBatch(as(env(), EVE), EVE, HID).commit());
  });
});

describe('member edit', () => {
  beforeEach(async () => {
    await seedTwoMemberHousehold(env());
  });

  it('allowed: rename', async () => {
    await assertSucceeds(updateDoc(doc(as(env(), BOB), path.household()), { name: 'בית חדש' }));
  });
  it('denied: rename to 61 chars / empty', async () => {
    const ref = doc(as(env(), BOB), path.household());
    await assertFails(updateDoc(ref, { name: 'א'.repeat(61) }));
    await assertFails(updateDoc(ref, { name: '' }));
  });
  it('denied: rename by an outsider', async () => {
    await assertFails(updateDoc(doc(as(env(), EVE), path.household()), { name: 'x' }));
  });

  it('allowed: set and clear the active invite', async () => {
    const ref = doc(as(env(), BOB), path.household());
    await assertSucceeds(updateDoc(ref, { invite: { code: SPARE_CODE, expiresAt: inDays(7) } }));
    await assertSucceeds(updateDoc(ref, { invite: null }));
  });
  it('denied: invite expiring in 8 days, already expired, or with a short code', async () => {
    const ref = doc(as(env(), BOB), path.household());
    await assertFails(updateDoc(ref, { invite: { code: SPARE_CODE, expiresAt: inDays(8) } }));
    await assertFails(updateDoc(ref, { invite: { code: SPARE_CODE, expiresAt: inDays(-1) } }));
    await assertFails(updateDoc(ref, { invite: { code: 'short', expiresAt: inDays(3) } }));
  });

  it('denied: a member cannot alter memberIds / memberCount / maxMembers / createdBy', async () => {
    const ref = doc(as(env(), BOB), path.household());
    await assertFails(updateDoc(ref, { memberIds: arrayUnion(EVE), memberCount: increment(1) }));
    await assertFails(updateDoc(ref, { memberIds: [BOB, ALICE] })); // reorder
    await assertFails(updateDoc(ref, { memberIds: [ALICE, BOB, BOB], memberCount: 3 }));
    await assertFails(updateDoc(ref, { memberCount: 1 }));
    await assertFails(updateDoc(ref, { maxMembers: 50 }));
    await assertFails(updateDoc(ref, { createdBy: BOB }));
    await assertFails(updateDoc(ref, { createdAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { extra: true }));
    await assertFails(updateDoc(ref, { name: 'ok', memberCount: 6 }));
  });

  it('denied: deleting the household (member and owner)', async () => {
    await assertFails(deleteDoc(doc(as(env(), BOB), path.household())));
    await assertFails(deleteDoc(doc(as(env(), ALICE), path.household())));
  });
});

describe('jar transitions', () => {
  const jarRef = (uid: string) => doc(as(env(), uid), path.household());

  describe('with a jar at 7/10, round 1', () => {
    beforeEach(async () => {
      await seedTwoMemberHousehold(env());
    });

    it('allowed: +1 on completion (increment)', async () => {
      await assertSucceeds(updateDoc(jarRef(BOB), { 'jar.count': increment(1) }));
    });
    it('denied: +5 jump / +2', async () => {
      await assertFails(updateDoc(jarRef(BOB), { 'jar.count': increment(5) }));
      await assertFails(updateDoc(jarRef(BOB), { 'jar.count': 9 }));
    });
    it('allowed: -1 on reopen', async () => {
      await assertSucceeds(updateDoc(jarRef(BOB), { 'jar.count': increment(-1) }));
    });
    it('denied: -2', async () => {
      await assertFails(updateDoc(jarRef(BOB), { 'jar.count': 5 }));
    });
    it('allowed: edit treat and target (progress untouched)', async () => {
      await assertSucceeds(updateDoc(jarRef(BOB), { 'jar.treat': 'סרט', 'jar.target': 12 }));
    });
    it('denied: edit combined with a count change', async () => {
      await assertFails(updateDoc(jarRef(BOB), { 'jar.treat': 'סרט', 'jar.count': 8 }));
    });
    it('denied: target out of range (2, 51, 7.5) and bad treat', async () => {
      await assertFails(updateDoc(jarRef(BOB), { 'jar.target': 2 }));
      await assertFails(updateDoc(jarRef(BOB), { 'jar.target': 51 }));
      await assertFails(updateDoc(jarRef(BOB), { 'jar.target': 7.5 }));
      await assertFails(updateDoc(jarRef(BOB), { 'jar.treat': '' }));
      await assertFails(updateDoc(jarRef(BOB), { 'jar.treat': 'ת'.repeat(61) }));
    });
    it('denied: round or startedAt changed outside a redeem', async () => {
      await assertFails(updateDoc(jarRef(BOB), { 'jar.round': 2 }));
      await assertFails(updateDoc(jarRef(BOB), { 'jar.startedAt': serverTimestamp() }));
    });
    it('denied: redeem while not full', async () => {
      const db = as(env(), BOB);
      const b = writeBatch(db);
      b.set(doc(db, path.treat(1)), treatDoc());
      b.update(doc(db, path.household()), {
        'jar.count': increment(-10),
        'jar.round': increment(1),
        'jar.startedAt': serverTimestamp()
      });
      await assertFails(b.commit());
    });
    it('denied: removing the jar without remembering its round, or adding unknown jar keys', async () => {
      await assertFails(updateDoc(jarRef(BOB), { jar: null }));
      await assertFails(updateDoc(jarRef(BOB), { 'jar.bonus': 1 }));
      await assertFails(updateDoc(jarRef(BOB), { 'jar.startedAt': deleteField() }));
    });
    it('denied: an outsider incrementing the jar', async () => {
      await assertFails(updateDoc(jarRef(EVE), { 'jar.count': increment(1) }));
    });
  });

  describe('at the boundaries', () => {
    it('denied: reopen -1 when the count is already 0 (floor)', async () => {
      await seedTwoMemberHousehold(env(), { jar: jarDoc({ count: 0 }) });
      await assertFails(updateDoc(jarRef(BOB), { 'jar.count': increment(-1) }));
    });
    it('allowed: +1 past the target (surplus carries into the next round)', async () => {
      await seedTwoMemberHousehold(env(), { jar: jarDoc({ count: 10 }) });
      await assertSucceeds(updateDoc(jarRef(BOB), { 'jar.count': increment(1) }));
    });
  });

  describe('first setup', () => {
    beforeEach(async () => {
      await seedTwoMemberHousehold(env(), { jar: null });
    });
    it('allowed: null → fresh jar (count 0, round 1, startedAt now)', async () => {
      await assertSucceeds(updateDoc(jarRef(BOB), { jar: jarDoc() }));
    });
    it('denied: null → jar with count 5, round 2, client startedAt, or target 60', async () => {
      await assertFails(updateDoc(jarRef(BOB), { jar: jarDoc({ count: 5 }) }));
      await assertFails(updateDoc(jarRef(BOB), { jar: jarDoc({ round: 2 }) }));
      await assertFails(
        updateDoc(jarRef(BOB), { jar: jarDoc({ startedAt: Timestamp.fromMillis(0) }) })
      );
      await assertFails(updateDoc(jarRef(BOB), { jar: jarDoc({ target: 60 }) }));
    });
    it('denied: incrementing a null jar (adapter must skip the jar write)', async () => {
      await assertFails(updateDoc(jarRef(BOB), { 'jar.count': increment(1) }));
    });
  });
});
