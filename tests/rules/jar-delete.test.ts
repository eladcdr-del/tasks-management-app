// Deleting the jar and earned treats (docs/firestore-schema.md "Deleting the jar"): the delete
// transition {jar: null, nextJarRound: <its round>}, a new jar starting exactly at nextJarRound (so
// treats/{round} never collide with the history), deleting a treat, and the PREVIOUS app version,
// which never deletes, reads a null jar as "no jar yet" and always sets a new jar up at round 1.

import { beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
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
  OLGA,
  as,
  completionDoc,
  eventDoc,
  jarDoc,
  path,
  seed,
  seedTask,
  seedTwoMemberHousehold,
  touched,
  treatDoc,
  useRulesEnv,
  type Doc
} from './factories';

const env = useRulesEnv();
const hh = (uid: string) => doc(as(env(), uid), path.household());
const treat = (uid: string, round: number | string) => doc(as(env(), uid), path.treat(round));

/** "Everyone does their part" in round 3 (treats 1 and 2 earned): אליס 4 of 5, בוב 3 of 5. */
const ROUND3 = jarDoc({
  mode: 'each',
  share: 5,
  target: 10,
  count: 7,
  counts: { [ALICE]: 4, [BOB]: 3 },
  round: 3
});

/** The stored household, read with the rules off. */
async function stored(): Promise<Record<string, unknown>> {
  let h: Record<string, unknown> = {};
  await seed(env(), async (db) => {
    h = (await getDoc(doc(db, path.household()))).data() ?? {};
  });
  return h;
}

/** Treats 1 and 2 in the history (rules off). */
async function seedHistory(): Promise<void> {
  await seed(env(), async (db) => {
    await setDoc(doc(db, path.treat(1)), treatDoc({ treat: 'גלידה בנמל' }));
    await setDoc(doc(db, path.treat(2)), treatDoc({ treat: 'סרט בקולנוע' }));
  });
}

/** A household whose jar was deleted in `round` (jar null, nextJarRound = round). */
async function seedDeleted(round: number): Promise<void> {
  await seedTwoMemberHousehold(env(), { jar: null });
  await seed(env(), (db) => updateDoc(doc(db, path.household()), { nextJarRound: round }));
}

describe('deleting the jar', () => {
  beforeEach(async () => {
    await seedTwoMemberHousehold(env(), { jar: ROUND3 });
    await seedHistory();
  });

  it('allowed: a member deletes it, remembering its round; the history stays', async () => {
    await assertSucceeds(updateDoc(hh(BOB), { jar: null, nextJarRound: 3 }));
    const h = await stored();
    expect(h.jar).toBeNull();
    expect(h.nextJarRound).toBe(3);
    await assertSucceeds(getDoc(treat(ALICE, 1)));
    await assertSucceeds(getDoc(treat(ALICE, 2)));
  });

  it('allowed: the owner too, and a full jar (its unredeemed treat goes with it)', async () => {
    await seedTwoMemberHousehold(env(), {
      jar: jarDoc({ count: 12, round: 3, counts: { [ALICE]: 12 } })
    });
    await assertSucceeds(updateDoc(hh(ALICE), { jar: null, nextJarRound: 3 }));
  });

  it('denied: an outsider, or a member of another household', async () => {
    await assertFails(updateDoc(hh(EVE), { jar: null, nextJarRound: 3 }));
    await assertFails(updateDoc(hh(OLGA), { jar: null, nextJarRound: 3 }));
  });

  it('denied: removing the jar without remembering its round', async () => {
    await assertFails(updateDoc(hh(BOB), { jar: null }));
  });

  it.each([
    ['an earlier round (collides with treats/2)', 2],
    ['round 1 (collides with treats/1)', 1],
    ['a later round (skips one)', 4],
    ['a round that is not a number', '3'],
    ['round 0', 0]
  ])('denied: remembering %s', async (_label, round) => {
    await assertFails(updateDoc(hh(BOB), { jar: null, nextJarRound: round }));
  });

  it('denied: the delete combined with anything else', async () => {
    await assertFails(updateDoc(hh(BOB), { jar: null, nextJarRound: 3, name: 'בית אחר' }));
    await assertFails(updateDoc(hh(BOB), { jar: null, nextJarRound: 3, invite: null }));
    await assertFails(
      updateDoc(hh(BOB), { jar: null, nextJarRound: 3, memberIds: [ALICE], memberCount: 1 })
    );
  });

  it('denied: nextJarRound written without deleting the jar', async () => {
    await assertFails(updateDoc(hh(BOB), { nextJarRound: 3 }));
    await assertFails(updateDoc(hh(BOB), { nextJarRound: 3, 'jar.treat': 'סרט' }));
    // Replacing the jar instead of deleting it.
    await assertFails(
      updateDoc(hh(BOB), { jar: jarDoc({ round: 3, counts: {} }), nextJarRound: 3 })
    );
  });

  it('denied: "deleting" a jar that is already gone, or rewriting the remembered round', async () => {
    await assertSucceeds(updateDoc(hh(BOB), { jar: null, nextJarRound: 3 }));
    await assertFails(updateDoc(hh(BOB), { jar: null, nextJarRound: 5 }));
    await assertFails(updateDoc(hh(BOB), { nextJarRound: 1 }));
    await assertFails(updateDoc(hh(BOB), { nextJarRound: deleteField() }));
    expect((await stored()).nextJarRound).toBe(3);
  });
});

