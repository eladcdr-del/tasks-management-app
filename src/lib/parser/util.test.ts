import { describe, expect, it } from 'vitest';
import {
  clockAt,
  dayOfMonthDate,
  isValidYMD,
  nextWeekdayOnOrAfter,
  startOfNextMonth,
  yearlessDate
} from './util';

describe('clockAt', () => {
  it('reads the calendar date and wall-clock minutes in Asia/Jerusalem', () => {
    // 09:00 Jerusalem = 06:00Z
    expect(clockAt(new Date('2026-10-04T06:00:00Z'), 'Asia/Jerusalem')).toEqual({
      today: '2026-10-04',
      minutes: 9 * 60
    });
  });

  it('rolls over at local midnight even while UTC is still the old day', () => {
    // 22:30Z on the 4th is 01:30 on the 5th in Jerusalem (IDT, UTC+3)
    expect(clockAt(new Date('2026-10-04T22:30:00Z'), 'Asia/Jerusalem')).toEqual({
      today: '2026-10-05',
      minutes: 90
    });
    // winter time (UTC+2) after the DST switch on 2026-10-25
    expect(clockAt(new Date('2027-01-10T22:30:00Z'), 'Asia/Jerusalem').today).toBe('2027-01-11');
  });

  it('honours an explicit tz', () => {
    expect(clockAt(new Date('2026-10-04T22:30:00Z'), 'UTC').today).toBe('2026-10-04');
    expect(clockAt(new Date('2026-10-04T22:30:00Z'), 'Pacific/Auckland').today).toBe('2026-10-05');
  });

  it('falls back instead of throwing on a bad timezone or an invalid Date', () => {
    expect(clockAt(new Date('2026-10-04T06:00:00Z'), 'Not/AZone').today).toBe('2026-10-04');
    expect(clockAt(new Date(NaN), 'Asia/Jerusalem').today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(clockAt(undefined as unknown as Date, 'Asia/Jerusalem').minutes).toBeGreaterThanOrEqual(
      0
    );
  });
});

describe('isValidYMD', () => {
  it('validates real calendar dates only', () => {
    expect(isValidYMD(2026, 10, 4)).toBe(true);
    expect(isValidYMD(2026, 2, 29)).toBe(false);
    expect(isValidYMD(2028, 2, 29)).toBe(true);
    expect(isValidYMD(2100, 2, 29)).toBe(false);
    expect(isValidYMD(2026, 4, 31)).toBe(false);
    expect(isValidYMD(2026, 0, 10)).toBe(false);
    expect(isValidYMD(2026, 13, 10)).toBe(false);
    expect(isValidYMD(2026, 10, 0)).toBe(false);
    expect(isValidYMD(2026.5, 10, 4)).toBe(false);
    expect(isValidYMD(999, 10, 4)).toBe(false);
  });
});

describe('weekday and month helpers', () => {
  it('nextWeekdayOnOrAfter includes the day itself', () => {
    expect(nextWeekdayOnOrAfter('2026-10-04', 0)).toBe('2026-10-04');
    expect(nextWeekdayOnOrAfter('2026-10-04', 5)).toBe('2026-10-09');
    expect(nextWeekdayOnOrAfter('2026-10-10', 5)).toBe('2026-10-16');
  });

  it('startOfNextMonth crosses the year', () => {
    expect(startOfNextMonth('2026-10-04')).toBe('2026-11-01');
    expect(startOfNextMonth('2026-12-31')).toBe('2027-01-01');
  });
});

describe('yearlessDate (a dd/mm without a year)', () => {
  it('keeps a future date and today in the current year', () => {
    expect(yearlessDate(10, 15, '2026-10-04')).toBe('2026-10-15');
    expect(yearlessDate(10, 4, '2026-10-04')).toBe('2026-10-04');
  });

  it('keeps a date up to 14 days back (overdue), rolls anything older to next year', () => {
    expect(yearlessDate(10, 1, '2026-10-04')).toBe('2026-10-01');
    expect(yearlessDate(9, 20, '2026-10-04')).toBe('2026-09-20');
    expect(yearlessDate(9, 19, '2026-10-04')).toBe('2027-09-19');
    expect(yearlessDate(1, 3, '2026-10-04')).toBe('2027-01-03');
  });

  it('looks back across New Year', () => {
    expect(yearlessDate(12, 28, '2027-01-03')).toBe('2026-12-28');
    expect(yearlessDate(12, 1, '2027-01-03')).toBe('2027-12-01');
  });

  it('finds the next leap year for 29/2 and ignores impossible dates', () => {
    expect(yearlessDate(2, 29, '2026-10-04')).toBe('2028-02-29');
    expect(yearlessDate(2, 29, '2096-03-20')).toBe('2104-02-29'); // 2100 is not a leap year
    expect(yearlessDate(2, 31, '2026-10-04')).toBeNull();
    expect(yearlessDate(13, 1, '2026-10-04')).toBeNull();
  });
});

describe('dayOfMonthDate ("ה-10", "ה-10 לחודש הבא")', () => {
  it('is the next occurrence of the day, today included', () => {
    expect(dayOfMonthDate(10, '2026-10-04')).toBe('2026-10-10');
    expect(dayOfMonthDate(4, '2026-10-04')).toBe('2026-10-04');
    expect(dayOfMonthDate(1, '2026-10-04')).toBe('2026-11-01');
    expect(dayOfMonthDate(31, '2026-11-05')).toBe('2026-12-31');
    expect(dayOfMonthDate(30, '2027-01-31')).toBe('2027-03-30');
  });

  it('can be pinned to next month, and rejects a day that month lacks', () => {
    expect(dayOfMonthDate(10, '2026-10-04', true)).toBe('2026-11-10');
    expect(dayOfMonthDate(10, '2026-12-20', true)).toBe('2027-01-10');
    expect(dayOfMonthDate(31, '2026-10-04', true)).toBeNull();
  });

  it('rejects day numbers that never exist', () => {
    expect(dayOfMonthDate(0, '2026-10-04')).toBeNull();
    expect(dayOfMonthDate(32, '2026-10-04')).toBeNull();
  });
});
