// Recurrence feature: tasks.recurrence may carry `interval` (int 1..99) and, on a weekly rule,
// `weekdays` (1-7 strictly ascending ints 0..6). Both are optional, so every write of the previous
// client ({freq} / {freq, anchor}, freq weekly | monthly | yearly) must still be accepted, on
// create, on update and inside the complete-batch (the next instance).

import { beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import {
  ALICE,
  BOB,
  EVE,
  as,
  completionDoc,
  eventDoc,
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

const create = (uid: string, recurrence: unknown, id = 'rec-task') =>
  setDoc(doc(as(env(), uid), path.task(id)), taskDoc(uid, { recurrence }));
const update = (uid: string, recurrence: unknown) =>
  updateDoc(doc(as(env(), uid), path.task('task-1')), { ...touched(uid), recurrence });

const VALID: Array<[string, unknown]> = [
  // the previous client's shapes
  ['weekly', { freq: 'weekly' }],
  ['monthly with an anchor', { freq: 'monthly', anchor: '2026-10-31' }],
  ['yearly with an anchor', { freq: 'yearly', anchor: '2028-02-29' }],
  // the new ones
  ['daily', { freq: 'daily' }],
  ['daily with an anchor', { freq: 'daily', anchor: '2026-10-04' }],
  ['every 2 days', { freq: 'daily', interval: 2, anchor: '2026-10-04' }],
  ['interval 1 (redundant but valid)', { freq: 'monthly', interval: 1 }],
  ['every 99 weeks', { freq: 'weekly', interval: 99 }],
  ['every 3 months', { freq: 'monthly', interval: 3, anchor: '2026-01-31' }],
  ['every 2 years', { freq: 'yearly', interval: 2 }],
  ['Sunday and Wednesday', { freq: 'weekly', weekdays: [0, 3], anchor: '2026-10-04' }],
  ['one listed day', { freq: 'weekly', weekdays: [6] }],
  ['all seven days', { freq: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6] }],
  [
    'every 2 weeks on Mon/Thu',
    { freq: 'weekly', interval: 2, weekdays: [1, 4], anchor: '2026-10-05' }
  ],
  ['no recurrence', null]
];

const INVALID: Array<[string, unknown]> = [
  ['unknown freq', { freq: 'hourly' }],
  ['freq missing', { interval: 2 }],
  ['an extra key', { freq: 'weekly', every: 2 }],
  ['interval 0', { freq: 'daily', interval: 0 }],
  ['interval 100', { freq: 'daily', interval: 100 }],
  ['negative interval', { freq: 'weekly', interval: -1 }],
  ['fractional interval', { freq: 'daily', interval: 1.5 }],
  ['interval as a string', { freq: 'daily', interval: '2' }],
  ['interval null', { freq: 'daily', interval: null }],
  ['weekdays on a daily rule', { freq: 'daily', weekdays: [1] }],
  ['weekdays on a monthly rule', { freq: 'monthly', weekdays: [1] }],
  ['empty weekdays', { freq: 'weekly', weekdays: [] }],
  ['weekdays out of order', { freq: 'weekly', weekdays: [3, 0] }],
  ['a repeated weekday', { freq: 'weekly', weekdays: [1, 1] }],
  ['weekday 7', { freq: 'weekly', weekdays: [7] }],
  ['weekday -1', { freq: 'weekly', weekdays: [-1, 2] }],
  ['a fractional weekday', { freq: 'weekly', weekdays: [1.5] }],
  ['a weekday as a string', { freq: 'weekly', weekdays: ['1'] }],
  ['eight weekdays', { freq: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6, 6] }],
  ['weekdays as a map', { freq: 'weekly', weekdays: { 0: 1 } }],
  ['weekdays null', { freq: 'weekly', weekdays: null }],
  ['a bad anchor next to new fields', { freq: 'daily', interval: 2, anchor: '2026-13-01' }]
];

describe('create', () => {
  for (const [label, recurrence] of VALID) {
    it(`allowed: ${label}`, async () => {
      await assertSucceeds(create(BOB, recurrence));
    });
  }
  for (const [label, recurrence] of INVALID) {
    it(`denied: ${label}`, async () => {
      await assertFails(create(BOB, recurrence));
    });
  }
  it('denied: an outsider, even with a valid new rule', async () => {
    await assertFails(create(EVE, { freq: 'daily' }));
  });
});

