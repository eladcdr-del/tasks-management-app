// owner: step 2.3 — events (append-only, actor = caller, push policy), photos (size-capped JPEG data
// URLs, immutable), treats (recorded only by a real redeem of a full jar).

import { beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  deleteDoc,
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
  OLGA,
  as,
  eventDoc,
  jarDoc,
  jpegDataUrl,
  path,
  photoDoc,
  seed,
  seedTwoMemberHousehold,
  treatDoc,
  useRulesEnv
} from './factories';

const env = useRulesEnv();

describe('events', () => {
  beforeEach(async () => {
    await seedTwoMemberHousehold(env());
  });
  const create = (uid: string, data: Record<string, unknown>, id = 'ev-new') =>
    setDoc(doc(as(env(), uid), path.event(id)), data);

  it('allowed: every type with its push policy (pending for requested/completed/jar_filled)', async () => {
    const types = [
      'created',
      'taken',
      'requested',
      'released',
      'completed',
      'reopened',
      'snoozed',
      'edited',
      'deleted',
      'jar_filled',
      'jar_redeemed',
      'member_joined'
    ];
    for (const type of types) {
      await assertSucceeds(create(BOB, eventDoc(BOB, type, { targetId: ALICE }), `ev-${type}`));
    }
  });
  it('allowed: nullable task fields', async () => {
    await assertSucceeds(
      create(BOB, eventDoc(BOB, 'jar_redeemed', { taskId: null, taskTitle: null, targetId: null }))
    );
  });

  const invalid: Array<[string, Record<string, unknown>]> = [
    ['spoofed actorId', eventDoc(BOB, 'completed', { actorId: ALICE })],
    ['push "sent"', eventDoc(BOB, 'created', { push: 'sent' })],
    ['push "skipped"', eventDoc(BOB, 'created', { push: 'skipped' })],
    ['push "pending" for a non-notifiable type', eventDoc(BOB, 'created', { push: 'pending' })],
    ['push "none" for a notifiable type', eventDoc(BOB, 'requested', { push: 'none' })],
    ['unknown type', eventDoc(BOB, 'hacked', { push: 'none' })],
    ['client-side createdAt', eventDoc(BOB, 'created', { createdAt: Timestamp.fromMillis(0) })],
    ['201-char taskTitle', eventDoc(BOB, 'created', { taskTitle: 't'.repeat(201) })],
    ['an unknown extra key', eventDoc(BOB, 'created', { message: 'hi' })],
    ['a stored id field', eventDoc(BOB, 'created', { id: 'ev-new' })]
  ];
  for (const [label, data] of invalid) {
    it(`denied: ${label}`, async () => {
      await assertFails(create(BOB, data));
    });
  }

  it('denied: outsider / other household member', async () => {
    await assertFails(create(EVE, eventDoc(EVE)));
    await assertFails(create(OLGA, eventDoc(OLGA)));
  });

  it('denied: update and delete, even by the actor', async () => {
    await seed(env(), (db) => setDoc(doc(db, path.event('ev-1')), eventDoc(BOB, 'completed')));
    const ref = doc(as(env(), BOB), path.event('ev-1'));
    await assertFails(updateDoc(ref, { push: 'sent' }));
    await assertFails(deleteDoc(ref));
  });
});

describe('photos', () => {
  beforeEach(async () => {
    await seedTwoMemberHousehold(env());
  });
  const create = (uid: string, overrides: Record<string, unknown> = {}) =>
    setDoc(doc(as(env(), uid), path.photo('ph-new')), photoDoc(uid, 'task-1', overrides));

  it('allowed: a JPEG at the size caps (300,000 / 20,000 chars)', async () => {
    await assertSucceeds(
      create(BOB, { dataUrl: jpegDataUrl(300_000), thumbDataUrl: jpegDataUrl(20_000) })
    );
  });

  const invalid: Array<[string, Record<string, unknown>]> = [
    ['oversized dataUrl (300,001)', { dataUrl: jpegDataUrl(300_001) }],
    ['oversized thumbDataUrl (20,001)', { thumbDataUrl: jpegDataUrl(20_001) }],
    ['non-JPEG data URL', { dataUrl: 'data:image/png;base64,' + 'A'.repeat(100) }],
    ['HTML data URL', { dataUrl: 'data:text/html;base64,' + 'A'.repeat(100) }],
    ['thumb not a data URL', { thumbDataUrl: 'https://evil.example/x.jpg' + 'A'.repeat(10) }],
    ['createdBy someone else', { createdBy: ALICE }],
    ['client-side createdAt', { createdAt: Timestamp.fromMillis(0) }],
    ['width 0', { width: 0 }],
    ['height 5000', { height: 5000 }],
    ['an unknown extra key', { exif: 'gps' }]
  ];
  for (const [label, overrides] of invalid) {
    it(`denied: ${label}`, async () => {
      await assertFails(create(BOB, overrides));
    });
  }

  it('denied: outsider create', async () => {
    await assertFails(create(EVE));
  });

  describe('existing photo', () => {
    beforeEach(async () => {
      await seed(env(), (db) => setDoc(doc(db, path.photo('ph-1')), photoDoc(ALICE)));
    });
    it('allowed: a member deletes', async () => {
      await assertSucceeds(deleteDoc(doc(as(env(), BOB), path.photo('ph-1'))));
    });
    it('denied: update (immutable) and outsider delete', async () => {
      await assertFails(updateDoc(doc(as(env(), ALICE), path.photo('ph-1')), { width: 10 }));
      await assertFails(deleteDoc(doc(as(env(), EVE), path.photo('ph-1'))));
    });
  });
});