describe('a new jar after a delete (nextJarRound 3; treats 1 and 2 earned)', () => {
  beforeEach(async () => {
    await seedDeleted(3);
    await seedHistory();
  });

  it('allowed: a fresh jar in round 3, from zero', async () => {
    await assertSucceeds(
      updateDoc(hh(BOB), { jar: jarDoc({ round: 3, mode: 'each', share: 5, counts: {} }) })
    );
    expect((await stored()).nextJarRound).toBe(3); // left as it was; it matters only without a jar
  });

  it.each([
    ['round 1 (the previous app version: would collide with treats/1)', 1],
    ['round 2 (collides with treats/2)', 2],
    ['round 4', 4]
  ])('denied: a fresh jar in %s', async (_label, round) => {
    await assertFails(updateDoc(hh(BOB), { jar: jarDoc({ round }) }));
  });

  it('denied: a "fresh" jar in round 3 with progress, tallies or a client start', async () => {
    await assertFails(updateDoc(hh(BOB), { jar: jarDoc({ round: 3, count: 4 }) }));
    await assertFails(updateDoc(hh(BOB), { jar: jarDoc({ round: 3, counts: { [BOB]: 2 } }) }));
    await assertFails(
      updateDoc(hh(BOB), { jar: jarDoc({ round: 3, startedAt: Timestamp.fromMillis(0) }) })
    );
  });

  it('denied: moving the remembered round along with the setup', async () => {
    await assertFails(updateDoc(hh(BOB), { jar: jarDoc({ round: 5 }), nextJarRound: 5 }));
    await assertFails(updateDoc(hh(BOB), { jar: jarDoc({ round: 3 }), nextJarRound: 1 }));
  });

  it('denied: an outsider setting one up', async () => {
    await assertFails(updateDoc(hh(EVE), { jar: jarDoc({ round: 3 }) }));
  });
});

describe('the new jar fills and is redeemed into the history, never over it', () => {
  /**
   * The redeem batch for the together jar in `round`: this version's write (the treat records the
   * mode and who took part, the tallies start over), or the previous version's (a 4-key treat and
   * count −target only).
   */
  function redeem(uid: string, round: number, version: 'this' | 'previous' = 'this') {
    const db = as(env(), uid);
    const b = writeBatch(db);
    const current = version === 'this';
    b.set(
      doc(db, path.treat(round)),
      treatDoc(current ? { mode: 'together', counts: { [BOB]: 10 } } : {})
    );
    b.update(doc(db, path.household()), {
      'jar.count': increment(-10),
      ...(current ? { 'jar.counts': {} } : {}),
      'jar.round': increment(1),
      'jar.startedAt': serverTimestamp()
    });
    b.set(
      doc(db, path.event(`redeem-${round}`)),
      eventDoc(uid, 'jar_redeemed', { taskId: null, taskTitle: null })
    );
    return b;
  }

  beforeEach(async () => {
    // Deleted in round 3, set up again (round 3) and now full: 10 of 10.
    const weekAgo = Timestamp.fromMillis(Date.now() - 7 * 86_400_000);
    await seedTwoMemberHousehold(env(), {
      jar: jarDoc({ round: 3, count: 10, counts: { [BOB]: 10 }, startedAt: weekAgo })
    });
    await seed(env(), (db) => updateDoc(doc(db, path.household()), { nextJarRound: 3 }));
    await seedHistory();
  });

  it('allowed: treats/3 is recorded and the jar moves on to round 4', async () => {
    await assertSucceeds(redeem(BOB, 3).commit());
    expect(((await stored()).jar as Doc).round).toBe(4);
  });

  it('denied: recording it over an earned treat (treats/1, treats/2)', async () => {
    await assertFails(redeem(BOB, 1).commit());
    await assertFails(redeem(BOB, 2).commit());
  });

  it('allowed (previous version): its 4-key treat and count −target', async () => {
    await assertSucceeds(redeem(ALICE, 3, 'previous').commit());
  });
});

