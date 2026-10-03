import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  addYears,
  compareISO,
  daysInMonth,
  diffDays,
  endOfMonth,
  endOfWeek,
  isoDateAt,
  isValidISO,
  localTimeParts,
  minISO,
  msUntilNextLocalMidnight,
  nextWeekday,
  parseISO,
  startOfWeek,
  todayISO,
  toISO,
  weekday
} from './dates';

// Israel DST 2026 (verified against ICU):
//   spring forward: Fri 2026-03-27 02:00 +02:00 -> 03:00 +03:00   (instant 2026-03-27T00:00:00Z)
//   fall back:      Sun 2026-10-25 02:00 +03:00 -> 01:00 +02:00   (instant 2026-10-24T23:00:00Z)

describe('toISO / parseISO / isValidISO', () => {
  it('formats y/m/d with zero padding', () => {
    expect(toISO(2026, 3, 7)).toBe('2026-03-07');
    expect(toISO(2026, 12, 31)).toBe('2026-12-31');
  });

  it('parses an ISODate into numeric parts (month is 1-12)', () => {
    expect(parseISO('2026-10-04')).toEqual({ y: 2026, m: 10, d: 4 });
  });

  it('parseISO throws a RangeError on garbage', () => {
    expect(() => parseISO('2026-02-31')).toThrow(RangeError);
    expect(() => parseISO('nope')).toThrow(RangeError);
  });

  it('accepts real calendar dates', () => {
    expect(isValidISO('2026-10-04')).toBe(true);
    expect(isValidISO('2028-02-29')).toBe(true); // leap year
    expect(isValidISO('2026-12-31')).toBe(true);
  });

  it('rejects impossible or malformed dates', () => {
    expect(isValidISO('2026-02-29')).toBe(false); // not a leap year
    expect(isValidISO('2026-02-31')).toBe(false);
    expect(isValidISO('2026-13-01')).toBe(false);
    expect(isValidISO('2026-00-10')).toBe(false);
    expect(isValidISO('2026-10-00')).toBe(false);
    expect(isValidISO('2026-4-5')).toBe(false);
    expect(isValidISO('2026-10-04T09:00')).toBe(false);
    expect(isValidISO('')).toBe(false);
    expect(isValidISO(null)).toBe(false);
    expect(isValidISO(20261004)).toBe(false);
  });

  it('treats 1900 as a non-leap year and 2000 as a leap year', () => {
    expect(isValidISO('1900-02-29')).toBe(false);
    expect(isValidISO('2000-02-29')).toBe(true);
  });
});

describe('daysInMonth', () => {
  it('knows month lengths including leap Februaries', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
  });
});

