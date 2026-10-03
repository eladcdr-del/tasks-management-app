// owner: step 2.3 — joining with an invite code, leaving, and owner removal.

import { beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  arrayRemove,
  arrayUnion,
  deleteDoc,
  doc,
  getDoc,
  increment,
  setDoc,
  updateDoc,
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
  eventDoc,
  inDays,
  inviteDoc,
  joinBatch,
  leaveBatch,
  memberDoc,
  path,
  seed,
  seedHousehold,
  seedTwoMemberHousehold,
  userDoc,
  useRulesEnv
} from './factories';

const env = useRulesEnv();

describe('join', () => {
  beforeEach(async () => {
    await seedTwoMemberHousehold(env());
  });

  it('allowed: valid code (household update + members doc in one batch)', async () => {
    await assertSucceeds(joinBatch(as(env(), EVE), EVE).commit());
    // and the joiner can now read the household
    await assertSucceeds(getDoc(doc(as(env(), EVE), path.household())));
  });

  it('allowed: the full adapter batch (users doc + member_joined event)', async () => {
    await assertSucceeds(joinBatch(as(env(), EVE), EVE, { full: true }).commit());
  });

  it('allowed: explicit list/count values equal to arrayUnion/increment', async () => {
    const householdPatch = { memberIds: [ALICE, BOB, EVE], memberCount: 3 };
    await assertSucceeds(joinBatch(as(env(), EVE), EVE, { householdPatch }).commit());
  });

  it('denied: expired code', async () => {
    await seed(env(), (db) =>
      updateDoc(doc(db, path.invite(CODE)), { expiresAt: inDays(-1 / 24) })
    );
    await assertFails(joinBatch(as(env(), EVE), EVE).commit());
  });

  it('denied: revoked code', async () => {
    await seed(env(), (db) => updateDoc(doc(db, path.invite(CODE)), { revoked: true }));
    await assertFails(joinBatch(as(env(), EVE), EVE).commit());
  });

  it("denied: another household's code", async () => {
    await assertFails(joinBatch(as(env(), EVE), EVE, { code: OTHER_CODE }).commit());
  });

  it("denied: a valid, unrevoked code that is no longer the household's current invite", async () => {
    await seed(env(), (db) => setDoc(doc(db, path.invite(SPARE_CODE)), inviteDoc(HID, ALICE)));
    await assertFails(joinBatch(as(env(), EVE), EVE, { code: SPARE_CODE }).commit());
  });

  it('denied: a code that does not exist / is malformed / is null', async () => {
    const db = as(env(), EVE);
    await assertFails(joinBatch(db, EVE, { code: 'NoSuchCode00000000000000' }).commit());
    await assertFails(joinBatch(db, EVE, { member: memberDoc('member', 'short') }).commit());
    await assertFails(joinBatch(db, EVE, { member: memberDoc('member', null) }).commit());
  });

  it('denied: adding another uid (to memberIds, or creating their members doc)', async () => {
    const db = as(env(), EVE);
    const MALLORY = 'mallory-uid';
    // EVE appends MALLORY instead of herself
    await assertFails(
      joinBatch(db, EVE, {
        householdPatch: { memberIds: arrayUnion(MALLORY), memberCount: increment(1) }
      }).commit()
    );
    // EVE appends herself and MALLORY
    await assertFails(
      joinBatch(db, EVE, {
        householdPatch: { memberIds: arrayUnion(EVE, MALLORY), memberCount: increment(2) }
      }).commit()
    );
    // EVE writes MALLORY's members doc
    const b = writeBatch(db);
    b.update(doc(db, path.household()), {
      memberIds: arrayUnion(MALLORY),
      memberCount: increment(1)
    });
    b.set(doc(db, path.member(MALLORY)), memberDoc('member', CODE));
    await assertFails(b.commit());
  });

  it('denied: joiner swaps out an existing member, or reorders the list, while appending self', async () => {
    const db = as(env(), EVE);
    await assertFails(
      joinBatch(db, EVE, {
        householdPatch: { memberIds: [ALICE, EVE, 'mallory-uid'], memberCount: 3 }
      }).commit()
    );
    await assertFails(
      joinBatch(db, EVE, {
        householdPatch: { memberIds: [EVE, ALICE, BOB], memberCount: 3 }
      }).commit()
    );
  });

  it('denied: a member duplicating themself in memberIds (inflating memberCount)', async () => {
    await assertFails(
      updateDoc(doc(as(env(), BOB), path.household()), {
        memberIds: [ALICE, BOB, BOB],
        memberCount: 3
      })
    );
  });

  it('denied: household update without the members doc', async () => {
    await assertFails(joinBatch(as(env(), EVE), EVE, { skipMember: true }).commit());
  });

  it('denied: members doc without the household update', async () => {
    await assertFails(joinBatch(as(env(), EVE), EVE, { skipHousehold: true }).commit());
  });

  it('denied: joiner claims the owner role', async () => {
    await assertFails(
      joinBatch(as(env(), EVE), EVE, { member: memberDoc('owner', CODE) }).commit()
    );
  });

  it('denied: memberCount not matching memberIds, or changing other fields in the same write', async () => {
    const db = as(env(), EVE);
    await assertFails(
      joinBatch(db, EVE, {
        householdPatch: { memberIds: arrayUnion(EVE), memberCount: increment(2) }
      }).commit()
    );
    await assertFails(
      joinBatch(db, EVE, { householdPatch: { memberIds: arrayUnion(EVE) } }).commit()
    );
    await assertFails(
      joinBatch(db, EVE, {
        householdPatch: { memberIds: arrayUnion(EVE), memberCount: increment(1), name: 'שלי' }
      }).commit()
    );
    await assertFails(
      joinBatch(db, EVE, {
        householdPatch: { memberIds: arrayUnion(EVE), memberCount: increment(1), maxMembers: 7 }
      }).commit()
    );
  });

  it('denied: an existing member re-joining (duplicate entry)', async () => {
    const db = as(env(), BOB);
    await assertFails(
      joinBatch(db, BOB, {
        householdPatch: { memberIds: [ALICE, BOB, BOB], memberCount: 3 }
      }).commit()
    );
  });

  it('denied: invalid profile fields in the joiner members doc', async () => {
    const db = as(env(), EVE);
    await assertFails(
      joinBatch(db, EVE, { member: memberDoc('member', CODE, { color: 'pink' }) }).commit()
    );
    await assertFails(
      joinBatch(db, EVE, { member: memberDoc('member', CODE, { uid: EVE }) }).commit()
    );
  });

  it('denied: signed out', async () => {
    await assertFails(joinBatch(as(env(), null), 'anon').commit());
  });
});

