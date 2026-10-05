// Flexible recurrence rules: daily, every N days / weeks / months / years, and listed weekdays
// ("every Sunday and Wednesday"), on top of the anchor model tested in recurrence.test.ts.
// Calendar: Sun 2026-10-04, Mon 05, Tue 06, Wed 07, Thu 08, Fri 09, Sat 10, Sun 11 … Wed 14, Sun 18.

import { describe, expect, it } from 'vitest';
import { addDays, addMonths, diffDays, startOfWeek, weekday } from './dates';
import {
  buildNextInstance,
  ensureAnchor,
  firstPlanDate,
  intervalOf,
  nextOccurrence,
  normalizeRecurrence,
  recurrenceProblem,
  ruleOf,
  sameRule,
  weekdaysOf
} from './recurrence';
import { snoozePatch } from './snooze';
import type { Recurrence, RecurrenceFreq, Task } from './types';

function task(over: Partial<Task> = {}): Task {
  return {
    id: 'task1',
    title: 'להשקות עציצים',
    notes: '',
    categoryId: 'home',
    priority: 'normal',
    ownerId: 'u1',
    requestedBy: null,
    requestedAt: null,
    createdBy: 'u1',
    createdAt: 1_000,
    updatedBy: 'u1',
    updatedAt: 2_000,
    scheduledFor: null,
    weekPlan: false,
    dueDate: null,
    dueTime: null,
    hardDeadline: false,
    recurrence: { freq: 'weekly' },
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

describe('nextOccurrence: daily and every N days', () => {
  const daily = (over: Partial<Task> = {}, interval?: number) =>
    task({ recurrence: { freq: 'daily', ...(interval ? { interval } : {}) }, ...over });

  it('every day: the next day', () => {
    expect(nextOccurrence(daily({ scheduledFor: '2026-10-04' }), '2026-10-04')).toBe('2026-10-05');
    expect(nextOccurrence(daily({ dueDate: '2026-10-04' }), '2026-10-04')).toBe('2026-10-05');
  });

  it('completed early: the day after the instance date', () => {
    expect(nextOccurrence(daily({ scheduledFor: '2026-10-06' }), '2026-10-04')).toBe('2026-10-07');
  });

  it('completed late: one next instance, the day after the completion (no burst)', () => {
    expect(nextOccurrence(daily({ dueDate: '2026-09-20' }), '2026-10-04')).toBe('2026-10-05');
  });

  it('an undated daily task follows the completion day', () => {
    expect(nextOccurrence(daily(), '2026-10-04')).toBe('2026-10-05');
  });

  it('every 2 days keeps its rhythm from the anchor', () => {
    const t = (scheduledFor: string) =>
      task({ scheduledFor, recurrence: { freq: 'daily', interval: 2, anchor: '2026-10-04' } });
    expect(nextOccurrence(t('2026-10-04'), '2026-10-04')).toBe('2026-10-06');
    expect(nextOccurrence(t('2026-10-04'), '2026-10-05')).toBe('2026-10-06');
    // done a day late: 10-06 is past, the series goes on at 10-08 (not 10-09)
    expect(nextOccurrence(t('2026-10-06'), '2026-10-07')).toBe('2026-10-08');
    // a snoozed instance (moved to 10-09) does not shift the series: 10-10 is next
    expect(nextOccurrence(t('2026-10-09'), '2026-10-09')).toBe('2026-10-10');
  });

  it('every 3 days across a month end and a year end', () => {
    expect(nextOccurrence(daily({ dueDate: '2026-10-30' }, 3), '2026-10-30')).toBe('2026-11-02');
    expect(nextOccurrence(daily({ dueDate: '2026-12-30' }, 3), '2026-12-30')).toBe('2027-01-02');
  });

  it('leap years: Feb 28 → Feb 29 in 2028, → Mar 1 in 2027', () => {
    expect(nextOccurrence(daily({ dueDate: '2028-02-28' }), '2028-02-28')).toBe('2028-02-29');
    expect(nextOccurrence(daily({ dueDate: '2027-02-28' }), '2027-02-28')).toBe('2027-03-01');
    expect(nextOccurrence(daily({ dueDate: '2028-02-28' }, 2), '2028-02-28')).toBe('2028-03-01');
  });

  it('crosses the DST transitions without shifting a day', () => {
    expect(nextOccurrence(daily({ dueDate: '2026-03-26' }), '2026-03-26')).toBe('2026-03-27');
    expect(nextOccurrence(daily({ dueDate: '2026-03-27' }), '2026-03-27')).toBe('2026-03-28');
    expect(nextOccurrence(daily({ dueDate: '2026-10-24' }), '2026-10-24')).toBe('2026-10-25');
    expect(nextOccurrence(daily({ dueDate: '2026-10-25' }), '2026-10-25')).toBe('2026-10-26');
  });

  it('a year late is still a single step past the completion day, on the series', () => {
    // every 7 days from Saturday 2025-10-04: Saturdays; the first one after Sun 2026-10-04
    expect(nextOccurrence(daily({ dueDate: '2025-10-04' }, 7), '2026-10-04')).toBe('2026-10-10');
    expect(nextOccurrence(daily({ dueDate: '2025-10-04' }, 1), '2026-10-04')).toBe('2026-10-05');
  });
});

describe('nextOccurrence: every N weeks', () => {
  const weeks = (n: number, over: Partial<Task>) =>
    task({ recurrence: { freq: 'weekly', interval: n }, ...over });

  it('every 2 weeks: +14 days, keeping the weekday', () => {
    expect(nextOccurrence(weeks(2, { dueDate: '2026-10-04' }), '2026-10-04')).toBe('2026-10-18');
  });

  it('every 2 weeks, completed late: the next on-week date after the completion', () => {
    expect(nextOccurrence(weeks(2, { dueDate: '2026-10-04' }), '2026-10-20')).toBe('2026-11-01');
    expect(nextOccurrence(weeks(2, { dueDate: '2026-10-04' }), '2026-10-18')).toBe('2026-11-01');
  });

  it('every 3 weeks across the year', () => {
    expect(nextOccurrence(weeks(3, { dueDate: '2026-12-20' }), '2026-12-20')).toBe('2027-01-10');
  });

  it('interval 1 is plain weekly', () => {
    expect(nextOccurrence(weeks(1, { dueDate: '2026-10-04' }), '2026-10-04')).toBe('2026-10-11');
  });
});

describe('nextOccurrence: listed weekdays', () => {
  const SUN_WED = [0, 3];
  const days = (weekdays: number[], over: Partial<Task> = {}, interval?: number) =>
    task({
      recurrence: { freq: 'weekly', weekdays, ...(interval ? { interval } : {}) },
      ...over
    });
  const anchored = (scheduledFor: string, interval?: number) =>
    task({
      scheduledFor,
      recurrence: {
        freq: 'weekly',
        weekdays: SUN_WED,
        anchor: '2026-10-04',
        ...(interval ? { interval } : {})
      }
    });

  it('Sunday and Wednesday: Sun → Wed → Sun (wraps into the next week)', () => {
    expect(nextOccurrence(days(SUN_WED, { scheduledFor: '2026-10-04' }), '2026-10-04')).toBe(
      '2026-10-07'
    );
    expect(nextOccurrence(anchored('2026-10-07'), '2026-10-07')).toBe('2026-10-11');
    expect(nextOccurrence(anchored('2026-10-11'), '2026-10-11')).toBe('2026-10-14');
  });

  it('completed late: the first listed day after the completion (missed ones are skipped)', () => {
    expect(nextOccurrence(anchored('2026-10-04'), '2026-10-08')).toBe('2026-10-11');
    expect(nextOccurrence(anchored('2026-10-04'), '2026-10-15')).toBe('2026-10-18');
  });

  it('completed early: the first listed day after the instance date', () => {
    expect(nextOccurrence(anchored('2026-10-07'), '2026-10-05')).toBe('2026-10-11');
  });

  it('a first date that is not a listed day still leads into the listed days', () => {
    // Monday 10-05, every Sunday and Wednesday → Wednesday 10-07
    expect(nextOccurrence(days(SUN_WED, { scheduledFor: '2026-10-05' }), '2026-10-05')).toBe(
      '2026-10-07'
    );
  });

  it('Saturday wraps to Sunday', () => {
    expect(nextOccurrence(days([0, 6], { dueDate: '2026-10-10' }), '2026-10-10')).toBe(
      '2026-10-11'
    );
    expect(nextOccurrence(days([6], { dueDate: '2026-10-10' }), '2026-10-10')).toBe('2026-10-17');
  });

  it('all seven days behaves like every day', () => {
    expect(
      nextOccurrence(days([0, 1, 2, 3, 4, 5, 6], { dueDate: '2026-10-08' }), '2026-10-08')
    ).toBe('2026-10-09');
  });

  it('every 2 weeks on Sunday and Wednesday: the off-week is skipped', () => {
    expect(nextOccurrence(anchored('2026-10-04', 2), '2026-10-04')).toBe('2026-10-07');
    expect(nextOccurrence(anchored('2026-10-07', 2), '2026-10-07')).toBe('2026-10-18'); // not 10-11
    expect(nextOccurrence(anchored('2026-10-18', 2), '2026-10-18')).toBe('2026-10-21');
    expect(nextOccurrence(anchored('2026-10-21', 2), '2026-10-21')).toBe('2026-11-01');
    // completed in the off-week: the next on-week's first day
    expect(nextOccurrence(anchored('2026-10-07', 2), '2026-10-12')).toBe('2026-10-18');
    // completed on the on-week's Monday: its Wednesday
    expect(nextOccurrence(anchored('2026-10-18', 2), '2026-10-19')).toBe('2026-10-21');
  });

  it('every 2 weeks, anchored mid-week: the anchor week is the on-week', () => {
    // anchor = Wed 10-07 (its own date), in the week of Sun 10-04
    expect(nextOccurrence(days(SUN_WED, { scheduledFor: '2026-10-07' }, 2), '2026-10-07')).toBe(
      '2026-10-18'
    );
  });

  it('a snoozed instance does not shift the days', () => {
    const instance = anchored('2026-10-07');
    const snoozed: Task = { ...instance, ...snoozePatch(instance, '2026-10-09', 5, '2026-10-07') };
    expect(snoozed.recurrence).toEqual(instance.recurrence);
    expect(nextOccurrence(snoozed, '2026-10-09')).toBe('2026-10-11');
    // snoozed past a listed day: that day is skipped, not doubled
    const later: Task = { ...instance, ...snoozePatch(instance, '2026-10-12', 5, '2026-10-07') };
    expect(nextOccurrence(later, '2026-10-12')).toBe('2026-10-14');
  });

  it('a single listed day equals the plain weekly series on that day', () => {
    expect(nextOccurrence(days([2], { dueDate: '2026-10-06' }), '2026-10-06')).toBe(
      nextOccurrence(task({ dueDate: '2026-10-06' }), '2026-10-06')
    );
  });

  it('stored days out of order or repeated are read sorted and unique', () => {
    expect(nextOccurrence(days([3, 0, 3], { scheduledFor: '2026-10-04' }), '2026-10-04')).toBe(
      '2026-10-07'
    );
  });

  it('weekdays on a rule that is not weekly are ignored', () => {
    expect(
      nextOccurrence(
        task({ recurrence: { freq: 'monthly', weekdays: [3] }, dueDate: '2026-10-04' }),
        '2026-10-04'
      )
    ).toBe('2026-11-04');
  });
});

describe('nextOccurrence: every N months and years', () => {
  const months = (n: number, dueDate: string) =>
    task({ recurrence: { freq: 'monthly', interval: n }, dueDate });
  const years = (n: number, dueDate: string) =>
    task({ recurrence: { freq: 'yearly', interval: n }, dueDate });

  it('every 2 months keeps the day', () => {
    expect(nextOccurrence(months(2, '2026-10-15'), '2026-10-15')).toBe('2026-12-15');
  });

  it('every 2 months from the 31st clamps per month (Dec 31 → Feb 28 / Feb 29)', () => {
    expect(nextOccurrence(months(2, '2026-12-31'), '2026-12-31')).toBe('2027-02-28');
    expect(nextOccurrence(months(2, '2027-12-31'), '2027-12-31')).toBe('2028-02-29');
  });

  it('every 3 months, completed late: the next quarter after the completion', () => {
    expect(nextOccurrence(months(3, '2026-01-31'), '2026-05-02')).toBe('2026-07-31');
    expect(nextOccurrence(months(3, '2026-01-31'), '2026-04-30')).toBe('2026-07-31');
    expect(nextOccurrence(months(3, '2026-01-31'), '2026-04-29')).toBe('2026-04-30');
  });

  it('every 2 years from Feb 29', () => {
    expect(nextOccurrence(years(2, '2028-02-29'), '2028-02-29')).toBe('2030-02-28');
    expect(nextOccurrence(years(2, '2028-02-29'), '2030-03-01')).toBe('2032-02-29');
  });

  it('every 2 years, completed a year late', () => {
    expect(nextOccurrence(years(2, '2026-10-04'), '2027-11-01')).toBe('2028-10-04');
  });
});

describe('nextOccurrence matches a brute-force walk of the series (random rules)', () => {
  /** Mulberry32: deterministic pseudo-random numbers in [0, 1). */
  function rng(seed: number) {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
  }

  /** Is `d` (after the anchor) a date of the series? Written independently, without shortcuts. */
  function seriesTest(rule: Recurrence, anchor: string): (d: string) => boolean {
    const n = rule.interval ?? 1;
    const weekdays = rule.weekdays;
    switch (rule.freq) {
      case 'daily':
        return (d) => diffDays(d, anchor) % n === 0;
      case 'weekly':
        if (weekdays) {
          return (d) =>
            weekdays.includes(weekday(d)) &&
            (diffDays(startOfWeek(d), startOfWeek(anchor)) / 7) % n === 0;
        }
        return (d) => diffDays(d, anchor) % (7 * n) === 0;
      case 'monthly':
      case 'yearly': {
        // every anchor + k·step months for 60 years, each clamped on its own
        const step = rule.freq === 'monthly' ? n : 12 * n;
        const dates = new Set<string>();
        for (let k = 0; k <= 720; k += step) dates.add(addMonths(anchor, k));
        return (d) => dates.has(d);
      }
    }
  }

  it('800 random rules, anchors, instance dates and completion days', () => {
    const rand = rng(20261005);
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
    const freqs: RecurrenceFreq[] = ['daily', 'weekly', 'weekly', 'monthly', 'yearly'];
    for (let i = 0; i < 800; i++) {
      const freq = pick(freqs);
      const rule: Recurrence = { freq, interval: rand() < 0.4 ? 1 : 1 + Math.floor(rand() * 5) };
      if (freq === 'weekly' && rand() < 0.6) {
        const set = new Set<number>();
        const count = 1 + Math.floor(rand() * 4);
        while (set.size < count) set.add(Math.floor(rand() * 7));
        rule.weekdays = [...set].sort((a, b) => a - b);
      }
      const anchor = addDays('2026-01-01', Math.floor(rand() * 900));
      const own = addDays(anchor, Math.floor(rand() * 60));
      const done = addDays(own, Math.floor(rand() * 90) - 20);
      const next = nextOccurrence(
        task({ recurrence: { ...rule, anchor }, scheduledFor: own }),
        done
      );
      const floor = [anchor, own, done].sort().at(-1) as string;
      const onSeries = seriesTest(rule, anchor);
      let expected = addDays(floor, 1);
      while (!onSeries(expected)) expected = addDays(expected, 1);
      expect(next, JSON.stringify({ rule, anchor, own, done })).toBe(expected);
    }
  });
});

describe('buildNextInstance with flexible rules', () => {
  const NOW = 1_800_000_000_000;

  it('carries the canonical rule and the anchor', () => {
    const next = buildNextInstance(
      task({
        id: 's',
        scheduledFor: '2026-10-04',
        recurrence: { freq: 'weekly', interval: 2, weekdays: [3, 0] }
      }),
      '2026-10-04',
      NOW,
      'u1'
    );
    expect(next).toMatchObject({
      id: 's__2026-10-07',
      scheduledFor: '2026-10-07',
      dueDate: null,
      seriesId: 's',
      recurrence: { freq: 'weekly', interval: 2, weekdays: [0, 3], anchor: '2026-10-04' }
    });
  });

  it('drops a redundant interval of 1 and weekdays on a non-weekly rule', () => {
    const next = buildNextInstance(
      task({ dueDate: '2026-10-04', recurrence: { freq: 'daily', interval: 1, weekdays: [1] } }),
      '2026-10-04',
      NOW,
      'u1'
    );
    expect(next?.recurrence).toEqual({ freq: 'daily', anchor: '2026-10-04' });
  });

  it('a week plan stays a week plan only under a plain weekly rule', () => {
    const plan = { scheduledFor: '2026-10-10', weekPlan: true };
    expect(buildNextInstance(task(plan), '2026-10-06', NOW, 'u1')).toMatchObject({
      scheduledFor: '2026-10-17',
      weekPlan: true
    });
    expect(
      buildNextInstance(
        task({ ...plan, recurrence: { freq: 'weekly', interval: 2 } }),
        '2026-10-06',
        NOW,
        'u1'
      )
    ).toMatchObject({ scheduledFor: '2026-10-24', weekPlan: true });
    const others: Recurrence[] = [
      { freq: 'daily' },
      { freq: 'weekly', weekdays: [0, 3] },
      { freq: 'monthly' },
      { freq: 'yearly' }
    ];
    for (const recurrence of others) {
      const next = buildNextInstance(task({ ...plan, recurrence }), '2026-10-06', NOW, 'u1');
      expect(next?.weekPlan, recurrence.freq).toBe(false);
    }
  });

  it('daily over a week of on-time completions', () => {
    let current = task({ id: 'd', recurrence: { freq: 'daily' }, scheduledFor: '2026-10-04' });
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      current = buildNextInstance(current, current.scheduledFor as string, NOW, 'u1') as Task;
      dates.push(current.scheduledFor as string);
    }
    expect(dates).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11'
    ]);
    expect(current.recurrence).toEqual({ freq: 'daily', anchor: '2026-10-04' });
    expect(current.id).toBe('d__2026-10-11');
  });

  it('every 2 weeks on Sun+Wed over five generations, one of them done late', () => {
    let current = task({
      id: 'w',
      recurrence: { freq: 'weekly', interval: 2, weekdays: [0, 3] },
      dueDate: '2026-10-04'
    });
    const dates: string[] = [];
    const lateOn: Record<string, string> = { '2026-10-18': '2026-10-22' }; // Thu: skips Wed 10-21
    for (let i = 0; i < 5; i++) {
      const own = current.dueDate as string;
      current = buildNextInstance(current, lateOn[own] ?? own, NOW, 'u1') as Task;
      dates.push(current.dueDate as string);
    }
    expect(dates).toEqual(['2026-10-07', '2026-10-18', '2026-11-01', '2026-11-04', '2026-11-15']);
  });

  it('every 2 months from Jan 31 over five generations: back on the 31st whenever possible', () => {
    let current = task({
      id: 'm',
      recurrence: { freq: 'monthly', interval: 2 },
      dueDate: '2026-01-31'
    });
    const dates: string[] = [];
    for (let i = 0; i < 5; i++) {
      current = buildNextInstance(current, current.dueDate as string, NOW, 'u1') as Task;
      dates.push(current.dueDate as string);
    }
    expect(dates).toEqual(['2026-03-31', '2026-05-31', '2026-07-31', '2026-09-30', '2026-11-30']);
  });
});

