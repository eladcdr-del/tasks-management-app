import { describe, expect, it } from 'vitest';
import { bucketOf, needsAttention } from './buckets';
import {
  snoozeBlockedReason,
  snoozeMaxDate,
  snoozeOptions,
  snoozePatch,
  snoozeTargets
} from './snooze';
import type { Task } from './types';

// Fixture clock: Sunday 2026-10-04 (the week runs Sun 10-04 .. Sat 10-10).
const TODAY = '2026-10-04';
const NOW = Date.parse('2026-10-04T09:00:00+03:00');

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'לתקן את הברז',
    notes: '',
    categoryId: 'home',
    priority: 'normal',
    ownerId: 'u1',
    requestedBy: null,
    requestedAt: null,
    createdBy: 'u1',
    createdAt: 1_000,
    updatedBy: 'u1',
    updatedAt: 1_000,
    scheduledFor: null,
    weekPlan: false,
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

describe('snoozeTargets', () => {
  it('on a Sunday: tomorrow, the coming Friday, next Sunday, +1 month', () => {
    expect(snoozeTargets(TODAY)).toEqual({
      tomorrow: '2026-10-05',
      weekend: '2026-10-09',
      nextWeek: '2026-10-11',
      month: '2026-11-04'
    });
  });

  it('on a Thursday the weekend target is tomorrow (the coming Friday)', () => {
    expect(snoozeTargets('2026-10-08')).toEqual({
      tomorrow: '2026-10-09',
      weekend: '2026-10-09',
      nextWeek: '2026-10-11',
      month: '2026-11-08'
    });
  });

  it('on a Friday or Saturday the weekend target is NEXT Friday', () => {
    expect(snoozeTargets('2026-10-09').weekend).toBe('2026-10-16');
    expect(snoozeTargets('2026-10-10').weekend).toBe('2026-10-16');
  });

  it('next week is always the next Sunday (from Saturday that is tomorrow, from Sunday a week)', () => {
    expect(snoozeTargets('2026-10-10').nextWeek).toBe('2026-10-11');
    expect(snoozeTargets('2026-10-11').nextWeek).toBe('2026-10-18');
  });

  it('+1 month clamps to the end of a shorter month, and crosses a year end', () => {
    expect(snoozeTargets('2026-01-31').month).toBe('2026-02-28');
    expect(snoozeTargets('2026-12-31')).toEqual({
      tomorrow: '2027-01-01',
      weekend: '2027-01-01',
      nextWeek: '2027-01-03',
      month: '2027-01-31'
    });
  });
});

describe('snoozeOptions', () => {
  const all = [
    { key: 'tomorrow', date: '2026-10-05' },
    { key: 'weekend', date: '2026-10-09' },
    { key: 'nextWeek', date: '2026-10-11' },
    { key: 'month', date: '2026-11-04' }
  ];

  it('offers all four keys (the labels live in i18n/format) for a plan-only or undated task', () => {
    expect(snoozeOptions(task(), TODAY)).toEqual(all);
    expect(snoozeOptions(task({ scheduledFor: TODAY }), TODAY)).toEqual(all);
  });

  it('offers all four for a soft due date (it moves with the snooze)', () => {
    expect(snoozeOptions(task({ dueDate: '2026-10-06' }), TODAY)).toEqual(all);
  });

  it('under a hard deadline ahead, drops every option after the deadline', () => {
    const hard = (dueDate: string) => snoozeOptions(task({ dueDate, hardDeadline: true }), TODAY);
    expect(hard('2026-10-07').map((o) => o.key)).toEqual(['tomorrow']);
    expect(hard('2026-10-09').map((o) => o.key)).toEqual(['tomorrow', 'weekend']); // on the deadline is fine
    expect(hard('2026-12-01')).toEqual(all);
  });

  it('a hard deadline today leaves nothing to snooze to', () => {
    expect(snoozeOptions(task({ dueDate: TODAY, hardDeadline: true }), TODAY)).toEqual([]);
  });

  it('a MISSED hard deadline offers everything (snoozing turns it into a moved date)', () => {
    expect(snoozeOptions(task({ dueDate: '2026-10-01', hardDeadline: true }), TODAY)).toEqual(all);
  });

  it('never offers the same date twice: the earlier key in מחר > סוף השבוע > שבוע הבא wins', () => {
    // Thursday: tomorrow is the coming Friday
    expect(snoozeOptions(task(), '2026-10-08')).toEqual([
      { key: 'tomorrow', date: '2026-10-09' },
      { key: 'nextWeek', date: '2026-10-11' },
      { key: 'month', date: '2026-11-08' }
    ]);
    // Saturday: tomorrow is next Sunday
    expect(snoozeOptions(task(), '2026-10-10')).toEqual([
      { key: 'tomorrow', date: '2026-10-11' },
      { key: 'weekend', date: '2026-10-16' },
      { key: 'month', date: '2026-11-10' }
    ]);
  });

  it('sorts by date: on Friday "שבוע הבא" (Sunday) comes before "סוף השבוע" (next Friday)', () => {
    expect(snoozeOptions(task(), '2026-10-09')).toEqual([
      { key: 'tomorrow', date: '2026-10-10' },
      { key: 'nextWeek', date: '2026-10-11' },
      { key: 'weekend', date: '2026-10-16' },
      { key: 'month', date: '2026-11-09' }
    ]);
  });

  it('every day of a year: dates strictly ascending, unique, after today, within a month', () => {
    let day = '2026-01-01';
    for (let i = 0; i < 366; i++) {
      const dates = snoozeOptions(task(), day).map((o) => o.date);
      expect(dates.length).toBeGreaterThanOrEqual(3);
      dates.forEach((d, j) => {
        expect(d > day).toBe(true);
        if (j > 0) expect(d > (dates[j - 1] as string)).toBe(true);
      });
      expect(dates.at(-1)).toBe(snoozeTargets(day).month);
      day = snoozeTargets(day).tomorrow;
    }
  });
});

