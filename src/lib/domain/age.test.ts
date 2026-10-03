import { describe, expect, it } from 'vitest';
import { ageDays, ageLabel, isStuck, STUCK_AGE_DAYS, STUCK_SNOOZE_COUNT } from './age';
import { addDays } from './dates';
import type { Task } from './types';

// Fixture clock: Sunday 2026-10-04 09:00 Asia/Jerusalem (+03:00).
const TODAY = '2026-10-04';
const NOW = Date.parse(`${TODAY}T09:00:00+03:00`);

/** createdAt for a task made `n` calendar days before NOW, at the same local time. */
const created = (n: number) => Date.parse(`${addDays(TODAY, -n)}T09:00:00+03:00`);

describe('ageDays (whole calendar days in Asia/Jerusalem)', () => {
  it('is 0 on the day of creation, whatever the hour', () => {
    expect(ageDays(created(0), NOW)).toBe(0);
    expect(ageDays(Date.parse('2026-10-04T00:01:00+03:00'), NOW)).toBe(0);
  });

  it('counts calendar days, not 24-hour blocks', () => {
    expect(ageDays(created(1), NOW)).toBe(1);
    expect(ageDays(created(30), NOW)).toBe(30);
    expect(ageDays(created(400), NOW)).toBe(400);
    // 23:50 two days ago to 00:10 now is only 24h20m of elapsed time but two calendar days
    expect(
      ageDays(Date.parse('2026-10-02T23:50:00+03:00'), Date.parse('2026-10-04T00:10:00+03:00'))
    ).toBe(2);
  });

  it('is exact across the March spring-forward (a 23-hour day)', () => {
    // elapsed 47h40m (floor = 1 day) but two calendar days
    expect(
      ageDays(Date.parse('2026-03-26T23:30:00+02:00'), Date.parse('2026-03-28T00:10:00+03:00'))
    ).toBe(2);
    expect(
      ageDays(Date.parse('2026-03-20T09:00:00+02:00'), Date.parse('2026-03-30T09:00:00+03:00'))
    ).toBe(10);
  });

  it('is exact across the October fall-back (a 25-hour day)', () => {
    // elapsed 25h40m (floor = 1 day) but two calendar days
    expect(
      ageDays(Date.parse('2026-10-24T23:30:00+03:00'), Date.parse('2026-10-26T00:10:00+02:00'))
    ).toBe(2);
    expect(
      ageDays(Date.parse('2026-10-20T09:00:00+03:00'), Date.parse('2026-10-30T09:00:00+02:00'))
    ).toBe(10);
  });

  it('accepts a Date for now', () => {
    expect(ageDays(created(5), new Date(NOW))).toBe(5);
  });

  it('never goes negative (clock skew: createdAt slightly in the future)', () => {
    expect(ageDays(NOW + 3_600_000, NOW)).toBe(0);
    expect(ageDays(created(-3), NOW)).toBe(0);
  });

  it('honours an explicit timezone', () => {
    // 22:30Z on Oct 3 is already Oct 4 in Jerusalem (+03:00) but still Oct 3 in Los Angeles (-07:00)
    const c = Date.parse('2026-10-03T22:30:00Z');
    const now = Date.parse('2026-10-04T10:00:00Z');
    expect(ageDays(c, now, 'Asia/Jerusalem')).toBe(0);
    expect(ageDays(c, now, 'America/Los_Angeles')).toBe(1);
    // and the other way round: Jerusalem is two calendar days apart, Los Angeles only one
    const c2 = Date.parse('2026-10-03T12:00:00Z');
    const now2 = Date.parse('2026-10-04T22:30:00Z');
    expect(ageDays(c2, now2, 'Asia/Jerusalem')).toBe(2);
    expect(ageDays(c2, now2, 'America/Los_Angeles')).toBe(1);
  });
});