describe('the previous app version and a deleted jar', () => {
  it('allowed: its first jar after a jar deleted in round 1 (nextJarRound 1)', async () => {
    await seedDeleted(1);
    // Its fresh jar: the four keys and round 1, no goal keys.
    await assertSucceeds(updateDoc(hh(BOB), { jar: jarDoc() }));
  });

  it('denied, history kept: its round-1 jar after a jar deleted in a later round', async () => {
    await seedDeleted(3);
    await seedHistory();
    await assertFails(updateDoc(hh(BOB), { jar: jarDoc() }));
    expect((await stored()).jar).toBeNull();
  });

  it('allowed: its setup on a household that never deleted a jar (unchanged)', async () => {
    await seedTwoMemberHousehold(env(), { jar: null });
    await assertSucceeds(updateDoc(hh(BOB), { jar: jarDoc() }));
  });

  describe('its writes queued before it saw the delete', () => {
    beforeEach(async () => {
      await seedDeleted(3);
      await seedTask(env(), 'task-1', { ownerId: BOB });
    });

    it('denied, and no half-jar is left behind: a jar step on the deleted jar', async () => {
      await assertFails(updateDoc(hh(BOB), { 'jar.count': increment(1) }));
      await assertFails(updateDoc(hh(BOB), { 'jar.count': increment(-1) }));
      await assertFails(updateDoc(hh(BOB), { 'jar.treat': 'סרט', 'jar.target': 12 }));
      expect((await stored()).jar).toBeNull();
    });

    it('a completion carrying a jar step is refused as a whole; without one it lands', async () => {
      const complete = (withJar: boolean) => {
        const db = as(env(), BOB);
        const b = writeBatch(db);
        b.update(doc(db, path.task('task-1')), {
          ...touched(BOB),
          status: 'done',
          completedAt: serverTimestamp(),
          completedBy: BOB,
          completion: completionDoc()
        });
        b.set(doc(db, path.event('done-1')), eventDoc(BOB, 'completed'));
        if (withJar) b.update(doc(db, path.household()), { 'jar.count': increment(1) });
        return b;
      };
      await assertFails(complete(true).commit());
      await assertSucceeds(complete(false).commit());
    });
  });
});

describe('deleting an earned treat', () => {
  beforeEach(async () => {
    await seedTwoMemberHousehold(env(), { jar: ROUND3 });
    await seedHistory();
  });

  it('allowed: any member removes it from the history; the jar is untouched', async () => {
    await assertSucceeds(deleteDoc(treat(BOB, 1)));
    await assertSucceeds(deleteDoc(treat(ALICE, 2)));
    expect(((await stored()).jar as Doc).round).toBe(3);
  });

  it('allowed: a treat still waiting to be redeemed', async () => {
    await seed(env(), (db) =>
      setDoc(doc(db, path.treat(2)), treatDoc({ treat: 'סרט בקולנוע', redeemedAt: null }))
    );
    await assertSucceeds(deleteDoc(treat(BOB, 2)));
  });

  it('denied: an outsider, or a member of another household', async () => {
    await assertFails(deleteDoc(treat(EVE, 1)));
    await assertFails(deleteDoc(treat(OLGA, 1)));
  });

  it('a deleted treat cannot be written back: its round is behind the jar', async () => {
    await assertSucceeds(deleteDoc(treat(BOB, 1)));
    await assertFails(setDoc(treat(BOB, 1), treatDoc({ treat: 'גלידה בנמל' })));
    // Not even inside a valid-looking redeem batch.
    const db = as(env(), BOB);
    const b = writeBatch(db);
    b.set(doc(db, path.treat(1)), treatDoc());
    b.update(doc(db, path.household()), {
      'jar.count': 0,
      'jar.counts': {},
      'jar.round': increment(1),
      'jar.startedAt': serverTimestamp()
    });
    await assertFails(b.commit());
  });

  it('still denied: editing a treat beyond setting redeemedAt once', async () => {
    await assertFails(updateDoc(treat(BOB, 1), { treat: 'אחר' }));
  });
});
