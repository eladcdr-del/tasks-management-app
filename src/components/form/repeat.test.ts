import { describe, expect, it } from 'vitest';
import type { RecurrenceRule } from '$lib/domain/recurrence';
import {
  customStart,
  impliedWeekday,
  presetOf,
  presetRule,
  PRESETS,
  shownDays,
  toggleDay,
  withInterval,
  withUnit
} from './repeat';

// Sunday 2026-10-04, Monday 05, Wednesday 07.
describe('presets', () => {
  it('lists none + the four frequencies, each standing for its plain rule', () => {
    expect(PRESETS).toEqual(['none', 'daily', 'weekly', 'monthly', 'yearly']);
    expect(presetRule('none')).toBeNull();
    expect(presetRule('daily')).toEqual({ freq: 'daily' });
  });

  it('presetOf: every single period is its preset, every N > 1 is custom', () => {
    expect(presetOf(null)).toBe('none');
    expect(presetOf({ freq: 'daily' })).toBe('daily');
    expect(presetOf({ freq: 'weekly', weekdays: [0, 3] })).toBe('weekly');
    expect(presetOf({ freq: 'monthly', interval: 1 })).toBe('monthly');
    expect(presetOf({ freq: 'weekly', interval: 2 })).toBe('custom');
    expect(presetOf({ freq: 'yearly', interval: 3 })).toBe('custom');
  });
});

describe('weekday toggles', () => {
  it('impliedWeekday: the weekday of a valid date, else null', () => {
    expect(impliedWeekday('2026-10-05')).toBe(1);
    expect(impliedWeekday(null)).toBeNull();
    expect(impliedWeekday('2026-02-30')).toBeNull();
  });

  it('shownDays: listed days, else the date’s day, else none; nothing for other units', () => {
    expect(shownDays({ freq: 'weekly', weekdays: [4, 1] }, '2026-10-04')).toEqual([1, 4]);
    expect(shownDays({ freq: 'weekly' }, '2026-10-05')).toEqual([1]);
    expect(shownDays({ freq: 'weekly' }, null)).toEqual([]);
    expect(shownDays({ freq: 'daily' }, '2026-10-05')).toEqual([]);
    expect(shownDays(null, '2026-10-05')).toEqual([]);
  });

  it('adding a day keeps the implied one on', () => {
    expect(toggleDay({ freq: 'weekly' }, 4, '2026-10-05')).toEqual({
      freq: 'weekly',
      weekdays: [1, 4]
    });
  });

  it('without a date, the first tapped day is the only one', () => {
    expect(toggleDay({ freq: 'weekly' }, 3, null)).toEqual({ freq: 'weekly', weekdays: [3] });
    expect(toggleDay(null, 3)).toEqual({ freq: 'weekly', weekdays: [3] });
  });

  it('removing a day; the last one off leaves a plain weekly rule', () => {
    expect(toggleDay({ freq: 'weekly', weekdays: [0, 3] }, 0)).toEqual({
      freq: 'weekly',
      weekdays: [3]
    });
    expect(toggleDay({ freq: 'weekly', weekdays: [3] }, 3)).toEqual({ freq: 'weekly' });
    expect(toggleDay({ freq: 'weekly' }, 1, '2026-10-05')).toEqual({ freq: 'weekly' });
  });

  it('keeps an every-N-weeks interval, and turns another unit into weekly', () => {
    expect(toggleDay({ freq: 'weekly', interval: 2 }, 2, null)).toEqual({
      freq: 'weekly',
      interval: 2,
      weekdays: [2]
    });
    expect(toggleDay({ freq: 'monthly', interval: 3 }, 2, null)).toEqual({
      freq: 'weekly',
      weekdays: [2]
    });
  });
});

describe('the custom row', () => {
  it('withInterval clamps to 1..99 and keeps the days', () => {
    expect(withInterval({ freq: 'weekly', weekdays: [0, 3] }, 2)).toEqual({
      freq: 'weekly',
      interval: 2,
      weekdays: [0, 3]
    });
    expect(withInterval({ freq: 'daily', interval: 3 }, 1)).toEqual({ freq: 'daily' });
    expect(withInterval({ freq: 'daily' }, 0)).toEqual({ freq: 'daily' });
    expect(withInterval({ freq: 'daily' }, 140)).toEqual({ freq: 'daily', interval: 99 });
  });

  it('withUnit keeps the interval; days survive only weekly', () => {
    expect(withUnit({ freq: 'weekly', interval: 2, weekdays: [1] }, 'monthly')).toEqual({
      freq: 'monthly',
      interval: 2
    });
    expect(withUnit({ freq: 'daily', interval: 3 }, 'weekly')).toEqual({
      freq: 'weekly',
      interval: 3
    });
  });

  it('never emits an anchor (a stale one in a patch would stop the adapters re-anchoring)', () => {
    const anchored = { freq: 'weekly', anchor: '2026-10-05' } as RecurrenceRule;
    expect(withInterval(anchored, 2)).toEqual({ freq: 'weekly', interval: 2 });
    expect(withUnit(anchored, 'daily')).toEqual({ freq: 'daily' });
    expect(toggleDay(anchored, 3)).toEqual({ freq: 'weekly', weekdays: [3] });
    expect(customStart(anchored)).toEqual({ freq: 'weekly', interval: 2 });
  });

  it('customStart: every 2 of the current unit, weekly when there is none', () => {
    expect(customStart(null)).toEqual({ freq: 'weekly', interval: 2 });
    expect(customStart({ freq: 'daily' })).toEqual({ freq: 'daily', interval: 2 });
    expect(customStart({ freq: 'weekly', weekdays: [0, 3] })).toEqual({
      freq: 'weekly',
      interval: 2,
      weekdays: [0, 3]
    });
    expect(customStart({ freq: 'monthly', interval: 4 })).toEqual({ freq: 'monthly', interval: 4 });
  });
});