describe('ageLabel', () => {
  const label = (days: number) => ageLabel(created(days), NOW);

  it('is "חדשה" for the first two days (0 and 1)', () => {
    expect(label(0)).toBe('חדשה');
    expect(label(1)).toBe('חדשה');
  });

  it('counts days from 2 to 6, with the dual form for 2', () => {
    expect(label(2)).toBe('פתוחה יומיים');
    expect(label(3)).toBe('פתוחה 3 ימים');
    expect(label(6)).toBe('פתוחה 6 ימים');
  });

  it('counts whole weeks from 7 days up to a month', () => {
    expect(label(7)).toBe('פתוחה שבוע');
    expect(label(13)).toBe('פתוחה שבוע');
    expect(label(14)).toBe('פתוחה שבועיים');
    expect(label(20)).toBe('פתוחה שבועיים');
    expect(label(21)).toBe('פתוחה 3 שבועות');
    expect(label(27)).toBe('פתוחה 3 שבועות');
    expect(label(28)).toBe('פתוחה 4 שבועות');
    expect(label(29)).toBe('פתוחה 4 שבועות');
  });

  it('counts 30-day months from 30 days up to a year', () => {
    expect(label(30)).toBe('פתוחה חודש');
    expect(label(59)).toBe('פתוחה חודש');
    expect(label(60)).toBe('פתוחה חודשיים');
    expect(label(89)).toBe('פתוחה חודשיים');
    expect(label(90)).toBe('פתוחה 3 חודשים');
    expect(label(200)).toBe('פתוחה 6 חודשים');
    expect(label(330)).toBe('פתוחה 11 חודשים');
  });

  it('never says "12 months": it stays at 11 until a full year', () => {
    expect(label(360)).toBe('פתוחה 11 חודשים');
    expect(label(364)).toBe('פתוחה 11 חודשים');
  });

  it('switches to years at 365 days', () => {
    expect(label(365)).toBe('פתוחה שנה');
    expect(label(729)).toBe('פתוחה שנה');
    expect(label(730)).toBe('פתוחה שנתיים');
    expect(label(1100)).toBe('פתוחה 3 שנים');
  });

  it('accepts a Date and an explicit tz', () => {
    expect(ageLabel(created(14), new Date(NOW))).toBe('פתוחה שבועיים');
    expect(ageLabel(created(14), NOW, 'Asia/Jerusalem')).toBe('פתוחה שבועיים');
  });
});

describe('isStuck', () => {
  const open = (over: Partial<Pick<Task, 'status' | 'createdAt' | 'snoozeCount'>> = {}) => ({
    status: 'open' as const,
    createdAt: created(0),
    snoozeCount: 0,
    ...over
  });

  it('exposes its thresholds', () => {
    expect(STUCK_AGE_DAYS).toBe(21);
    expect(STUCK_SNOOZE_COUNT).toBe(3);
  });

  it('is false for a fresh, never-snoozed task', () => {
    expect(isStuck(open(), NOW)).toBe(false);
  });

  it('becomes true at exactly 21 days open', () => {
    expect(isStuck(open({ createdAt: created(20) }), NOW)).toBe(false);
    expect(isStuck(open({ createdAt: created(21) }), NOW)).toBe(true);
    expect(isStuck(open({ createdAt: created(90) }), NOW)).toBe(true);
  });

  it('becomes true at exactly 3 snoozes', () => {
    expect(isStuck(open({ snoozeCount: 2 }), NOW)).toBe(false);
    expect(isStuck(open({ snoozeCount: 3 }), NOW)).toBe(true);
    expect(isStuck(open({ snoozeCount: 7 }), NOW)).toBe(true);
  });

  it('either condition is enough', () => {
    expect(isStuck(open({ createdAt: created(21), snoozeCount: 0 }), NOW)).toBe(true);
    expect(isStuck(open({ createdAt: created(1), snoozeCount: 3 }), NOW)).toBe(true);
  });

  it('a finished task is never stuck', () => {
    expect(isStuck(open({ status: 'done', createdAt: created(100), snoozeCount: 9 }), NOW)).toBe(
      false
    );
  });

  it('accepts a Date for now', () => {
    expect(isStuck(open({ createdAt: created(21) }), new Date(NOW))).toBe(true);
  });
});