describe('join capacity', () => {
  const FIVE = [ALICE, BOB, 'm3-uid', 'm4-uid', 'm5-uid'];

  it('allowed: the 6th member (5 → 6)', async () => {
    await seedHousehold(env(), { members: FIVE });
    await assertSucceeds(joinBatch(as(env(), EVE), EVE).commit());
  });

  it('denied: the 7th member when full (6)', async () => {
    await seedHousehold(env(), { members: [...FIVE, 'm6-uid'] });
    await assertFails(joinBatch(as(env(), EVE), EVE).commit());
  });
});

describe('leave (self)', () => {
  beforeEach(async () => {
    await seedTwoMemberHousehold(env());
    await seed(env(), (db) => setDoc(doc(db, path.user(BOB)), userDoc(HID)));
  });

  it('allowed: members doc deleted + memberIds -= self + users doc cleared, in one batch', async () => {
    await assertSucceeds(leaveBatch(as(env(), BOB), BOB).commit());
    await assertFails(getDoc(doc(as(env(), BOB), path.household())));
  });

  it('allowed: the founder/owner may leave too', async () => {
    await assertSucceeds(leaveBatch(as(env(), ALICE), ALICE).commit());
  });

  it('the founder, after leaving, cannot come back as owner without an invite', async () => {
    await assertSucceeds(leaveBatch(as(env(), ALICE), ALICE).commit());
    await assertFails(
      joinBatch(as(env(), ALICE), ALICE, { member: memberDoc('owner', null) }).commit()
    );
    await assertSucceeds(joinBatch(as(env(), ALICE), ALICE).commit()); // with the code, as member
  });

  it('denied: deleting the members doc without updating memberIds', async () => {
    await assertFails(deleteDoc(doc(as(env(), BOB), path.member(BOB))));
  });

  it('denied: removing self from memberIds but keeping the members doc', async () => {
    await assertFails(
      updateDoc(doc(as(env(), BOB), path.household()), {
        memberIds: arrayRemove(BOB),
        memberCount: increment(-1)
      })
    );
  });

  it('denied: a non-owner removing someone else', async () => {
    const db = as(env(), BOB);
    const b = writeBatch(db);
    b.delete(doc(db, path.member(ALICE)));
    b.update(doc(db, path.household()), {
      memberIds: arrayRemove(ALICE),
      memberCount: increment(-1),
      invite: null
    });
    await assertFails(b.commit());
  });

  it('allowed: leaving and clearing the active invite on the way out', async () => {
    const db = as(env(), BOB);
    const b = writeBatch(db);
    b.delete(doc(db, path.member(BOB)));
    b.update(doc(db, path.household()), {
      memberIds: arrayRemove(BOB),
      memberCount: increment(-1),
      invite: null
    });
    await assertSucceeds(b.commit());
  });

  it('denied: leaving while also renaming / installing a new invite in the same write', async () => {
    const db = as(env(), BOB);
    const b = writeBatch(db);
    b.delete(doc(db, path.member(BOB)));
    b.update(doc(db, path.household()), {
      memberIds: arrayRemove(BOB),
      memberCount: increment(-1),
      name: 'עזבתי'
    });
    await assertFails(b.commit());
    const c = writeBatch(db);
    c.delete(doc(db, path.member(BOB)));
    c.update(doc(db, path.household()), {
      memberIds: arrayRemove(BOB),
      memberCount: increment(-1),
      invite: { code: SPARE_CODE, expiresAt: inDays(7) }
    });
    await assertFails(c.commit());
  });

  it('denied: removing two uids at once', async () => {
    const db = as(env(), ALICE);
    const b = writeBatch(db);
    b.delete(doc(db, path.member(ALICE)));
    b.delete(doc(db, path.member(BOB)));
    b.update(doc(db, path.household()), { memberIds: [], memberCount: 0, invite: null });
    await assertFails(b.commit());
  });

  it('denied: an outsider deleting a members doc', async () => {
    await assertFails(deleteDoc(doc(as(env(), EVE), path.member(BOB))));
  });

  it('denied: deleting a non-existent members doc (no existence probe)', async () => {
    await assertFails(deleteDoc(doc(as(env(), EVE), path.member(EVE))));
  });
});

