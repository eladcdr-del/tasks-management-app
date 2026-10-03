import { describe, expect, it } from 'vitest';
import {
  bucketInfo,
  bucketOf,
  effectiveDate,
  groupTasks,
  needsAttention,
  openCountsByMember,
  pulseCounts,
  sortTasks
} from './buckets';
import type { Task } from './types';

// Fixture clock: Sunday 2026-10-04. The week runs Sun 10-04 .. Sat 10-10.
const TODAY = '2026-10-04';

let seq = 0;
function task(over: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `t${seq}`,
    title: `משימה ${seq}`,
    notes: '',
    categoryId: null,
    priority: 'normal',
    ownerId: 'u1',
    requestedBy: null,
    requestedAt: null,
    createdBy: 'u1',
    createdAt: 1_000 + seq,
    updatedBy: 'u1',
    updatedAt: 1_000 + seq,
    scheduledFor: null,
    dueDate: null,
    dueTime: null,
    hardDeadline: false,
    recurrence: null,
    seriesId: null,
    status: 'open',
    snoozeCount: 0,
    lastSnoozedAt: null,
    completedAt: null,
    completedBy: null,
    completion: null,
    ...over
  };
}
const ids = (ts: Task[]) => ts.map((t) => t.id);

describe('effectiveDate', () => {
  it('is the earlier of dueDate and scheduledFor', () => {
    expect(effectiveDate(task({ dueDate: '2026-10-09', scheduledFor: '2026-10-06' }))).toBe(
      '2026-10-06'
    );
    expect(effectiveDate(task({ dueDate: '2026-10-05', scheduledFor: '2026-10-20' }))).toBe(
      '2026-10-05'
    );
  });
  it('falls back to whichever exists, or null', () => {
    expect(effectiveDate(task({ dueDate: '2026-10-09' }))).toBe('2026-10-09');
    expect(effectiveDate(task({ scheduledFor: '2026-10-06' }))).toBe('2026-10-06');
    expect(effectiveDate(task())).toBeNull();
  });
});

describe('bucketOf (today = Sunday 2026-10-04)', () => {
  it('dueDate before today is overdue', () => {
    expect(bucketOf(task({ dueDate: '2026-10-03' }), TODAY)).toBe('overdue');
    expect(bucketOf(task({ dueDate: '2025-01-01' }), TODAY)).toBe('overdue');
  });

  it('overdue is decided by dueDate alone, even with a future soft plan', () => {
    expect(bucketOf(task({ dueDate: '2026-10-03', scheduledFor: '2026-10-06' }), TODAY)).toBe(
      'overdue'
    );
  });

  it('a past scheduledFor without a dueDate is NOT overdue, it stays in today', () => {
    expect(bucketOf(task({ scheduledFor: '2026-10-03' }), TODAY)).toBe('today');
  });

  it('due today or scheduled today is today', () => {
    expect(bucketOf(task({ dueDate: TODAY }), TODAY)).toBe('today');
    expect(bucketOf(task({ scheduledFor: TODAY }), TODAY)).toBe('today');
  });

  it('eff <= today when a soft plan has been missed but the deadline has not', () => {
    expect(bucketOf(task({ scheduledFor: '2026-10-02', dueDate: '2026-10-09' }), TODAY)).toBe(
      'today'
    );
  });

  it('eff is the earlier date: a due date pulls a far plan into the week and vice versa', () => {
    expect(bucketOf(task({ dueDate: '2026-10-05', scheduledFor: '2026-10-20' }), TODAY)).toBe(
      'week'
    );
    expect(bucketOf(task({ dueDate: '2026-10-20', scheduledFor: '2026-10-06' }), TODAY)).toBe(
      'week'
    );
  });

  it('tomorrow up to and including Saturday is week', () => {
    expect(bucketOf(task({ dueDate: '2026-10-05' }), TODAY)).toBe('week');
    expect(bucketOf(task({ scheduledFor: '2026-10-10' }), TODAY)).toBe('week');
  });

  it('the following Sunday and beyond is later', () => {
    expect(bucketOf(task({ dueDate: '2026-10-11' }), TODAY)).toBe('later');
    expect(bucketOf(task({ scheduledFor: '2027-03-01' }), TODAY)).toBe('later');
  });

  it('no dates at all is later', () => {
    expect(bucketOf(task(), TODAY)).toBe('later');
  });

  describe('week boundary (Saturday -> Sunday)', () => {
    it('on a Saturday the week is already over: tomorrow (Sunday) is later', () => {
      const sat = '2026-10-10';
      expect(bucketOf(task({ dueDate: '2026-10-10' }), sat)).toBe('today');
      expect(bucketOf(task({ dueDate: '2026-10-11' }), sat)).toBe('later');
    });
    it('on a Friday, Saturday is still this week', () => {
      expect(bucketOf(task({ dueDate: '2026-10-10' }), '2026-10-09')).toBe('week');
      expect(bucketOf(task({ dueDate: '2026-10-11' }), '2026-10-09')).toBe('later');
    });
    it('on the next Sunday a new week opens', () => {
      expect(bucketOf(task({ dueDate: '2026-10-17' }), '2026-10-11')).toBe('week');
      expect(bucketOf(task({ dueDate: '2026-10-18' }), '2026-10-11')).toBe('later');
    });
    it('works across a year end (Thu 2026-12-31: week ends Sat 2027-01-02)', () => {
      expect(bucketOf(task({ dueDate: '2027-01-02' }), '2026-12-31')).toBe('week');
      expect(bucketOf(task({ dueDate: '2027-01-03' }), '2026-12-31')).toBe('later');
    });
    it('works across the DST weekend (Thu 2026-03-26: week ends Sat 03-28)', () => {
      expect(bucketOf(task({ dueDate: '2026-03-28' }), '2026-03-26')).toBe('week');
      expect(bucketOf(task({ dueDate: '2026-03-29' }), '2026-03-26')).toBe('later');
    });
  });
});