describe('snoozeMaxDate / snoozeBlockedReason', () => {
  it('caps at a hard deadline that is today or ahead', () => {
    expect(snoozeMaxDate(task({ dueDate: '2026-10-09', hardDeadline: true }), TODAY)).toBe(
      '2026-10-09'
    );
    expect(snoozeMaxDate(task({ dueDate: TODAY, hardDeadline: true }), TODAY)).toBe(TODAY);
  });

  it('has no cap without a hard deadline, or once it was missed (it then moves)', () => {
    expect(snoozeMaxDate(task(), TODAY)).toBeNull();
    expect(snoozeMaxDate(task({ dueDate: '2026-10-09' }), TODAY)).toBeNull();
    expect(snoozeMaxDate(task({ dueDate: '2026-10-01', hardDeadline: true }), TODAY)).toBeNull();
    expect(snoozeMaxDate(task({ hardDeadline: true }), TODAY)).toBeNull(); // a flag without a date
  });

  it('blocks snoozing only on the last day of a hard deadline', () => {
    expect(snoozeBlockedReason(task({ dueDate: TODAY, hardDeadline: true }), TODAY)).toBe(
      'deadline-today'
    );
    expect(snoozeBlockedReason(task({ dueDate: '2026-10-05', hardDeadline: true }), TODAY)).toBe(
      null
    );
    expect(snoozeBlockedReason(task({ dueDate: TODAY }), TODAY)).toBeNull();
    expect(snoozeBlockedReason(task({ dueDate: '2026-10-01', hardDeadline: true }), TODAY)).toBe(
      null
    );
    expect(snoozeBlockedReason(task(), TODAY)).toBeNull();
  });

  it('agrees with snoozeOptions: blocked means no options, a cap keeps only dates up to it', () => {
    const blocked = task({ dueDate: TODAY, hardDeadline: true });
    expect(snoozeOptions(blocked, TODAY)).toEqual([]);
    const capped = task({ dueDate: '2026-10-07', hardDeadline: true });
    const max = snoozeMaxDate(capped, TODAY) as string;
    expect(snoozeOptions(capped, TODAY).every((o) => o.date <= max)).toBe(true);
  });
});

