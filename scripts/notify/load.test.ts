import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { normalizeRecurrence, normalizeTask } from './load.ts';

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