describe('rule helpers', () => {
  it('intervalOf: the stored whole number 1..99, else 1', () => {
    expect(intervalOf({})).toBe(1);
    expect(intervalOf({ interval: 3 })).toBe(3);
    expect(intervalOf({ interval: 99 })).toBe(99);
    for (const bad of [0, -2, 1.5, 100, Number.NaN]) expect(intervalOf({ interval: bad })).toBe(1);
  });

  it('weekdaysOf: sorted unique valid days of a weekly rule, else null', () => {
    expect(weekdaysOf({ freq: 'weekly', weekdays: [4, 1, 4] })).toEqual([1, 4]);
    expect(weekdaysOf({ freq: 'weekly', weekdays: [9, -1, 2.5, 6] })).toEqual([6]);
    expect(weekdaysOf({ freq: 'weekly', weekdays: [] })).toBeNull();
    expect(weekdaysOf({ freq: 'weekly' })).toBeNull();
    expect(weekdaysOf({ freq: 'daily', weekdays: [1] })).toBeNull();
  });

  it('normalizeRecurrence: canonical, keeps the anchor, keeps invalid values for validation', () => {
    expect(
      normalizeRecurrence({
        freq: 'weekly',
        interval: 1,
        weekdays: [3, 0, 3],
        anchor: '2026-10-04'
      } as Recurrence)
    ).toEqual({ freq: 'weekly', weekdays: [0, 3], anchor: '2026-10-04' });
    expect(normalizeRecurrence({ freq: 'weekly', weekdays: [] })).toEqual({ freq: 'weekly' });
    expect(normalizeRecurrence({ freq: 'monthly', interval: 2, weekdays: [1] })).toEqual({
      freq: 'monthly',
      interval: 2
    });
    expect(normalizeRecurrence({ freq: 'daily', interval: 0 })).toEqual({
      freq: 'daily',
      interval: 0
    });
    const r = { freq: 'yearly' as const };
    expect(normalizeRecurrence(r)).not.toBe(r);
  });

  it('ruleOf drops the anchor', () => {
    expect(ruleOf({ freq: 'weekly', interval: 2, anchor: '2026-10-04' } as Recurrence)).toEqual({
      freq: 'weekly',
      interval: 2
    });
  });

  it('sameRule compares freq, interval and days (defaults included), never anchors', () => {
    expect(sameRule({ freq: 'weekly' }, { freq: 'weekly', interval: 1 })).toBe(true);
    expect(
      sameRule({ freq: 'weekly', weekdays: [3, 0] }, { freq: 'weekly', weekdays: [0, 3] })
    ).toBe(true);
    expect(sameRule({ freq: 'weekly' }, { freq: 'weekly', weekdays: [0] })).toBe(false);
    expect(sameRule({ freq: 'daily' }, { freq: 'daily', interval: 2 })).toBe(false);
    expect(sameRule({ freq: 'daily' }, { freq: 'weekly' })).toBe(false);
    expect(
      sameRule({ freq: 'monthly', anchor: '2026-01-01' } as Recurrence, { freq: 'monthly' })
    ).toBe(true);
    expect(sameRule(null, null)).toBe(true);
    expect(sameRule(null, { freq: 'daily' })).toBe(false);
  });

  it('recurrenceProblem mirrors the rules', () => {
    const ok: unknown[] = [
      { freq: 'daily' },
      { freq: 'weekly', interval: 99, weekdays: [0, 1, 2, 3, 4, 5, 6] },
      { freq: 'monthly', interval: 1, anchor: '2026-10-31' },
      { freq: 'yearly', anchor: '2028-02-29' }
    ];
    for (const r of ok) expect(recurrenceProblem(r), JSON.stringify(r)).toBeNull();
    const bad: unknown[] = [
      null,
      'weekly',
      [],
      { freq: 'hourly' },
      { freq: 'daily', interval: 0 },
      { freq: 'daily', interval: 100 },
      { freq: 'daily', interval: 1.5 },
      { freq: 'daily', interval: '2' },
      { freq: 'daily', weekdays: [1] },
      { freq: 'weekly', weekdays: [] },
      { freq: 'weekly', weekdays: [3, 0] },
      { freq: 'weekly', weekdays: [0, 0] },
      { freq: 'weekly', weekdays: [7] },
      { freq: 'weekly', weekdays: [-1] },
      { freq: 'weekly', weekdays: [1.5] },
      { freq: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6, 6] },
      { freq: 'weekly', weekdays: '0,3' },
      { freq: 'monthly', anchor: '2026-02-30' }
    ];
    for (const r of bad) expect(recurrenceProblem(r), JSON.stringify(r)).not.toBeNull();
  });
});