describe('snoozePatch', () => {
  it('always sets scheduledFor (a day: weekPlan false), bumps snoozeCount, stamps lastSnoozedAt', () => {
    expect(snoozePatch(task({ snoozeCount: 2 }), '2026-10-09', NOW, TODAY)).toEqual({
      scheduledFor: '2026-10-09',
      weekPlan: false,
      snoozeCount: 3,
      lastSnoozedAt: NOW
    });
  });

  it('plan-only: moves the plan and touches nothing else', () => {
    const patch = snoozePatch(task({ scheduledFor: '2026-10-03' }), '2026-10-05', NOW, TODAY);
    expect(patch).toEqual({
      scheduledFor: '2026-10-05',
      weekPlan: false,
      snoozeCount: 1,
      lastSnoozedAt: NOW
    });
    expect(patch).not.toHaveProperty('dueDate');
    expect(patch).not.toHaveProperty('hardDeadline');
  });

  it('a week plan becomes a day plan (snooze targets are days)', () => {
    const weekPlan = task({ scheduledFor: '2026-10-10', weekPlan: true });
    expect(snoozePatch(weekPlan, '2026-10-11', NOW, TODAY)).toEqual({
      scheduledFor: '2026-10-11',
      weekPlan: false,
      snoozeCount: 1,
      lastSnoozedAt: NOW
    });
  });

  it('a soft due date moves with the snooze', () => {
    expect(snoozePatch(task({ dueDate: '2026-10-06' }), '2026-10-11', NOW, TODAY)).toEqual({
      scheduledFor: '2026-10-11',
      weekPlan: false,
      dueDate: '2026-10-11',
      snoozeCount: 1,
      lastSnoozedAt: NOW
    });
    // ...and an overdue soft due date too
    expect(snoozePatch(task({ dueDate: '2026-10-01' }), '2026-10-05', NOW, TODAY).dueDate).toBe(
      '2026-10-05'
    );
  });

  it('a hard deadline today or ahead stays put: only the plan moves', () => {
    const ahead = snoozePatch(
      task({ dueDate: '2026-10-09', hardDeadline: true }),
      '2026-10-05',
      NOW,
      TODAY
    );
    expect(ahead).toEqual({
      scheduledFor: '2026-10-05',
      weekPlan: false,
      snoozeCount: 1,
      lastSnoozedAt: NOW
    });
    expect(ahead).not.toHaveProperty('dueDate');
    expect(ahead).not.toHaveProperty('hardDeadline');
    const dueToday = snoozePatch(
      task({ dueDate: TODAY, hardDeadline: true }),
      '2026-10-05',
      NOW,
      TODAY
    );
    expect(dueToday).not.toHaveProperty('dueDate');
  });

  it('a MISSED hard deadline becomes a moved, SOFT date (council A-M1)', () => {
    const missed = task({ dueDate: '2026-10-01', hardDeadline: true });
    const patch = snoozePatch(missed, '2026-10-05', NOW, TODAY);
    expect(patch).toEqual({
      scheduledFor: '2026-10-05',
      weekPlan: false,
      dueDate: '2026-10-05',
      hardDeadline: false,
      snoozeCount: 1,
      lastSnoozedAt: NOW
    });
    // no fake lock-clock afterwards: it is neither attention-worthy as a hard deadline nor capped
    const after = { ...missed, ...patch };
    expect(needsAttention(after, '2026-10-04')).toBe(false);
    expect(snoozeMaxDate(after, TODAY)).toBeNull();
  });

  it('a soft due date never gains a hardDeadline key', () => {
    expect(
      snoozePatch(task({ dueDate: '2026-10-01' }), '2026-10-05', NOW, TODAY)
    ).not.toHaveProperty('hardDeadline');
  });

  it('has a visible effect: the task leaves today / overdue for the target bucket', () => {
    const overdue = task({ dueDate: '2026-10-01' });
    expect(bucketOf(overdue, TODAY)).toBe('overdue');
    // next Sunday is past this week's horizon (Saturday 10-10)
    expect(bucketOf({ ...overdue, ...snoozePatch(overdue, '2026-10-11', NOW, TODAY) }, TODAY)).toBe(
      'later'
    );
    const dueSoon = task({ dueDate: TODAY });
    expect(bucketOf({ ...dueSoon, ...snoozePatch(dueSoon, '2026-10-05', NOW, TODAY) }, TODAY)).toBe(
      'week'
    );
  });

  it('urgent: snoozing takes it out of attention until its new date', () => {
    const urgent = task({ priority: 'urgent' });
    expect(needsAttention(urgent, TODAY)).toBe(true);
    const snoozed = { ...urgent, ...snoozePatch(urgent, '2026-10-11', NOW, TODAY) };
    expect(needsAttention(snoozed, TODAY)).toBe(false);
    expect(needsAttention(snoozed, '2026-10-10')).toBe(false);
    expect(needsAttention(snoozed, '2026-10-11')).toBe(true);
    // an urgent task with a hard deadline ahead: the deadline stays, attention returns on the plan date
    const urgentHard = task({ priority: 'urgent', dueDate: '2026-10-09', hardDeadline: true });
    const snoozedHard = { ...urgentHard, ...snoozePatch(urgentHard, '2026-10-05', NOW, TODAY) };
    expect(snoozedHard.dueDate).toBe('2026-10-09');
    expect(needsAttention(snoozedHard, TODAY)).toBe(false);
    expect(needsAttention(snoozedHard, '2026-10-05')).toBe(true);
  });

  it('never touches the recurrence (the anchor is immune to snoozes) and does not mutate', () => {
    const recurring = task({
      recurrence: { freq: 'monthly', anchor: '2026-09-04' },
      seriesId: 's',
      dueDate: TODAY
    });
    const snapshot = structuredClone(recurring);
    const patch = snoozePatch(recurring, '2026-10-09', NOW, TODAY);
    expect(Object.keys(patch).sort()).toEqual([
      'dueDate',
      'lastSnoozedAt',
      'scheduledFor',
      'snoozeCount',
      'weekPlan'
    ]);
    expect(recurring).toEqual(snapshot);
  });
});
