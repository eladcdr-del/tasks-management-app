// owner: step 2.3 — households/{hid}/tasks/{taskId}: member-only access and full field validation on
// create and update (Task minus `id` and the client-only `pending`).

import { beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  deleteField,
  doc,
  increment,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc
} from 'firebase/firestore';
import {
  ALICE,
  BOB,
  EVE,
  OLGA,
  as,
  completionDoc,
  omit,
  path,
  seedTask,
  seedTwoMemberHousehold,
  taskDoc,
  touched,
  useRulesEnv
} from './factories';

const env = useRulesEnv();

beforeEach(async () => {
  await seedTwoMemberHousehold(env());
});

const create = (uid: string, overrides: Record<string, unknown> = {}, id = 'new-task') =>
  setDoc(doc(as(env(), uid), path.task(id)), taskDoc(uid, overrides));

describe('create', () => {
  it('allowed: minimal valid open task', async () => {
    await assertSucceeds(create(BOB));
  });

  it('allowed: fully populated (owner, request, dates, recurrence with anchor, series)', async () => {
    await assertSucceeds(
      create(BOB, {
        title: 'ת'.repeat(200),
        notes: 'n'.repeat(4000),
        categoryId: null,
        priority: 'urgent',
        ownerId: ALICE,
        requestedBy: BOB,
        requestedAt: serverTimestamp(),
        scheduledFor: '2026-10-04',
        dueDate: '2026-10-31',
        dueTime: '23:59',
        hardDeadline: true,
        recurrence: { freq: 'monthly', anchor: '2026-10-31' },
        seriesId: 'seriesAbc00000000001'
      })
    );
  });

  it('allowed: recurrence without an anchor; unassigned', async () => {
    await assertSucceeds(create(BOB, { recurrence: { freq: 'weekly' }, ownerId: null }));
  });

  it('allowed: a week plan (weekPlan true with a scheduledFor Saturday)', async () => {
    await assertSucceeds(create(BOB, { scheduledFor: '2026-10-10', weekPlan: true }));
  });

  const invalid: Array<[string, Record<string, unknown>]> = [
    ['empty title', { title: '' }],
    ['201-char title', { title: 'ת'.repeat(201) }],
    ['non-string title', { title: 42 }],
    ['4001-char notes', { notes: 'n'.repeat(4001) }],
    ['bad priority enum', { priority: 'critical' }],
    ['bad categoryId enum', { categoryId: 'garden' }],
    ['bad status enum', { status: 'archived' }],
    ['status done on create', { status: 'done' }],
    ['foreign ownerId (outsider)', { ownerId: EVE }],
    ['foreign ownerId (other household)', { ownerId: OLGA }],
    ['createdBy someone else', { createdBy: ALICE }],
    ['updatedBy someone else', { updatedBy: ALICE }],
    ['requestedBy someone else', { requestedBy: ALICE, requestedAt: serverTimestamp() }],
    ['requestedBy without requestedAt', { requestedBy: BOB }],
    ['client-side createdAt', { createdAt: Timestamp.fromMillis(Date.now()) }],
    ['client-side updatedAt', { updatedAt: Timestamp.fromMillis(Date.now()) }],
    ['`pending` stored', { pending: true }],
    ['`pending: false` stored', { pending: false }],
    ['a stored `id` field', { id: 'new-task' }],
    ['an unknown extra key', { color: 'red' }],
    ['dueDate "2026-1-5"', { dueDate: '2026-1-5' }],
    ['dueDate "05/10/2026"', { dueDate: '05/10/2026' }],
    ['dueDate month 13', { dueDate: '2026-13-01' }],
    ['scheduledFor as a timestamp', { scheduledFor: Timestamp.fromMillis(0) }],
    ['dueTime "9:00"', { dueTime: '9:00' }],
    ['dueTime "24:00"', { dueTime: '24:00' }],
    ['hardDeadline as a string', { hardDeadline: 'yes' }],
    ['weekPlan as a string', { weekPlan: 'true' }],
    ['weekPlan as a number', { weekPlan: 1 }],
    ['weekPlan null', { weekPlan: null }],
    ['weekPlan true without a scheduledFor', { weekPlan: true, scheduledFor: null }],
    ['recurrence with unknown freq "hourly"', { recurrence: { freq: 'hourly' } }],
    ['recurrence with an extra key', { recurrence: { freq: 'weekly', every: 2 } }],
    ['recurrence anchor null', { recurrence: { freq: 'weekly', anchor: null } }],
    ['recurrence bad anchor', { recurrence: { freq: 'yearly', anchor: '31-10-2026' } }],
    ['recurrence as a string', { recurrence: 'weekly' }],
    ['61-char seriesId', { seriesId: 's'.repeat(61) }],
    ['negative snoozeCount', { snoozeCount: -1 }],
    ['fractional snoozeCount', { snoozeCount: 1.5 }],
    ['lastSnoozedAt set on create', { lastSnoozedAt: serverTimestamp() }],
    ['completion data on an open task', { completion: completionDoc() }],
    ['completedBy on an open task', { completedBy: BOB }]
  ];
  for (const [label, overrides] of invalid) {
    it(`denied: ${label}`, async () => {
      await assertFails(create(BOB, overrides));
    });
  }

  it('denied: missing title / missing any other key', async () => {
    const db = as(env(), BOB);
    await assertFails(setDoc(doc(db, path.task('t-a')), omit(taskDoc(BOB), 'title')));
    await assertFails(setDoc(doc(db, path.task('t-b')), omit(taskDoc(BOB), 'completion')));
    await assertFails(setDoc(doc(db, path.task('t-c')), omit(taskDoc(BOB), 'seriesId')));
  });

  it('denied: missing weekPlan', async () => {
    await assertFails(
      setDoc(doc(as(env(), BOB), path.task('t-wp')), omit(taskDoc(BOB), 'weekPlan'))
    );
  });

  it('denied: creating a task as already done, even with consistent completion fields', async () => {
    await assertFails(
      create(BOB, {
        status: 'done',
        completedAt: serverTimestamp(),
        completedBy: BOB,
        completion: completionDoc()
      })
    );
  });

  it('denied: outsider creating a valid task', async () => {
    await assertFails(create(EVE));
  });
});

