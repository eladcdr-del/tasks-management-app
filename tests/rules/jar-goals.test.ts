// Jar goal modes (src/lib/domain/jar.ts, docs/firestore-schema.md "Jar goal modes"): the optional
// mode / share / counts keys, every jar transition this version writes, and the writes of the
// PREVIOUS app version (count ±1 only; a 4-key treat on redeem), which must keep working.

import { beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  deleteField,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore
} from 'firebase/firestore';
import {
  ALICE,
  BOB,
  EVE,
  as,
  completionDoc,
  eventDoc,
  householdDoc,
  jarDoc,
  memberDoc,
  path,
  seed,
  seedHousehold,
  seedTask,
  seedTwoMemberHousehold,
  touched,
  treatDoc,
  userDoc,
  useRulesEnv,
  type Doc
} from './factories';

const env = useRulesEnv();
const hh = (uid: string) => doc(as(env(), uid), path.household());

/** "Everyone does their part": 5 each; אליס 4, בוב 3 (count = Σ min = 7). */
const eachJar = (over: Doc = {}) =>
  jarDoc({
    mode: 'each',
    share: 5,
    target: 10,
    count: 7,
    counts: { [ALICE]: 4, [BOB]: 3 },
    ...over
  });

async function jarNow(): Promise<Record<string, unknown>> {
  let jar: Record<string, unknown> = {};
  await seed(env(), async (db) => {
    jar = (await getDoc(doc(db, path.household()))).data()?.jar as Record<string, unknown>;
  });
  return jar;
}

describe('jar shape', () => {
  describe('first setup (from null)', () => {
    beforeEach(async () => {
      await seedTwoMemberHousehold(env(), { jar: null });
    });

    it('allowed: a fresh each jar (mode, share, empty tallies)', async () => {
      await assertSucceeds(
        updateDoc(hh(BOB), { jar: jarDoc({ mode: 'each', share: 5, counts: {} }) })
      );
    });

    it('allowed: a fresh together jar with mode and tallies', async () => {
      await assertSucceeds(updateDoc(hh(BOB), { jar: jarDoc({ mode: 'together', counts: {} }) }));
    });

    it.each([
      ['tallies already set', { mode: 'each', share: 5, counts: { [BOB]: 2 } }],
      ['each without a share', { mode: 'each' }],
      ['share 0', { mode: 'each', share: 0 }],
      ['share 21', { mode: 'each', share: 21 }],
      ['share 2.5', { mode: 'each', share: 2.5 }],
      ['an unknown mode', { mode: 'sometimes', share: 5 }],
      ['tallies that are not a map', { counts: [1, 2] }],
      ['an unknown key', { bonus: 3 }]
    ])('denied: %s', async (_label, over) => {
      await assertFails(updateDoc(hh(BOB), { jar: jarDoc(over) }));
    });
  });

  it('allowed: a founder creates a household with a fresh each jar', async () => {
    const db = as(env(), EVE);
    const hid = 'hhEve00000000000000x';
    const b = writeBatch(db);
    b.set(
      doc(db, path.household(hid)),
      householdDoc(EVE, { jar: jarDoc({ mode: 'each', share: 3, counts: {} }) })
    );
    b.set(doc(db, path.member(EVE, hid)), memberDoc('owner'));
    b.set(doc(db, path.user(EVE)), userDoc(hid));
    await assertSucceeds(b.commit());
  });
});