describe('bucketInfo / plannedFromPast', () => {
  it('flags a missed soft plan that is not overdue', () => {
    expect(bucketInfo(task({ scheduledFor: '2026-10-03' }), TODAY)).toEqual({
      bucket: 'today',
      plannedFromPast: true
    });
  });

  it('flags it also when a future dueDate is still ahead', () => {
    expect(bucketInfo(task({ scheduledFor: '2026-10-03', dueDate: '2026-10-09' }), TODAY)).toEqual({
      bucket: 'today',
      plannedFromPast: true
    });
  });

  it('does not flag it once the task is overdue', () => {
    expect(bucketInfo(task({ scheduledFor: '2026-10-02', dueDate: '2026-10-03' }), TODAY)).toEqual({
      bucket: 'overdue',
      plannedFromPast: false
    });
  });

  it('does not flag tasks planned for today, nor due-only tasks', () => {
    expect(bucketInfo(task({ scheduledFor: TODAY }), TODAY).plannedFromPast).toBe(false);
    expect(bucketInfo(task({ dueDate: TODAY }), TODAY).plannedFromPast).toBe(false);
    expect(bucketInfo(task({ dueDate: '2026-10-09' }), TODAY).plannedFromPast).toBe(false);
    expect(bucketInfo(task(), TODAY)).toEqual({ bucket: 'later', plannedFromPast: false });
  });

  it('agrees with bucketOf', () => {
    for (const t of [
      task({ dueDate: '2026-10-03' }),
      task({ scheduledFor: '2026-10-05' }),
      task({ scheduledFor: '2026-12-05' })
    ]) {
      expect(bucketInfo(t, TODAY).bucket).toBe(bucketOf(t, TODAY));
    }
  });
});

describe('needsAttention', () => {
  it('is true for overdue tasks', () => {
    expect(needsAttention(task({ dueDate: '2026-10-03' }), TODAY)).toBe(true);
  });
  it('is true for urgent tasks whatever their date', () => {
    expect(needsAttention(task({ priority: 'urgent' }), TODAY)).toBe(true);
    expect(needsAttention(task({ priority: 'urgent', dueDate: '2027-01-01' }), TODAY)).toBe(true);
  });
  it('is false for high/normal tasks that are not overdue', () => {
    expect(needsAttention(task({ priority: 'high', dueDate: TODAY }), TODAY)).toBe(false);
    expect(needsAttention(task({ scheduledFor: '2026-10-01' }), TODAY)).toBe(false); // missed plan only
    expect(needsAttention(task(), TODAY)).toBe(false);
  });
});