describe('todayISO', () => {
  it('returns the calendar date in Asia/Jerusalem, not UTC', () => {
    // 22:30 UTC on Oct 3 is already 01:30 on Oct 4 in Jerusalem (+03:00)
    expect(todayISO(new Date('2026-10-03T22:30:00Z'))).toBe('2026-10-04');
    expect(todayISO(new Date('2026-10-04T09:00:00+03:00'))).toBe('2026-10-04');
  });

  it('accepts epoch millis as well as a Date', () => {
    expect(todayISO(Date.parse('2026-10-04T09:00:00+03:00'))).toBe('2026-10-04');
  });

  it('honours an explicit tz argument', () => {
    const now = new Date('2026-10-04T02:00:00Z');
    expect(todayISO(now, 'Asia/Jerusalem')).toBe('2026-10-04');
    expect(todayISO(now, 'America/Los_Angeles')).toBe('2026-10-03');
  });

  it('flips the day exactly at local midnight in winter time (+02:00)', () => {
    expect(todayISO(new Date('2026-01-14T21:59:59Z'))).toBe('2026-01-14');
    expect(todayISO(new Date('2026-01-14T22:00:00Z'))).toBe('2026-01-15');
  });

  it('flips the day exactly at local midnight in summer time (+03:00)', () => {
    expect(todayISO(new Date('2026-07-14T20:59:59Z'))).toBe('2026-07-14');
    expect(todayISO(new Date('2026-07-14T21:00:00Z'))).toBe('2026-07-15');
  });

  describe('across the March 2026 spring-forward (Fri 27 Mar)', () => {
    it('stays on 26 Mar until local midnight, then 27 Mar', () => {
      expect(todayISO(new Date('2026-03-26T21:59:59Z'))).toBe('2026-03-26');
      expect(todayISO(new Date('2026-03-26T22:00:00Z'))).toBe('2026-03-27');
    });
    it('keeps 27 Mar through the skipped 02:00-03:00 hour', () => {
      expect(todayISO(new Date('2026-03-26T23:59:59Z'))).toBe('2026-03-27'); // 01:59:59 +02:00
      expect(todayISO(new Date('2026-03-27T00:00:00Z'))).toBe('2026-03-27'); // 03:00:00 +03:00
    });
    it('flips to 28 Mar at the new (+03:00) midnight', () => {
      expect(todayISO(new Date('2026-03-27T20:59:59Z'))).toBe('2026-03-27');
      expect(todayISO(new Date('2026-03-27T21:00:00Z'))).toBe('2026-03-28');
    });
  });

  describe('across the October 2026 fall-back (Sun 25 Oct)', () => {
    it('flips to 25 Oct at +03:00 midnight', () => {
      expect(todayISO(new Date('2026-10-24T20:59:59Z'))).toBe('2026-10-24');
      expect(todayISO(new Date('2026-10-24T21:00:00Z'))).toBe('2026-10-25');
    });
    it('keeps 25 Oct through the repeated 01:00-02:00 hour', () => {
      expect(todayISO(new Date('2026-10-24T22:59:59Z'))).toBe('2026-10-25'); // 01:59:59 +03:00
      expect(todayISO(new Date('2026-10-24T23:00:00Z'))).toBe('2026-10-25'); // 01:00:00 +02:00
    });
    it('flips to 26 Oct at the new (+02:00) midnight, a 25-hour day later', () => {
      expect(todayISO(new Date('2026-10-25T21:59:59Z'))).toBe('2026-10-25');
      expect(todayISO(new Date('2026-10-25T22:00:00Z'))).toBe('2026-10-26');
    });
  });
});

describe('localTimeParts', () => {
  it('returns hour, minute and weekday (0 = Sunday) in Jerusalem', () => {
    // Sunday 4 Oct 2026, 09:05 +03:00
    expect(localTimeParts(new Date('2026-10-04T09:05:00+03:00'))).toEqual({
      hour: 9,
      minute: 5,
      weekday: 0
    });
  });

  it('uses local midnight as hour 0 (never 24)', () => {
    const parts = localTimeParts(new Date('2026-10-03T21:00:00Z')); // Sun 00:00 +03:00
    expect(parts.hour).toBe(0);
    expect(parts.weekday).toBe(0);
  });

  it('rolls the weekday with the local date, not UTC', () => {
    // Fri 2026-10-09 23:30 +03:00 is still Friday (5) though UTC is also Friday; 00:30 Sat is Saturday
    expect(localTimeParts(new Date('2026-10-09T23:30:00+03:00')).weekday).toBe(5);
    expect(localTimeParts(new Date('2026-10-09T21:30:00Z')).weekday).toBe(6); // Sat 00:30 +03:00
  });

  it('follows the DST jump (01:59 +02:00 becomes 03:00 +03:00)', () => {
    expect(localTimeParts(new Date('2026-03-26T23:59:00Z'))).toMatchObject({ hour: 1, minute: 59 });
    expect(localTimeParts(new Date('2026-03-27T00:00:00Z'))).toMatchObject({ hour: 3, minute: 0 });
  });

  it('repeats 01:xx at the fall-back', () => {
    expect(localTimeParts(new Date('2026-10-24T22:30:00Z'))).toMatchObject({ hour: 1, minute: 30 });
    expect(localTimeParts(new Date('2026-10-24T23:30:00Z'))).toMatchObject({ hour: 1, minute: 30 });
  });

  it('honours tz and accepts epoch millis', () => {
    const ms = Date.parse('2026-10-04T12:00:00Z');
    expect(localTimeParts(ms, 'UTC')).toEqual({ hour: 12, minute: 0, weekday: 0 });
  });
});