describe('jar settings', () => {
  describe('a together jar in progress, tallies recorded', () => {
    beforeEach(async () => {
      await seedTwoMemberHousehold(env(), {
        jar: jarDoc({ count: 7, counts: { [ALICE]: 4, [BOB]: 3 } })
      });
    });

    it('allowed: switch to each (share + target for the previous version)', async () => {
      await assertSucceeds(
        updateDoc(hh(BOB), {
          'jar.mode': 'each',
          'jar.share': 5,
          'jar.target': 10,
          'jar.treat': 'ערב סרט'
        })
      );
    });

    it('denied: switching to each without a share', async () => {
      await assertFails(updateDoc(hh(BOB), { 'jar.mode': 'each' }));
    });

    it('denied: an edit that rewrites the tallies', async () => {
      await assertFails(updateDoc(hh(BOB), { 'jar.treat': 'סרט', 'jar.counts': { [BOB]: 9 } }));
      await assertFails(
        updateDoc(hh(BOB), { 'jar.mode': 'each', 'jar.share': 5, 'jar.counts': {} })
      );
    });
  });

  describe('a jar from before goal modes (7/10, no tallies): backfill on the switch', () => {
    beforeEach(async () => {
      await seedTwoMemberHousehold(env(), { jar: jarDoc({ count: 7 }) });
    });

    it('allowed: attributing the counted completions to current members', async () => {
      await assertSucceeds(
        updateDoc(hh(ALICE), {
          'jar.mode': 'each',
          'jar.share': 5,
          'jar.counts': { [ALICE]: 4, [BOB]: 3 }
        })
      );
    });

    it('allowed: attributing fewer than counted', async () => {
      await assertSucceeds(
        updateDoc(hh(ALICE), { 'jar.mode': 'each', 'jar.share': 5, 'jar.counts': { [BOB]: 2 } })
      );
    });

    it.each([
      ['more than the jar counted', { [ALICE]: 5, [BOB]: 3 }],
      ['a stranger', { [ALICE]: 1, [EVE]: 1 }],
      ['a fraction', { [ALICE]: 1.5 }],
      ['a negative entry', { [ALICE]: -1, [BOB]: 3 }]
    ])('denied: %s', async (_label, counts) => {
      await assertFails(
        updateDoc(hh(ALICE), { 'jar.mode': 'each', 'jar.share': 5, 'jar.counts': counts })
      );
    });

    it('denied: lowering a recorded tally on the way', async () => {
      await seedTwoMemberHousehold(env(), { jar: jarDoc({ count: 7, counts: { [BOB]: 3 } }) });
      await assertFails(
        updateDoc(hh(ALICE), {
          'jar.mode': 'each',
          'jar.share': 5,
          'jar.counts': { [ALICE]: 4, [BOB]: 2 }
        })
      );
    });
  });

  describe('an each jar', () => {
    beforeEach(async () => {
      await seedTwoMemberHousehold(env(), { jar: eachJar() });
    });

    it('allowed: a new share (and target), and back to together', async () => {
      await assertSucceeds(updateDoc(hh(BOB), { 'jar.share': 3, 'jar.target': 6 }));
      await assertSucceeds(updateDoc(hh(BOB), { 'jar.mode': 'together', 'jar.target': 12 }));
    });

    it('allowed: the previous version edits treat and target', async () => {
      await assertSucceeds(updateDoc(hh(BOB), { 'jar.treat': 'סרט', 'jar.target': 12 }));
    });

    it('denied: removing the share, or a share out of range', async () => {
      await assertFails(updateDoc(hh(BOB), { 'jar.share': deleteField() }));
      await assertFails(updateDoc(hh(BOB), { 'jar.share': 25 }));
    });

    it('denied: an outsider changing the goal', async () => {
      await assertFails(updateDoc(hh(EVE), { 'jar.share': 1 }));
    });
  });
});