describe('update', () => {
  beforeEach(async () => {
    await seedTask(env(), 'task-1', {
      scheduledFor: '2026-10-04',
      recurrence: { freq: 'weekly', interval: 2, weekdays: [0, 3], anchor: '2026-10-04' }
    });
  });

  for (const [label, recurrence] of VALID) {
    it(`allowed: set to ${label}`, async () => {
      await assertSucceeds(update(BOB, recurrence));
    });
  }
  for (const [label, recurrence] of INVALID) {
    it(`denied: set to ${label}`, async () => {
      await assertFails(update(BOB, recurrence));
    });
  }

  it("allowed: the previous client's edit of another field leaves the new keys as they are", async () => {
    await assertSucceeds(
      updateDoc(doc(as(env(), ALICE), path.task('task-1')), { ...touched(ALICE), notes: 'חדש' })
    );
  });

  it('allowed: the previous client rewriting the rule in its own shape', async () => {
    await assertSucceeds(update(ALICE, { freq: 'weekly', anchor: '2026-10-04' }));
  });

  it('denied: a dotted write that breaks the stored rule (weekdays on monthly)', async () => {
    await seedTask(env(), 'task-1', {
      recurrence: { freq: 'monthly', interval: 2, anchor: '2026-10-04' }
    });
    await assertFails(
      updateDoc(doc(as(env(), BOB), path.task('task-1')), {
        ...touched(BOB),
        'recurrence.weekdays': [1]
      })
    );
    await assertFails(
      updateDoc(doc(as(env(), BOB), path.task('task-1')), {
        ...touched(BOB),
        'recurrence.interval': 0
      })
    );
  });
});

describe('complete-batch with the next instance of a flexible series', () => {
  const SERIES = 'seriesFlex0000000001';

  async function seedSeries(recurrence: Record<string, unknown>) {
    await seedTask(env(), SERIES, { scheduledFor: '2026-10-04', recurrence });
  }

  function completeWithNext(uid: string, nextDate: string, recurrence: unknown) {
    const db = as(env(), uid);
    const b = writeBatch(db);
    b.update(doc(db, path.task(SERIES)), {
      ...touched(uid),
      status: 'done',
      completedAt: serverTimestamp(),
      completedBy: uid,
      completion: completionDoc()
    });
    b.set(doc(db, path.event(`done-${uid}`)), eventDoc(uid, 'completed', { taskId: SERIES }));
    b.set(
      doc(db, path.task(`${SERIES}__${nextDate}`)),
      taskDoc(uid, { scheduledFor: nextDate, recurrence, seriesId: SERIES })
    );
    return b.commit();
  }

  it('allowed: a daily series', async () => {
    await seedSeries({ freq: 'daily', anchor: '2026-10-04' });
    await assertSucceeds(
      completeWithNext(BOB, '2026-10-05', { freq: 'daily', anchor: '2026-10-04' })
    );
  });

  it('allowed: every 2 weeks on Sunday and Wednesday', async () => {
    const rule = { freq: 'weekly', interval: 2, weekdays: [0, 3], anchor: '2026-10-04' };
    await seedSeries(rule);
    await assertSucceeds(completeWithNext(BOB, '2026-10-07', rule));
  });

  it("allowed: the previous client's next instance of a flexible series (it drops the new keys)", async () => {
    await seedSeries({ freq: 'weekly', interval: 2, weekdays: [0, 3], anchor: '2026-10-04' });
    await assertSucceeds(
      completeWithNext(ALICE, '2026-10-11', { freq: 'weekly', anchor: '2026-10-04' })
    );
  });

  it('denied atomically: a next instance with an invalid rule fails the whole completion', async () => {
    await seedSeries({ freq: 'daily', anchor: '2026-10-04' });
    await assertFails(
      completeWithNext(BOB, '2026-10-05', { freq: 'daily', interval: 0, anchor: '2026-10-04' })
    );
  });
});