describe('addDays', () => {
  it('adds and subtracts within a month', () => {
    expect(addDays('2026-10-04', 1)).toBe('2026-10-05');
    expect(addDays('2026-10-04', -4)).toBe('2026-09-30');
    expect(addDays('2026-10-04', 0)).toBe('2026-10-04');
  });

  it('crosses month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-01-31', 29)).toBe('2026-03-01');
  });

  it('handles leap days', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-28', 2)).toBe('2028-03-01');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('never loses or gains a day across the March spring-forward', () => {
    expect(addDays('2026-03-26', 1)).toBe('2026-03-27');
    expect(addDays('2026-03-27', 1)).toBe('2026-03-28');
    expect(addDays('2026-03-26', 3)).toBe('2026-03-29');
  });

  it('never loses or gains a day across the October fall-back', () => {
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
  });

  it('steps through all of 2026 one calendar day at a time (365 distinct days)', () => {
    const seen = new Set<string>();
    let cur = '2026-01-01';
    for (let i = 0; i < 365; i++) {
      expect(isValidISO(cur)).toBe(true);
      expect(weekday(cur)).toBe((4 + i) % 7); // 2026-01-01 is a Thursday
      seen.add(cur);
      cur = addDays(cur, 1);
    }
    expect(seen.size).toBe(365);
    expect(cur).toBe('2027-01-01');
  });
});

describe('addMonths (clamps to the end of the target month)', () => {
  it('keeps the day when it exists', () => {
    expect(addMonths('2026-10-04', 1)).toBe('2026-11-04');
    expect(addMonths('2026-10-15', 3)).toBe('2027-01-15');
  });

  it('clamps Jan 31 + 1 month to Feb 28 / Feb 29', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('clamps 31st to the 30th for 30-day months', () => {
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30');
    expect(addMonths('2026-08-31', 1)).toBe('2026-09-30');
  });

  it('does not drift when adding many months in one step', () => {
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonths('2026-01-31', 13)).toBe('2027-02-28');
  });

  it('goes backwards, across year boundaries too', () => {
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2026-01-15', -13)).toBe('2024-12-15');
  });

  it('rolls December into January of the next year', () => {
    expect(addMonths('2026-12-31', 1)).toBe('2027-01-31');
  });
});

describe('addYears', () => {
  it('adds whole years', () => {
    expect(addYears('2026-10-04', 1)).toBe('2027-10-04');
    expect(addYears('2026-10-04', -2)).toBe('2024-10-04');
  });

  it('moves Feb 29 to Feb 28 in a non-leap year', () => {
    expect(addYears('2028-02-29', 1)).toBe('2029-02-28');
    expect(addYears('2028-02-29', -1)).toBe('2027-02-28');
  });

  it('keeps Feb 29 when the target year is also a leap year', () => {
    expect(addYears('2028-02-29', 4)).toBe('2032-02-29');
  });
});

describe('diffDays (a - b, calendar days)', () => {
  it('is positive when a is after b, negative when before, zero when equal', () => {
    expect(diffDays('2026-10-05', '2026-10-04')).toBe(1);
    expect(diffDays('2026-10-04', '2026-10-05')).toBe(-1);
    expect(diffDays('2026-10-04', '2026-10-04')).toBe(0);
  });

  it('is an exact integer across both DST transitions', () => {
    expect(diffDays('2026-03-29', '2026-03-26')).toBe(3);
    expect(diffDays('2026-10-26', '2026-10-24')).toBe(2);
    expect(diffDays('2026-11-01', '2026-03-01')).toBe(245);
  });

  it('spans month, year and leap-day boundaries', () => {
    expect(diffDays('2027-01-01', '2026-12-31')).toBe(1);
    expect(diffDays('2028-03-01', '2028-02-28')).toBe(2);
    expect(diffDays('2026-03-01', '2026-02-28')).toBe(1);
    expect(diffDays('2027-01-01', '2026-01-01')).toBe(365);
  });
});