describe('completion and reopen (each jar: אליס 4/5, בוב 3/5, count 7)', () => {
  beforeEach(async () => {
    await seedTwoMemberHousehold(env(), { jar: eachJar() });
  });

  it('allowed: my own tally +1 and the count +1', async () => {
    await assertSucceeds(
      updateDoc(hh(BOB), { [`jar.counts.${BOB}`]: increment(1), 'jar.count': increment(1) })
    );
    expect(await jarNow()).toMatchObject({ count: 8, counts: { [ALICE]: 4, [BOB]: 4 } });
  });

  it('allowed: past my share (a bonus) the count stays', async () => {
    await seedTwoMemberHousehold(env(), {
      jar: eachJar({ counts: { [ALICE]: 5, [BOB]: 3 }, count: 8 })
    });
    await assertSucceeds(updateDoc(hh(ALICE), { [`jar.counts.${ALICE}`]: increment(1) }));
    expect(await jarNow()).toMatchObject({ count: 8, counts: { [ALICE]: 6 } });
  });

  it('allowed: the first tally of a jar without any', async () => {
    await seedTwoMemberHousehold(env(), { jar: jarDoc({ count: 7 }) });
    await assertSucceeds(
      updateDoc(hh(BOB), { [`jar.counts.${BOB}`]: increment(1), 'jar.count': increment(1) })
    );
    expect(await jarNow()).toMatchObject({ count: 8, counts: { [BOB]: 1 } });
  });

  it('allowed (previous version): count +1 / −1 with the tallies untouched', async () => {
    await assertSucceeds(updateDoc(hh(BOB), { 'jar.count': increment(1) }));
    await assertSucceeds(updateDoc(hh(BOB), { 'jar.count': increment(-1) }));
    expect(await jarNow()).toMatchObject({ count: 7, counts: { [ALICE]: 4, [BOB]: 3 } });
  });

  it.each([
    ['raising someone else’s tally', { [`jar.counts.${ALICE}`]: increment(1) }],
    ['my tally +2', { [`jar.counts.${BOB}`]: increment(2) }],
    [
      'two tallies at once',
      { [`jar.counts.${BOB}`]: increment(1), [`jar.counts.${ALICE}`]: increment(1) }
    ],
    ['count +2', { [`jar.counts.${BOB}`]: increment(1), 'jar.count': increment(2) }],
    ['count only +2', { 'jar.count': increment(2) }],
    ['a tally for a stranger', { [`jar.counts.${EVE}`]: increment(1) }],
    ['a fractional tally', { [`jar.counts.${BOB}`]: 3.5 }],
    ['a step that also changes the share', { [`jar.counts.${BOB}`]: increment(1), 'jar.share': 4 }],
    [
      'a tally up with the count down',
      { [`jar.counts.${BOB}`]: increment(1), 'jar.count': increment(-1) }
    ]
  ])('denied (completion): %s', async (_label, patch) => {
    await assertFails(updateDoc(hh(BOB), patch));
  });

  it('allowed (reopen): the original completer’s tally −1 and the count −1, by anyone', async () => {
    await assertSucceeds(
      updateDoc(hh(BOB), { [`jar.counts.${ALICE}`]: increment(-1), 'jar.count': increment(-1) })
    );
    expect(await jarNow()).toMatchObject({ count: 6, counts: { [ALICE]: 3, [BOB]: 3 } });
  });

  it('allowed (reopen of a bonus): the tally −1 only', async () => {
    await seedTwoMemberHousehold(env(), {
      jar: eachJar({ counts: { [ALICE]: 6, [BOB]: 3 }, count: 8 })
    });
    await assertSucceeds(updateDoc(hh(ALICE), { [`jar.counts.${ALICE}`]: increment(-1) }));
  });

  it.each([
    [
      'two tallies down',
      { [`jar.counts.${ALICE}`]: increment(-1), [`jar.counts.${BOB}`]: increment(-1) }
    ],
    ['a tally −2', { [`jar.counts.${ALICE}`]: increment(-2) }],
    ['count −2', { [`jar.counts.${ALICE}`]: increment(-1), 'jar.count': increment(-2) }]
  ])('denied (reopen): %s', async (_label, patch) => {
    await assertFails(updateDoc(hh(BOB), patch));
  });

  it('denied (reopen): below 0, or a former member’s tally', async () => {
    await seedTwoMemberHousehold(env(), {
      jar: eachJar({ counts: { [ALICE]: 0, [BOB]: 3, [EVE]: 2 } })
    });
    await assertFails(updateDoc(hh(BOB), { [`jar.counts.${ALICE}`]: increment(-1) }));
    await assertFails(updateDoc(hh(BOB), { [`jar.counts.${EVE}`]: increment(-1) }));
    // control: a former member's completion still takes the count back the classic way
    await assertSucceeds(updateDoc(hh(BOB), { 'jar.count': increment(-1) }));
  });

  it('denied: an outsider moving a tally', async () => {
    await assertFails(updateDoc(hh(EVE), { [`jar.counts.${EVE}`]: increment(1) }));
  });
});

describe('the complete batch with tallies (task + event + jar + jar_filled)', () => {
  beforeEach(async () => {
    await seedTwoMemberHousehold(env(), {
      jar: eachJar({ counts: { [ALICE]: 5, [BOB]: 4 }, count: 9 })
    });
    await seedTask(env(), 'task-1', { ownerId: BOB });
  });

  function complete(db: Firestore, uid: string, jarPatch: Doc) {
    const b = writeBatch(db);
    b.update(doc(db, path.task('task-1')), {
      ...touched(uid),
      status: 'done',
      completedAt: serverTimestamp(),
      completedBy: uid,
      completion: completionDoc()
    });
    b.set(doc(db, path.event('done-1')), eventDoc(uid, 'completed'));
    b.update(doc(db, path.household()), jarPatch);
    b.set(
      doc(db, path.event('filled-1')),
      eventDoc(uid, 'jar_filled', { taskId: null, taskTitle: null })
    );
    return b;
  }

  it('allowed: בוב closes his part and fills the jar', async () => {
    await assertSucceeds(
      complete(as(env(), BOB), BOB, {
        [`jar.counts.${BOB}`]: increment(1),
        'jar.count': increment(1)
      }).commit()
    );
  });

  it('denied atomically: a bad jar step rejects the whole completion', async () => {
    await assertFails(
      complete(as(env(), BOB), BOB, { [`jar.counts.${ALICE}`]: increment(1) }).commit()
    );
  });
});

