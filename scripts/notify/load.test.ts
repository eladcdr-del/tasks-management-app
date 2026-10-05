import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { normalizeHousehold, normalizeRecurrence, normalizeTask } from './load.ts';
import { jarIsFull } from './jar.ts';

describe('normalizeRecurrence (the app rule, read defensively)', () => {
  it('reads the pre-feature shapes exactly as before', () => {
    expect(normalizeRecurrence({ freq: 'weekly' })).toEqual({ freq: 'weekly' });
    expect(normalizeRecurrence({ freq: 'monthly', anchor: '2026-10-31' })).toEqual({
      freq: 'monthly',
      anchor: '2026-10-31'
    });
    expect(normalizeRecurrence({})).toBeNull();
  });

  it('keeps daily, interval and weekdays', () => {
    expect(normalizeRecurrence({ freq: 'daily', interval: 2, anchor: '2026-10-04' })).toEqual({
      freq: 'daily',
      interval: 2,
      anchor: '2026-10-04'
    });
    expect(normalizeRecurrence({ freq: 'weekly', weekdays: [3, 0, 3] })).toEqual({
      freq: 'weekly',
      weekdays: [0, 3]
    });
  });

  it('drops what is malformed instead of failing the run', () => {
    expect(normalizeRecurrence({ freq: 'hourly' })).toBeNull();
    expect(normalizeRecurrence({ freq: 'daily', interval: 1 })).toEqual({ freq: 'daily' });
    expect(normalizeRecurrence({ freq: 'daily', interval: 120 })).toEqual({ freq: 'daily' });
    expect(normalizeRecurrence({ freq: 'monthly', weekdays: [1] })).toEqual({ freq: 'monthly' });
    expect(normalizeRecurrence({ freq: 'weekly', weekdays: [8, 'x'] })).toEqual({
      freq: 'weekly'
    });
    expect(normalizeRecurrence({ freq: 'yearly', anchor: '2026-02-30' })).toEqual({
      freq: 'yearly'
    });
  });

  it('normalizeTask carries the rule along', () => {
    const t = normalizeTask('t1', {
      title: 'להשקות',
      status: 'open',
      createdAt: Timestamp.fromMillis(1_000),
      recurrence: { freq: 'weekly', interval: 2, weekdays: [1, 4], anchor: '2026-10-05' }
    });
    expect(t.recurrence).toEqual({
      freq: 'weekly',
      interval: 2,
      weekdays: [1, 4],
      anchor: '2026-10-05'
    });
    expect(normalizeTask('t2', { title: 'x', recurrence: null }).recurrence).toBeNull();
  });
});

describe('a deleted jar', () => {
  it('reads as no jar; the remembered round does not matter here', () => {
    expect(normalizeHousehold('hh', { jar: null, nextJarRound: 3 }).jar).toBeNull();
  });

  it('a map without a treat is no jar (a refused completion on a deleted jar)', () => {
    expect(normalizeHousehold('hh', { jar: { count: 1, counts: { a: 1 } } }).jar).toBeNull();
  });
});

describe('the jar (goal modes)', () => {
  const base = {
    treat: 'ארוחה במסעדה',
    target: 10,
    count: 7,
    round: 3,
    startedAt: Timestamp.fromMillis(1_000)
  };

  it('reads a jar from before goal modes exactly as before', () => {
    expect(normalizeHousehold('hh', { jar: base }).jar).toEqual({
      treat: 'ארוחה במסעדה',
      target: 10,
      count: 7,
      round: 3,
      startedAt: 1_000
    });
  });

  it('keeps mode, share and the whole-number tallies; drops what is malformed', () => {
    const jar = normalizeHousehold('hh', {
      jar: { ...base, mode: 'each', share: 5, counts: { a: 4, b: 3, c: -1, d: 'x', e: 1.5 } }
    }).jar;
    expect(jar).toMatchObject({ mode: 'each', share: 5, counts: { a: 4, b: 3 } });
    expect(
      normalizeHousehold('hh', { jar: { ...base, mode: 'often', share: 0 } }).jar
    ).not.toHaveProperty('mode');
  });

  it('jarIsFull mirrors the app: together by count, each by every current member', () => {
    const together = normalizeHousehold('hh', { jar: { ...base, count: 10 } }).jar!;
    expect(jarIsFull(together, ['a'])).toBe(true);
    const each = normalizeHousehold('hh', {
      jar: { ...base, mode: 'each', share: 2, count: 4, counts: { a: 3, b: 2 } }
    }).jar!;
    expect(jarIsFull(each, ['a', 'b'])).toBe(true);
    expect(jarIsFull(each, ['a', 'b', 'c'])).toBe(false);
    expect(jarIsFull(each, ['a'])).toBe(true);
    expect(jarIsFull(each, [])).toBe(false);
    expect(jarIsFull({ ...each, counts: { a: 9, b: 1 }, count: 10 }, ['a', 'b'])).toBe(false);
  });
});