describe('weekday (0 = Sunday)', () => {
  it('matches the real calendar', () => {
    expect(weekday('2026-10-04')).toBe(0); // Sunday
    expect(weekday('2026-10-05')).toBe(1);
    expect(weekday('2026-10-08')).toBe(4); // Thursday
    expect(weekday('2026-10-09')).toBe(5); // Friday
    expect(weekday('2026-10-10')).toBe(6); // Saturday
  });

  it('is unaffected by DST days', () => {
    expect(weekday('2026-03-27')).toBe(5); // Friday
    expect(weekday('2026-10-25')).toBe(0); // Sunday
  });
});

describe('week boundaries (Sunday to Saturday)', () => {
  it('startOfWeek is the Sunday on or before the date', () => {
    expect(startOfWeek('2026-10-04')).toBe('2026-10-04'); // Sunday itself
    expect(startOfWeek('2026-10-07')).toBe('2026-10-04'); // Wednesday
    expect(startOfWeek('2026-10-10')).toBe('2026-10-04'); // Saturday belongs to the week that began Sunday
  });

  it('endOfWeek is the Saturday on or after the date', () => {
    expect(endOfWeek('2026-10-04')).toBe('2026-10-10'); // Sunday
    expect(endOfWeek('2026-10-07')).toBe('2026-10-10'); // Wednesday
    expect(endOfWeek('2026-10-10')).toBe('2026-10-10'); // Saturday itself
  });

  it('Saturday to Sunday starts a new week', () => {
    expect(endOfWeek('2026-10-10')).toBe('2026-10-10');
    expect(endOfWeek('2026-10-11')).toBe('2026-10-17');
    expect(startOfWeek('2026-10-11')).toBe('2026-10-11');
  });

  it('crosses month and year ends', () => {
    expect(endOfWeek('2026-12-29')).toBe('2027-01-02');
    expect(startOfWeek('2027-01-01')).toBe('2026-12-27');
  });

  it('works over the DST weeks', () => {
    expect(endOfWeek('2026-03-27')).toBe('2026-03-28');
    expect(startOfWeek('2026-03-27')).toBe('2026-03-22');
    expect(endOfWeek('2026-10-25')).toBe('2026-10-31');
    expect(startOfWeek('2026-10-24')).toBe('2026-10-18');
  });
});

describe('endOfMonth', () => {
  it('returns the last day of the month', () => {
    expect(endOfMonth('2026-10-04')).toBe('2026-10-31');
    expect(endOfMonth('2026-04-30')).toBe('2026-04-30');
    expect(endOfMonth('2026-12-01')).toBe('2026-12-31');
  });

  it('knows February in leap and common years', () => {
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
  });
});

describe('nextWeekday (strictly after the given date)', () => {
  it('finds the next occurrence within the week', () => {
    expect(nextWeekday('2026-10-04', 4)).toBe('2026-10-08'); // Sunday -> Thursday
    expect(nextWeekday('2026-10-04', 6)).toBe('2026-10-10'); // Sunday -> Saturday
  });

  it('is strictly after: same weekday jumps a full week', () => {
    expect(nextWeekday('2026-10-04', 0)).toBe('2026-10-11');
    expect(nextWeekday('2026-10-08', 4)).toBe('2026-10-15');
  });

  it('wraps over the Saturday to Sunday boundary', () => {
    expect(nextWeekday('2026-10-10', 0)).toBe('2026-10-11');
    expect(nextWeekday('2026-10-10', 6)).toBe('2026-10-17');
  });

  it('works across the DST weekend', () => {
    expect(nextWeekday('2026-03-26', 0)).toBe('2026-03-29');
    expect(nextWeekday('2026-10-24', 0)).toBe('2026-10-25');
  });
});