describe('treats', () => {
  /** The redeem batch for a jar currently in `round`: treats/{round} + jar reset (+ event). */
  const redeem = (
    uid: string,
    opts: {
      round?: number;
      treat?: Record<string, unknown>;
      resetJar?: boolean;
      createTreat?: boolean;
      target?: number;
      extraRound?: number;
    } = {}
  ) => {
    const { round = 1, treat = {}, resetJar = true, createTreat = true, target = 10 } = opts;
    const db = as(env(), uid);
    const b = writeBatch(db);
    if (createTreat) b.set(doc(db, path.treat(round)), treatDoc(treat));
    if (opts.extraRound !== undefined) b.set(doc(db, path.treat(opts.extraRound)), treatDoc(treat));
    if (resetJar) {
      b.update(doc(db, path.household()), {
        'jar.count': increment(-target),
        'jar.round': increment(1),
        'jar.startedAt': serverTimestamp()
      });
    }
    b.set(
      doc(db, path.event(`redeem-${round}`)),
      eventDoc(uid, 'jar_redeemed', { taskId: null, taskTitle: null })
    );
    return b;
  };

  describe('with a full jar (12/10, round 1)', () => {
    beforeEach(async () => {
      const weekAgo = Timestamp.fromMillis(Date.now() - 7 * 86_400_000);
      await seedTwoMemberHousehold(env(), { jar: jarDoc({ count: 12, startedAt: weekAgo }) });
    });

    it('allowed: redeem (treat recorded, surplus 2 carries over, round 2)', async () => {
      await assertSucceeds(redeem(BOB).commit());
    });
    it('allowed: filledAt earlier than now (from the jar_filled event), redeemedAt null', async () => {
      await assertSucceeds(
        redeem(BOB, {
          treat: { filledAt: Timestamp.fromMillis(Date.now() - 60_000), redeemedAt: null }
        }).commit()
      );
    });
    it('denied: treat recorded without resetting the jar', async () => {
      await assertFails(redeem(BOB, { resetJar: false }).commit());
    });
    it('denied: jar reset without recording the treat', async () => {
      await assertFails(redeem(BOB, { createTreat: false }).commit());
    });
    it('denied: wrong round id, mismatched treat/target, filledAt outside the round', async () => {
      await assertFails(redeem(BOB, { round: 2 }).commit());
      await assertFails(redeem(BOB, { treat: { treat: 'חופשה בחו"ל' } }).commit());
      await assertFails(redeem(BOB, { treat: { target: 3 } }).commit());
      await assertFails(
        redeem(BOB, { treat: { filledAt: Timestamp.fromMillis(Date.now() + 3_600_000) } }).commit()
      );
      await assertFails(
        redeem(BOB, {
          treat: { filledAt: Timestamp.fromMillis(Date.now() - 30 * 86_400_000) }
        }).commit()
      );
      await assertFails(
        redeem(BOB, { treat: { redeemedAt: Timestamp.fromMillis(Date.now() - 60_000) } }).commit()
      );
    });
    it('denied: an extra treat for another round smuggled into a valid redeem batch', async () => {
      await assertFails(redeem(BOB, { extraRound: 5 }).commit());
    });
    it('denied: resetting to the wrong count (forfeiting or inflating the surplus)', async () => {
      await assertFails(redeem(BOB, { target: 12 }).commit());
      await assertFails(redeem(BOB, { target: 8 }).commit());
    });
    it('denied: an outsider redeeming', async () => {
      await assertFails(redeem(EVE).commit());
    });
  });

  it('denied: recording a treat for a jar that is not full (7/10)', async () => {
    await seedTwoMemberHousehold(env());
    await assertFails(redeem(BOB).commit());
  });

  describe('existing treat', () => {
    beforeEach(async () => {
      await seedTwoMemberHousehold(env(), { jar: jarDoc({ round: 2 }) });
      await seed(env(), (db) => setDoc(doc(db, path.treat(1)), treatDoc({ redeemedAt: null })));
    });
    it('allowed: set redeemedAt once, to now', async () => {
      await assertSucceeds(
        updateDoc(doc(as(env(), BOB), path.treat(1)), { redeemedAt: serverTimestamp() })
      );
    });
    it('denied: other fields, a past redeemedAt, a second redeem, outsider', async () => {
      const ref = doc(as(env(), BOB), path.treat(1));
      await assertFails(updateDoc(ref, { treat: 'אחר' }));
      await assertFails(updateDoc(ref, { redeemedAt: Timestamp.fromMillis(0) }));
      await assertFails(
        updateDoc(doc(as(env(), EVE), path.treat(1)), { redeemedAt: serverTimestamp() })
      );
      await assertSucceeds(updateDoc(ref, { redeemedAt: serverTimestamp() }));
      await assertFails(updateDoc(ref, { redeemedAt: serverTimestamp() }));
    });
    it('allowed: a member deletes it from the history (an outsider cannot)', async () => {
      await assertFails(deleteDoc(doc(as(env(), EVE), path.treat(1))));
      await assertSucceeds(deleteDoc(doc(as(env(), BOB), path.treat(1))));
    });
  });
});