describe('sortTasks', () => {
  it('orders by priority: urgent, then high, then normal', () => {
    const n = task({ priority: 'normal' });
    const h = task({ priority: 'high' });
    const u = task({ priority: 'urgent' });
    expect(ids(sortTasks([n, h, u]))).toEqual([u.id, h.id, n.id]);
  });

  it('then by effective date ascending, tasks without a date last', () => {
    const none = task();
    const late = task({ dueDate: '2026-10-09' });
    const early = task({ scheduledFor: '2026-10-05' });
    const mixed = task({ dueDate: '2026-10-08', scheduledFor: '2026-10-06' }); // eff = 10-06
    expect(ids(sortTasks([none, late, mixed, early]))).toEqual([
      early.id,
      mixed.id,
      late.id,
      none.id
    ]);
  });

  it('then by createdAt ascending (oldest first)', () => {
    const newer = task({ dueDate: '2026-10-05', createdAt: 500 });
    const older = task({ dueDate: '2026-10-05', createdAt: 100 });
    expect(ids(sortTasks([newer, older]))).toEqual([older.id, newer.id]);
  });

  it('priority beats date, date beats age', () => {
    const urgentLate = task({ priority: 'urgent', dueDate: '2026-12-01', createdAt: 900 });
    const normalSoon = task({ priority: 'normal', dueDate: '2026-10-05', createdAt: 100 });
    expect(ids(sortTasks([normalSoon, urgentLate]))).toEqual([urgentLate.id, normalSoon.id]);
  });

  it('is stable: fully equal keys keep their input order', () => {
    const a = task({ createdAt: 7 });
    const b = task({ createdAt: 7 });
    const c = task({ createdAt: 7 });
    expect(ids(sortTasks([b, c, a]))).toEqual([b.id, c.id, a.id]);
  });

  it('returns a new array and leaves the input untouched', () => {
    const input = [task({ priority: 'normal' }), task({ priority: 'urgent' })];
    const copy = [...input];
    const out = sortTasks(input);
    expect(out).not.toBe(input);
    expect(input).toEqual(copy);
  });
});

