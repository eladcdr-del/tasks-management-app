// owner: step 2.3 — the adapter's multi-document writes, exactly as docs/firestore-schema.md
// specifies them, succeed as a member and stay inside the dependent-read limits (10 per document,
// 20 per batch/transaction; the emulator enforces both). One invalid piece fails the whole batch.

import { beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  increment,
  runTransaction,
  serverTimestamp,
  Timestamp,
  writeBatch,
  type Firestore
} from 'firebase/firestore';
import {
  ALICE,
  BOB,
  CODE,
  EVE,
  HID,
  SPARE_CODE,
  as,
  completionDoc,
  eventDoc,
  founderBatch,
  householdDoc,
  inviteDoc,
  jarDoc,
  joinBatch,
  leaveBatch,
  path,
  photoDoc,
  seed,
  seedTask,
  seedTwoMemberHousehold,
  taskDoc,
  touched,
  treatDoc,
  userDoc,
  useRulesEnv
} from './factories';

const env = useRulesEnv();

const SERIES = 'seriesTask0000000001';
const NEXT_ID = `${SERIES}__2026-11-30`;

/** A recurring, unassigned task due 2026-10-31 (the first instance of its series). */
async function seedRecurringTask(): Promise<void> {
  await seedTask(env(), SERIES, {
    title: 'לשלם ארנונה',
    categoryId: 'finance',
    priority: 'urgent',
    dueDate: '2026-10-31',
    recurrence: { freq: 'monthly', anchor: '2026-10-31' }
  });
}

interface CompleteOptions {
  photos?: number;
  jarStep?: number | null; // null = no jar write (household has no jar)
  jarFilled?: boolean;
  next?: boolean;
}

/**
 * The complete-batch, maximal form: up to 3 photos, the task update (taking ownership on the way),
 * the `completed` event, jar +1, the next recurring instance and a `jar_filled` event.
 */
function completeWrites(db: Firestore, uid: string, opts: CompleteOptions = {}) {
  const { photos = 3, jarStep = 1, jarFilled = false, next = true } = opts;
  const photoIds = Array.from({ length: photos }, (_, i) => `ph-${i}`);
  return (w: {
    set: (ref: ReturnType<typeof doc>, data: Record<string, unknown>) => unknown;
    update: (ref: ReturnType<typeof doc>, data: Record<string, unknown>) => unknown;
  }) => {
    for (const id of photoIds) w.set(doc(db, path.photo(id)), photoDoc(uid, SERIES));
    w.update(doc(db, path.task(SERIES)), {
      ...touched(uid),
      ownerId: uid,
      status: 'done',
      completedAt: serverTimestamp(),
      completedBy: uid,
      completion: completionDoc({ photoIds })
    });
    w.set(
      doc(db, path.event(`done-${SERIES}-${uid}`)),
      eventDoc(uid, 'completed', { taskId: SERIES })
    );
    if (jarStep !== null) {
      w.update(doc(db, path.household()), { 'jar.count': increment(jarStep) });
    }
    if (next) {
      w.set(
        doc(db, path.task(NEXT_ID)),
        taskDoc(uid, {
          title: 'לשלם ארנונה',
          categoryId: 'finance',
          priority: 'normal', // urgent becomes normal on the next instance
          ownerId: uid,
          dueDate: '2026-11-30',
          recurrence: { freq: 'monthly', anchor: '2026-10-31' },
          seriesId: SERIES
        })
      );
    }
    if (jarFilled) {
      w.set(
        doc(db, path.event(`filled-${SERIES}-${uid}`)),
        eventDoc(uid, 'jar_filled', { taskId: null, taskTitle: null })
      );
    }
  };
}

function completeBatch(db: Firestore, uid: string, opts: CompleteOptions = {}) {
  const b = writeBatch(db);
  completeWrites(db, uid, opts)(b);
  return b;
}

async function readAsAdmin(p: string): Promise<Record<string, unknown> | undefined> {
  let data: Record<string, unknown> | undefined;
  await seed(env(), async (db) => {
    data = (await getDoc(doc(db, p))).data();
  });
  return data;
}