describe('redeem', () => {
  /** The redeem batch: treats/{round} + the jar's next round + jar_redeemed. */
  function redeem(
    uid: string,
    opts: { treat?: Doc; jar?: Doc; skipTreat?: boolean; round?: number } = {}
  ) {
    const db = as(env(), uid);
    const round = opts.round ?? 1;
    const b = writeBatch(db);
    if (!opts.skipTreat) b.set(doc(db, path.treat(round)), treatDoc(opts.treat ?? {}));
    b.update(doc(db, path.household()), {
      'jar.round': increment(1),
      'jar.startedAt': serverTimestamp(),
      ...(opts.jar ?? {})
    });
    b.set(
      doc(db, path.event(`redeem-${round}`)),
      eventDoc(uid, 'jar_redeemed', { taskId: null, taskTitle: null })
    );
    return b;
  }

  const NEW_EACH = { 'jar.count': 0, 'jar.counts': {} };

  describe('a full each jar (share 2: אליס 3, בוב 2)', () => {
    const counts = { [ALICE]: 3, [BOB]: 2 };
    beforeEach(async () => {
      await seedTwoMemberHousehold(env(), {
        jar: eachJar({ share: 2, target: 4, count: 4, counts })
      });
    });

    it('allowed: the treat records who took part; everyone starts from 0', async () => {
      await assertSucceeds(
        redeem(BOB, {
          treat: { target: 4, mode: 'each', share: 2, counts },
          jar: NEW_EACH
        }).commit()
      );
      expect(await jarNow()).toMatchObject({ round: 2, count: 0, counts: {}, share: 2 });
    });

    it('allowed: a treat without the optional keys', async () => {
      await assertSucceeds(redeem(BOB, { treat: { target: 4 }, jar: NEW_EACH }).commit());
    });

    it('denied (previous version): count −target with the tallies left would start full', async () => {
      await assertFails(
        redeem(BOB, { treat: { target: 4 }, jar: { 'jar.count': increment(-4) } }).commit()
      );
    });

    it.each([
      ['tallies that do not match', { target: 4, counts: { [ALICE]: 3 } }],
      ['the wrong mode', { target: 4, mode: 'together' }],
      ['the wrong share', { target: 4, mode: 'each', share: 3 }],
      ['an unknown key', { target: 4, who: [ALICE] }]
    ])('denied: a treat with %s', async (_label, treat) => {
      await assertFails(redeem(BOB, { treat, jar: NEW_EACH }).commit());
    });

    it('denied: carrying a surplus over, or keeping the tallies', async () => {
      await assertFails(
        redeem(BOB, { treat: { target: 4 }, jar: { 'jar.count': 1, 'jar.counts': {} } }).commit()
      );
      await assertFails(redeem(BOB, { treat: { target: 4 }, jar: { 'jar.count': 0 } }).commit());
    });
  });

  it('denied: an each jar where not everyone has done their part (count ≥ target is not enough)', async () => {
    await seedTwoMemberHousehold(env(), {
      jar: eachJar({ share: 2, target: 4, count: 4, counts: { [ALICE]: 6, [BOB]: 1 } })
    });
    await assertFails(redeem(ALICE, { treat: { target: 4 }, jar: NEW_EACH }).commit());
  });

  it('membership decides: a newcomer’s part is needed; a former member’s is not', async () => {
    const jar = eachJar({ share: 1, target: 3, count: 1, counts: { [ALICE]: 1 } });
    await seedHousehold(env(), { members: [ALICE, BOB], jar });
    await assertFails(redeem(ALICE, { treat: { target: 3 }, jar: NEW_EACH }).commit());
    await seedHousehold(env(), { members: [ALICE], jar });
    await assertSucceeds(redeem(ALICE, { treat: { target: 3 }, jar: NEW_EACH }).commit());
  });

  describe('a full together jar with tallies (12/10)', () => {
    const counts = { [ALICE]: 7, [BOB]: 5 };
    beforeEach(async () => {
      await seedTwoMemberHousehold(env(), { jar: jarDoc({ count: 12, counts }) });
    });

    it('allowed: this version (tallies cleared, surplus carried)', async () => {
      await assertSucceeds(
        redeem(BOB, {
          treat: { mode: 'together', counts },
          jar: { 'jar.count': increment(-10), 'jar.counts': {} }
        }).commit()
      );
      expect(await jarNow()).toMatchObject({ round: 2, count: 2, counts: {} });
    });

    it('allowed (previous version): count −target, the 4-key treat, tallies untouched', async () => {
      await assertSucceeds(redeem(BOB, { jar: { 'jar.count': increment(-10) } }).commit());
    });

    it('denied: dropping the surplus', async () => {
      await assertFails(redeem(BOB, { jar: { 'jar.count': 0, 'jar.counts': {} } }).commit());
    });
  });

  it('denied: recording a treat for a jar that is not full, whatever the batch', async () => {
    await seedTwoMemberHousehold(env(), { jar: eachJar() });
    await assertFails(
      setDoc(doc(as(env(), BOB), path.treat(1)), treatDoc({ mode: 'each', share: 5 }))
    );
  });
});