describe('last member leaving', () => {
  beforeEach(async () => {
    await seedHousehold(env(), { members: [ALICE] });
  });
  const lastLeave = (clearInvite: boolean) => {
    const db = as(env(), ALICE);
    const b = writeBatch(db);
    b.delete(doc(db, path.member(ALICE)));
    b.update(doc(db, path.household()), {
      memberIds: arrayRemove(ALICE),
      memberCount: increment(-1),
      ...(clearInvite ? { invite: null } : {})
    });
    return b;
  };
  it('allowed: when the active invite is cleared in the same write', async () => {
    await assertSucceeds(lastLeave(true).commit());
    await assertFails(joinBatch(as(env(), EVE), EVE).commit()); // the link is dead
  });
  it('denied: leaving an empty household behind with a live invite', async () => {
    await assertFails(lastLeave(false).commit());
  });
});

describe('owner removal', () => {
  beforeEach(async () => {
    await seedTwoMemberHousehold(env());
  });

  const removal = (by: string, target: string, opts: { clearInvite: boolean }) => {
    const db = as(env(), by);
    const b = writeBatch(db);
    b.delete(doc(db, path.member(target)));
    b.update(doc(db, path.household()), {
      memberIds: arrayRemove(target),
      memberCount: increment(-1),
      ...(opts.clearInvite ? { invite: null } : {})
    });
    if (opts.clearInvite) b.update(doc(db, path.invite(CODE)), { revoked: true });
    return b;
  };

  it('allowed: owner removes a member and rotates out the active invite', async () => {
    await assertSucceeds(removal(ALICE, BOB, { clearInvite: true }).commit());
    await assertFails(getDoc(doc(as(env(), BOB), path.household())));
  });

  it('denied: owner removal that keeps the active invite (the removed member knows it)', async () => {
    await assertFails(removal(ALICE, BOB, { clearInvite: false }).commit());
  });

  it('denied: a member removing the owner', async () => {
    await assertFails(removal(BOB, ALICE, { clearInvite: true }).commit());
  });

  it("denied: an owner of another household removing this household's member", async () => {
    await assertFails(removal(OLGA, BOB, { clearInvite: true }).commit());
  });

  it('a removed member cannot rejoin with the old code', async () => {
    await assertSucceeds(removal(ALICE, BOB, { clearInvite: true }).commit());
    await assertFails(joinBatch(as(env(), BOB), BOB).commit());
  });

  it('cross-household isolation: OTHER_HID untouched by HID members', async () => {
    await assertFails(
      updateDoc(doc(as(env(), ALICE), path.household(OTHER_HID)), {
        memberIds: arrayRemove(OLGA),
        memberCount: increment(-1)
      })
    );
  });

  it('a member_joined event cannot be forged by an outsider without joining', async () => {
    await assertFails(
      setDoc(doc(as(env(), EVE), path.event('fake-join')), eventDoc(EVE, 'member_joined'))
    );
  });
});