describe('complete-batch', () => {
  beforeEach(async () => {
    await seedTwoMemberHousehold(env(), { jar: jarDoc({ count: 9 }) });
    await seedRecurringTask();
  });

  it('allowed (batch): 3 photos + task done + event + jar +1 + next instance + jar_filled', async () => {
    await assertSucceeds(completeBatch(as(env(), BOB), BOB, { jarFilled: true }).commit());
    const hh = await readAsAdmin(path.household());
    expect((hh?.jar as { count: number }).count).toBe(10);
    const next = await readAsAdmin(path.task(NEXT_ID));
    expect(next?.status).toBe('open');
    expect(next?.seriesId).toBe(SERIES);
  });

  it('allowed (transaction, the online path): reads task + next id, then the same writes', async () => {
    const db = as(env(), BOB);
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        const task = await tx.get(doc(db, path.task(SERIES)));
        const existingNext = await tx.get(doc(db, path.task(NEXT_ID)));
        if (task.data()?.status !== 'open' || existingNext.exists()) throw new Error('conflict');
        completeWrites(db, BOB, { jarFilled: true })(tx);
      })
    );
  });

  it('allowed: minimal form (no photos, no recurrence, household without a jar)', async () => {
    await seedTwoMemberHousehold(env(), { jar: null });
    await assertSucceeds(
      completeBatch(as(env(), ALICE), ALICE, { photos: 0, jarStep: null, next: false }).commit()
    );
  });

  it('denied atomically: one bad piece (jar +2) rejects the whole batch', async () => {
    await assertFails(completeBatch(as(env(), BOB), BOB, { jarStep: 2 }).commit());
    const task = await readAsAdmin(path.task(SERIES));
    expect(task?.status).toBe('open');
  });

  it('denied: completing as an outsider', async () => {
    await assertFails(completeBatch(as(env(), EVE), EVE).commit());
  });

  it('denied: a second completion recreating the next instance (it already exists)', async () => {
    await assertSucceeds(completeBatch(as(env(), BOB), BOB).commit());
    // A replay from another device: the next instance exists, so its set() is an update that
    // would rewrite createdAt — rejected. (Online, the transaction detects this and aborts.)
    await seedRecurringTask();
    await assertFails(completeBatch(as(env(), ALICE), ALICE, { photos: 0 }).commit());
    // control: the same replay without the next instance is accepted
    await assertSucceeds(
      completeBatch(as(env(), ALICE), ALICE, { photos: 0, next: false }).commit()
    );
  });
});

describe('reopen batch (undo)', () => {
  beforeEach(async () => {
    await seedTwoMemberHousehold(env(), { jar: jarDoc({ count: 9 }) });
    await seedRecurringTask();
    await assertSucceeds(completeBatch(as(env(), BOB), BOB, { photos: 1 }).commit());
  });

  it('allowed: task reopened + jar -1 + reopened event + untouched next instance deleted', async () => {
    const db = as(env(), BOB);
    const b = writeBatch(db);
    b.update(doc(db, path.task(SERIES)), {
      ...touched(BOB),
      status: 'open',
      completedAt: null,
      completedBy: null,
      completion: null
    });
    b.update(doc(db, path.household()), { 'jar.count': increment(-1) });
    b.set(doc(db, path.event(`reopen-${SERIES}`)), eventDoc(BOB, 'reopened', { taskId: SERIES }));
    b.delete(doc(db, path.task(NEXT_ID)));
    b.delete(doc(db, path.photo('ph-0')));
    await assertSucceeds(b.commit());
  });
});

describe('redeem batch', () => {
  beforeEach(async () => {
    await seedTwoMemberHousehold(env(), { jar: jarDoc({ count: 10 }) });
  });

  it('allowed: treats/{round} + jar reset (count - target, round + 1) + jar_redeemed event', async () => {
    const db = as(env(), ALICE);
    const b = writeBatch(db);
    b.set(doc(db, path.treat(1)), treatDoc());
    b.update(doc(db, path.household()), {
      'jar.count': increment(-10),
      'jar.round': increment(1),
      'jar.startedAt': serverTimestamp()
    });
    b.set(doc(db, path.event('redeem-1')), eventDoc(ALICE, 'jar_redeemed', { taskId: null }));
    await assertSucceeds(b.commit());
    const hh = await readAsAdmin(path.household());
    expect(hh?.jar).toMatchObject({ count: 0, round: 2, target: 10 });
  });

  it('denied: redeeming the same round twice', async () => {
    const run = () => {
      const db = as(env(), ALICE);
      const b = writeBatch(db);
      b.set(doc(db, path.treat(1)), treatDoc());
      b.update(doc(db, path.household()), {
        'jar.count': increment(-10),
        'jar.round': increment(1),
        'jar.startedAt': serverTimestamp()
      });
      return b.commit();
    };
    await assertSucceeds(run());
    await assertFails(run());
  });
});

describe('founder batch', () => {
  it('allowed: household (with jar) + members/self (owner) + users/self', async () => {
    const db = as(env(), EVE);
    const NEW_HID = 'hhNewFounder00000001';
    await assertSucceeds(
      founderBatch(db, EVE, NEW_HID, {
        household: householdDoc(EVE, { jar: jarDoc() }),
        user: true
      }).commit()
    );
    await assertSucceeds(getDoc(doc(db, path.household(NEW_HID))));
  });
});

describe('join batch', () => {
  it('allowed: household += self + members/self + users/self + member_joined event', async () => {
    await seedTwoMemberHousehold(env());
    await assertSucceeds(joinBatch(as(env(), EVE), EVE, { full: true }).commit());
    const hh = await readAsAdmin(path.household());
    expect(hh?.memberIds).toEqual([ALICE, BOB, EVE]);
    expect(hh?.memberCount).toBe(3);
  });
});