describe('compareISO / minISO', () => {
  it('orders dates chronologically', () => {
    expect(compareISO('2026-10-04', '2026-10-05')).toBeLessThan(0);
    expect(compareISO('2026-10-05', '2026-10-04')).toBeGreaterThan(0);
    expect(compareISO('2026-10-04', '2026-10-04')).toBe(0);
    expect(compareISO('2025-12-31', '2026-01-01')).toBeLessThan(0);
  });

  it('works as a sort comparator', () => {
    expect(['2026-10-05', '2025-01-01', '2026-02-01'].sort(compareISO)).toEqual([
      '2025-01-01',
      '2026-02-01',
      '2026-10-05'
    ]);
  });

  it('minISO returns the earliest, ignoring null/undefined', () => {
    expect(minISO('2026-10-05', '2026-10-04')).toBe('2026-10-04');
    expect(minISO(null, '2026-10-04')).toBe('2026-10-04');
    expect(minISO('2026-10-04', undefined)).toBe('2026-10-04');
    expect(minISO('2026-10-09', null, '2026-10-02', '2026-10-05')).toBe('2026-10-02');
  });

  it('minISO returns null when there is nothing to compare', () => {
    expect(minISO(null, null)).toBeNull();
    expect(minISO()).toBeNull();
  });
});

describe('isoDateAt (alias of todayISO for any instant)', () => {
  it('is the calendar date of an instant in the given timezone', () => {
    const t = Date.parse('2026-10-03T22:30:00Z'); // 01:30 on Oct 4 in Jerusalem, 15:30 Oct 3 in LA
    expect(isoDateAt(t)).toBe('2026-10-04');
    expect(isoDateAt(new Date(t), 'America/Los_Angeles')).toBe('2026-10-03');
    expect(isoDateAt).toBe(todayISO);
  });
});

describe('msUntilNextLocalMidnight (state rollover timer)', () => {
  const H = 3_600_000;

  it('counts down to the next 00:00 in Asia/Jerusalem', () => {
    expect(msUntilNextLocalMidnight(Date.parse('2026-10-04T23:59:00+03:00'))).toBe(60_000);
    expect(msUntilNextLocalMidnight(Date.parse('2026-10-04T23:59:59.999+03:00'))).toBe(1);
    expect(msUntilNextLocalMidnight(Date.parse('2026-10-04T09:00:00+03:00'))).toBe(15 * H);
  });

  it('at exactly midnight it waits for the NEXT midnight (a full day)', () => {
    expect(msUntilNextLocalMidnight(Date.parse('2026-10-04T00:00:00+03:00'))).toBe(24 * H);
  });

  it('accepts a Date', () => {
    expect(msUntilNextLocalMidnight(new Date('2026-10-04T22:00:00+03:00'))).toBe(2 * H);
  });

  it('is 23 hours on the spring-forward day (Fri 27 Mar 2026, 02:00 -> 03:00)', () => {
    expect(msUntilNextLocalMidnight(Date.parse('2026-03-27T00:00:00+02:00'))).toBe(23 * H);
    // 01:00 +02:00 to midnight +03:00 is 22 real hours
    expect(msUntilNextLocalMidnight(Date.parse('2026-03-27T01:00:00+02:00'))).toBe(22 * H);
  });

  it('is 25 hours on the fall-back day (Sun 25 Oct 2026, 02:00 -> 01:00)', () => {
    expect(msUntilNextLocalMidnight(Date.parse('2026-10-25T00:00:00+03:00'))).toBe(25 * H);
    expect(msUntilNextLocalMidnight(Date.parse('2026-10-25T23:00:00+02:00'))).toBe(1 * H);
  });

  it('copes with a zone whose midnight does not exist (Beirut, 29 Mar 2026 starts at 01:00)', () => {
    // 23:30 +02:00 on the 28th; the clock jumps from 23:59:59 straight to 01:00 +03:00
    expect(msUntilNextLocalMidnight(Date.parse('2026-03-28T23:30:00+02:00'), 'Asia/Beirut')).toBe(
      30 * 60_000
    );
  });

  it('honours an explicit timezone', () => {
    const t = Date.parse('2026-10-04T12:00:00Z'); // 05:00 in Los Angeles (-07:00)
    expect(msUntilNextLocalMidnight(t, 'America/Los_Angeles')).toBe(19 * H);
    expect(msUntilNextLocalMidnight(t, 'Asia/Jerusalem')).toBe(9 * H); // 15:00 there
  });
});