describe('groupTasks', () => {
  // A cast of tasks, one per interesting situation. Owner u1/u2, or null = waiting for someone.
  const overdueMine = task({ dueDate: '2026-10-02', ownerId: 'u1' });
  const overdueUnowned = task({ dueDate: '2026-10-01', ownerId: null });
  const urgentLater = task({ priority: 'urgent', dueDate: '2026-12-01', ownerId: 'u2' });
  const urgentUnowned = task({ priority: 'urgent', ownerId: null });
  const todayMine = task({ scheduledFor: TODAY, ownerId: 'u1' });
  const todayUnowned = task({ dueDate: TODAY, ownerId: null });
  const missedPlan = task({ scheduledFor: '2026-10-03', ownerId: 'u2' });
  const weekMine = task({ dueDate: '2026-10-08', ownerId: 'u1' });
  const weekUnowned = task({ scheduledFor: '2026-10-09', ownerId: null });
  const laterMine = task({ dueDate: '2026-11-15', ownerId: 'u2' });
  const laterUnowned = task({ ownerId: null });
  const all = [
    overdueMine,
    overdueUnowned,
    urgentLater,
    urgentUnowned,
    todayMine,
    todayUnowned,
    missedPlan,
    weekMine,
    weekUnowned,
    laterMine,
    laterUnowned
  ];
  const g = groupTasks(all, TODAY);

  it('attention holds every overdue or urgent task, owned or not', () => {
    expect(new Set(ids(g.attention))).toEqual(
      new Set([overdueMine.id, overdueUnowned.id, urgentLater.id, urgentUnowned.id])
    );
  });

  it('waiting holds the unowned tasks that are not already in attention', () => {
    expect(new Set(ids(g.waiting))).toEqual(
      new Set([todayUnowned.id, weekUnowned.id, laterUnowned.id])
    );
  });

  it('no task is in both attention and waiting', () => {
    const attention = new Set(ids(g.attention));
    for (const t of g.waiting) expect(attention.has(t.id)).toBe(false);
  });

  it('the time buckets never repeat a task that is in attention', () => {
    const attention = new Set(ids(g.attention));
    for (const t of [...g.today, ...g.week, ...g.later]) expect(attention.has(t.id)).toBe(false);
  });

  it('puts the rest into today / week / later by bucketOf', () => {
    expect(new Set(ids(g.today))).toEqual(new Set([todayMine.id, todayUnowned.id, missedPlan.id]));
    expect(new Set(ids(g.week))).toEqual(new Set([weekMine.id, weekUnowned.id]));
    expect(new Set(ids(g.later))).toEqual(new Set([laterMine.id, laterUnowned.id]));
  });

  it('keeps unowned tasks in their time bucket as well (waiting is a call-out, not a bucket)', () => {
    expect(ids(g.today)).toContain(todayUnowned.id);
    expect(ids(g.week)).toContain(weekUnowned.id);
    expect(ids(g.later)).toContain(laterUnowned.id);
  });

  it('attention + today + week + later covers every task exactly once', () => {
    const everything = [...g.attention, ...g.today, ...g.week, ...g.later];
    expect(everything).toHaveLength(all.length);
    expect(new Set(ids(everything)).size).toBe(all.length);
  });

  it('sorts every list by priority, then effective date (nulls last), then createdAt', () => {
    // attention: both urgent first (urgentLater has a date, urgentUnowned has none -> nulls last),
    // then the normal overdue ones by date.
    expect(ids(g.attention)).toEqual([
      urgentLater.id,
      urgentUnowned.id,
      overdueUnowned.id,
      overdueMine.id
    ]);
    // today: missedPlan (eff 10-03) before the two tasks dated today (tie broken by createdAt)
    expect(ids(g.today)).toEqual([missedPlan.id, todayMine.id, todayUnowned.id]);
    // waiting: dated before undated
    expect(ids(g.waiting)).toEqual([todayUnowned.id, weekUnowned.id, laterUnowned.id]);
  });

  it('puts high priority ahead of normal inside a bucket', () => {
    const normal = task({ dueDate: '2026-10-05' });
    const high = task({ dueDate: '2026-10-09', priority: 'high' });
    expect(ids(groupTasks([normal, high], TODAY).week)).toEqual([high.id, normal.id]);
  });

  it('does not mutate its input', () => {
    const input = [laterMine, overdueMine, todayMine];
    const snapshot = [...input];
    groupTasks(input, TODAY);
    expect(input).toEqual(snapshot);
  });

  it('returns five empty lists for no tasks', () => {
    expect(groupTasks([], TODAY)).toEqual({
      attention: [],
      waiting: [],
      today: [],
      week: [],
      later: []
    });
  });
});

describe('pulseCounts', () => {
  it('counts attention, today and waiting exactly as groupTasks lists them', () => {
    const open = [
      task({ dueDate: '2026-10-02' }), // attention
      task({ priority: 'urgent', ownerId: null }), // attention (not waiting)
      task({ scheduledFor: TODAY }), // today
      task({ dueDate: TODAY, ownerId: null }), // today + waiting
      task({ dueDate: '2026-10-08', ownerId: null }), // week + waiting
      task({ dueDate: '2026-11-01' }) // later
    ];
    expect(pulseCounts(open, TODAY)).toEqual({ attention: 2, today: 2, waiting: 2 });
  });

  it('is all zeros for an empty list', () => {
    expect(pulseCounts([], TODAY)).toEqual({ attention: 0, today: 0, waiting: 0 });
  });
});

describe('openCountsByMember', () => {
  it('counts open tasks per owner and includes members with none', () => {
    const open = [task({ ownerId: 'u1' }), task({ ownerId: 'u1' }), task({ ownerId: 'u2' })];
    expect(openCountsByMember(open, ['u1', 'u2', 'u3'])).toEqual({ u1: 2, u2: 1, u3: 0 });
  });

  it('ignores unowned tasks and owners who are not in the list', () => {
    const open = [task({ ownerId: null }), task({ ownerId: 'ghost' }), task({ ownerId: 'u1' })];
    expect(openCountsByMember(open, ['u1'])).toEqual({ u1: 1 });
  });

  it('handles no members', () => {
    expect(openCountsByMember([task()], [])).toEqual({});
  });

  it('is not fooled by owner ids that collide with Object.prototype keys', () => {
    const open = [
      task({ ownerId: 'constructor' }),
      task({ ownerId: '__proto__' }),
      task({ ownerId: 'u1' })
    ];
    expect(openCountsByMember(open, ['u1'])).toEqual({ u1: 1 });
  });
});