describe('leave batch', () => {
  it('allowed: members/self deleted + household -= self + users/self cleared', async () => {
    await seedTwoMemberHousehold(env());
    await seed(env(), async (db) => {
      const b = writeBatch(db);
      b.set(doc(db, path.user(BOB)), userDoc(HID));
      await b.commit();
    });
    await assertSucceeds(leaveBatch(as(env(), BOB), BOB).commit());
    const hh = await readAsAdmin(path.household());
    expect(hh?.memberIds).toEqual([ALICE]);
    expect(hh?.memberCount).toBe(1);
  });
});

describe('createInvite batch', () => {
  it('allowed: new invite + previous invite revoked + household.invite replaced', async () => {
    await seedTwoMemberHousehold(env());
    const db = as(env(), BOB);
    const expiresAt = Timestamp.fromMillis(Date.now() + 7 * 86_400_000 - 10 * 60_000);
    const b = writeBatch(db);
    b.set(doc(db, path.invite(SPARE_CODE)), inviteDoc(HID, BOB, { inviterName: 'דני', expiresAt }));
    b.update(doc(db, path.invite(CODE)), { revoked: true });
    b.update(doc(db, path.household()), { invite: { code: SPARE_CODE, expiresAt } });
    await assertSucceeds(b.commit());
    // the old code no longer admits anyone; the new one does
    await assertFails(joinBatch(as(env(), EVE), EVE, { code: CODE }).commit());
    await assertSucceeds(joinBatch(as(env(), EVE), EVE, { code: SPARE_CODE }).commit());
  });

  it('allowed: revokeInvite (doc revoked + household.invite cleared)', async () => {
    await seedTwoMemberHousehold(env());
    const db = as(env(), ALICE);
    const b = writeBatch(db);
    b.update(doc(db, path.invite(CODE)), { revoked: true });
    b.update(doc(db, path.household()), { invite: null });
    await assertSucceeds(b.commit());
  });
});

describe('take (transaction) and request (batch)', () => {
  beforeEach(async () => {
    await seedTwoMemberHousehold(env());
    await seedTask(env(), 'task-1');
  });

  it('allowed: take via transaction + taken event', async () => {
    const db = as(env(), BOB);
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        const snap = await tx.get(doc(db, path.task('task-1')));
        if (snap.data()?.ownerId !== null) throw new Error('taken');
        tx.update(doc(db, path.task('task-1')), { ...touched(BOB), ownerId: BOB });
        tx.set(doc(db, path.event('take-1')), eventDoc(BOB, 'taken'));
      })
    );
  });

  it('allowed: request + requested event (push pending, targetId = requested member)', async () => {
    const db = as(env(), BOB);
    const b = writeBatch(db);
    b.update(doc(db, path.task('task-1')), {
      ...touched(BOB),
      ownerId: ALICE,
      requestedBy: BOB,
      requestedAt: serverTimestamp()
    });
    b.set(doc(db, path.event('req-1')), eventDoc(BOB, 'requested', { targetId: ALICE }));
    await assertSucceeds(b.commit());
  });

  it('allowed: createTask batch (task + created event)', async () => {
    const db = as(env(), BOB);
    const b = writeBatch(db);
    b.set(doc(db, path.task('task-2')), taskDoc(BOB, { ownerId: ALICE }));
    b.set(doc(db, path.event('created-2')), eventDoc(BOB, 'created', { taskId: 'task-2' }));
    await assertSucceeds(b.commit());
  });
});

describe('delete batch, several in a row (Home: choosing several tasks)', () => {
  const IDS = ['task-a', 'task-b', 'task-c'];

  beforeEach(async () => {
    await seedTwoMemberHousehold(env());
    for (const id of IDS) await seedTask(env(), id, { ownerId: id === 'task-b' ? BOB : null });
  });

  /** deleteTask: the task gone + a 'deleted' event in the deleter's name (one batch per task). */
  const deleteBatch = (db: Firestore, actor: string, id: string) => {
    const b = writeBatch(db);
    b.delete(doc(db, path.task(id)));
    b.set(doc(db, path.event(`del-${id}`)), eventDoc(actor, 'deleted', { taskId: id }));
    return b;
  };

  it('allowed: one member deletes three tasks back to back, whoever holds them', async () => {
    const db = as(env(), ALICE);
    // The previous app version wrote exactly this batch for its single delete: unchanged.
    for (const id of IDS) await assertSucceeds(deleteBatch(db, ALICE, id).commit());
    for (const id of IDS) expect(await readAsAdmin(path.task(id))).toBeUndefined();
  });

  it('denied: an outsider; a deleted event in another member’s name', async () => {
    await assertFails(deleteBatch(as(env(), EVE), EVE, 'task-a').commit());
    await assertFails(deleteBatch(as(env(), ALICE), BOB, 'task-a').commit());
    expect(await readAsAdmin(path.task('task-a'))).toBeTruthy();
  });
});