describe('ensureAnchor with flexible rules', () => {
  it('stores the canonical rule with the anchor', () => {
    expect(
      ensureAnchor(
        task({
          scheduledFor: '2026-10-07',
          recurrence: { freq: 'weekly', interval: 1, weekdays: [3, 0, 3] }
        })
      )
    ).toEqual({ freq: 'weekly', weekdays: [0, 3], anchor: '2026-10-07' });
    expect(ensureAnchor(task({ recurrence: { freq: 'daily', interval: 3 } }))).toEqual({
      freq: 'daily',
      interval: 3
    });
  });
});

describe('firstPlanDate (a new series with no date of its own)', () => {
  it('daily: today, whatever the interval', () => {
    expect(firstPlanDate({ freq: 'daily' }, '2026-10-04')).toBe('2026-10-04');
    expect(firstPlanDate({ freq: 'daily', interval: 3 }, '2026-10-04')).toBe('2026-10-04');
  });

  it('listed weekdays: the first one strictly after today', () => {
    const sunWed = { freq: 'weekly' as const, weekdays: [0, 3] };
    expect(firstPlanDate(sunWed, '2026-10-04')).toBe('2026-10-07'); // Sunday → Wednesday
    expect(firstPlanDate(sunWed, '2026-10-05')).toBe('2026-10-07');
    expect(firstPlanDate(sunWed, '2026-10-07')).toBe('2026-10-11'); // Wednesday → Sunday
    expect(firstPlanDate(sunWed, '2026-10-10')).toBe('2026-10-11'); // Saturday → Sunday
    expect(firstPlanDate({ freq: 'weekly', weekdays: [4] }, '2026-10-08')).toBe('2026-10-15');
    expect(firstPlanDate({ ...sunWed, interval: 2 }, '2026-10-04')).toBe('2026-10-07');
  });

  it('a plain weekly, monthly or yearly rule: no date', () => {
    expect(firstPlanDate({ freq: 'weekly' }, '2026-10-04')).toBeNull();
    expect(firstPlanDate({ freq: 'weekly', interval: 2 }, '2026-10-04')).toBeNull();
    expect(firstPlanDate({ freq: 'monthly' }, '2026-10-04')).toBeNull();
    expect(firstPlanDate({ freq: 'yearly' }, '2026-10-04')).toBeNull();
  });
});