describe('update', () => {
  beforeEach(async () => {
    await seedTask(env(), 'task-1');
  });
  const update = (uid: string, patch: Record<string, unknown>) =>
    updateDoc(doc(as(env(), uid), path.task('task-1')), { ...touched(uid), ...patch });

  it('allowed: edit title / notes / dates / recurrence', async () => {
    await assertSucceeds(
      update(BOB, {
        title: 'כותרת חדשה',
        notes: 'הערות',
        dueDate: '2026-11-01',
        recurrence: { freq: 'yearly' }
      })
    );
  });
  it('allowed: take (ownerId = me)', async () => {
    await assertSucceeds(update(BOB, { ownerId: BOB }));
  });
  it('allowed: request (ownerId = other member, requestedBy = me, requestedAt = now)', async () => {
    await assertSucceeds(
      update(BOB, { ownerId: ALICE, requestedBy: BOB, requestedAt: serverTimestamp() })
    );
  });
  it('allowed: release (ownerId null, request cleared)', async () => {
    await seedTask(env(), 'task-1', {
      ownerId: BOB,
      requestedBy: ALICE,
      requestedAt: Timestamp.fromMillis(Date.now() - 1000)
    });
    await assertSucceeds(update(BOB, { ownerId: null, requestedBy: null, requestedAt: null }));
  });
  it('allowed: snooze (scheduledFor, snoozeCount + 1, lastSnoozedAt = now)', async () => {
    await assertSucceeds(
      update(BOB, {
        scheduledFor: '2026-10-05',
        snoozeCount: increment(1),
        lastSnoozedAt: serverTimestamp()
      })
    );
  });
  it('allowed: set a week plan (weekPlan true + the Saturday), then clear it', async () => {
    await assertSucceeds(update(BOB, { scheduledFor: '2026-10-10', weekPlan: true }));
    await assertSucceeds(update(BOB, { scheduledFor: '2026-10-12', weekPlan: false }));
  });
  it('allowed: snooze a week plan (a day, weekPlan false)', async () => {
    await seedTask(env(), 'task-1', { scheduledFor: '2026-10-10', weekPlan: true });
    await assertSucceeds(
      update(BOB, {
        scheduledFor: '2026-10-11',
        weekPlan: false,
        snoozeCount: increment(1),
        lastSnoozedAt: serverTimestamp()
      })
    );
  });
  it('allowed: complete with documentation', async () => {
    await assertSucceeds(
      update(BOB, {
        status: 'done',
        completedAt: serverTimestamp(),
        completedBy: BOB,
        completion: completionDoc({ photoIds: ['p1', 'p2', 'p3'], cost: 0.5 })
      })
    );
  });
  it('allowed: complete with null completion and null cost variants', async () => {
    await assertSucceeds(
      update(BOB, { status: 'done', completedAt: serverTimestamp(), completedBy: BOB })
    );
    await assertSucceeds(update(ALICE, { completion: completionDoc({ cost: null }) }));
  });
  it('allowed: reopen (status open, completion fields cleared)', async () => {
    await seedTask(env(), 'task-1', {
      status: 'done',
      completedAt: Timestamp.fromMillis(Date.now() - 1000),
      completedBy: ALICE,
      completion: completionDoc()
    });
    await assertSucceeds(
      update(BOB, { status: 'open', completedAt: null, completedBy: null, completion: null })
    );
  });

  const invalid: Array<[string, Record<string, unknown>]> = [
    ['changing createdBy', { createdBy: BOB }],
    ['changing createdAt', { createdAt: serverTimestamp() }],
    ['updatedBy someone else', { updatedBy: ALICE }],
    ['stale/client updatedAt', { updatedAt: Timestamp.fromMillis(0) }],
    ['foreign ownerId', { ownerId: EVE }],
    ['requestedBy someone else', { requestedBy: ALICE, requestedAt: serverTimestamp() }],
    ['requestedAt in the past', { requestedBy: BOB, requestedAt: Timestamp.fromMillis(0) }],
    [
      'completedBy someone else',
      {
        status: 'done',
        completedAt: serverTimestamp(),
        completedBy: ALICE
      }
    ],
    ['done without completedAt', { status: 'done', completedBy: BOB }],
    [
      'completedAt in the past',
      {
        status: 'done',
        completedAt: Timestamp.fromMillis(0),
        completedBy: BOB
      }
    ],
    [
      'completion cost negative',
      {
        status: 'done',
        completedAt: serverTimestamp(),
        completedBy: BOB,
        completion: completionDoc({ cost: -1 })
      }
    ],
    [
      'completion cost above 10,000,000',
      {
        status: 'done',
        completedAt: serverTimestamp(),
        completedBy: BOB,
        completion: completionDoc({ cost: 10_000_001 })
      }
    ],
    [
      'completion cost as a string',
      {
        status: 'done',
        completedAt: serverTimestamp(),
        completedBy: BOB,
        completion: completionDoc({ cost: '650' })
      }
    ],
    [
      'completion with 4 photoIds',
      {
        status: 'done',
        completedAt: serverTimestamp(),
        completedBy: BOB,
        completion: completionDoc({ photoIds: ['a', 'b', 'c', 'd'] })
      }
    ],
    [
      'completion photoId not a string',
      {
        status: 'done',
        completedAt: serverTimestamp(),
        completedBy: BOB,
        completion: completionDoc({ photoIds: [{ big: 'x' }] })
      }
    ],
    [
      'completion note of 2001 chars',
      {
        status: 'done',
        completedAt: serverTimestamp(),
        completedBy: BOB,
        completion: completionDoc({ note: 'n'.repeat(2001) })
      }
    ],
    [
      'completion place of 121 chars',
      {
        status: 'done',
        completedAt: serverTimestamp(),
        completedBy: BOB,
        completion: completionDoc({ place: 'p'.repeat(121) })
      }
    ],
    [
      'completion contact of 121 chars',
      {
        status: 'done',
        completedAt: serverTimestamp(),
        completedBy: BOB,
        completion: completionDoc({ contact: 'c'.repeat(121) })
      }
    ],
    [
      'completion with an extra key',
      {
        status: 'done',
        completedAt: serverTimestamp(),
        completedBy: BOB,
        completion: { ...completionDoc(), rating: 5 }
      }
    ],
    ['adding `pending`', { pending: true }],
    ['adding an unknown key', { archived: true }],
    ['removing a key', { notes: deleteField() }],
    ['removing weekPlan', { weekPlan: deleteField() }],
    ['weekPlan as a string', { weekPlan: 'true' }],
    ['weekPlan null', { weekPlan: null }],
    ['weekPlan true while scheduledFor is null', { weekPlan: true }],
    ['201-char title', { title: 'ת'.repeat(201) }],
    ['bad dueDate format', { dueDate: '2026/10/31' }],
    ['recurrence unknown freq', { recurrence: { freq: 'hourly' } }],
    ['lastSnoozedAt in the past', { lastSnoozedAt: Timestamp.fromMillis(0) }],
    ['bad priority enum', { priority: 'low' }]
  ];
  for (const [label, patch] of invalid) {
    it(`denied: ${label}`, async () => {
      await assertFails(update(BOB, patch));
    });
  }

  it('denied: clearing scheduledFor of a week plan without clearing weekPlan', async () => {
    await seedTask(env(), 'task-1', { scheduledFor: '2026-10-10', weekPlan: true });
    await assertFails(update(BOB, { scheduledFor: null }));
    await assertSucceeds(update(BOB, { scheduledFor: null, weekPlan: false }));
  });

  it('denied: outsider update', async () => {
    await assertFails(update(EVE, { title: 'pwned' }));
  });
});

describe('delete', () => {
  beforeEach(async () => {
    await seedTask(env(), 'task-1');
  });
  it('allowed: any member', async () => {
    await assertSucceeds(deleteDoc(doc(as(env(), BOB), path.task('task-1'))));
  });
  it('denied: outsider / other household', async () => {
    await assertFails(deleteDoc(doc(as(env(), EVE), path.task('task-1'))));
    await assertFails(deleteDoc(doc(as(env(), OLGA), path.task('task-1'))));
  });
});

describe('stale owner', () => {
  it('allowed: editing a task whose (unchanged) owner has left the household', async () => {
    await seedTask(env(), 'task-1', { ownerId: 'departed-uid' });
    await assertSucceeds(
      updateDoc(doc(as(env(), BOB), path.task('task-1')), { title: 'עדיין פתוחה', ...touched(BOB) })
    );
  });
});
