import { describe, expect, it } from 'vitest';
import {
  addDaysISO,
  diffDays,
  inWindow,
  isBeforeLocal,
  isoDateOf,
  isoWeekOf,
  isQuietHours,
  isValidISO,
  localParts
} from './time.ts';

const at = (iso: string) => localParts(new Date(iso));
const hm = (p: { hour: number; minute: number }) =>
  `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;

describe('localParts (Asia/Jerusalem)', () => {
  it('reads the wall clock, weekday and ISO week', () => {
    expect(at('2026-10-04T05:05:00Z')).toEqual({
      iso: '2026-10-04',
      hour: 8,
      minute: 5,
      weekday: 0,
      isoWeek: '2026-W40'
    });
  });

  it('midnight is hour 0 and belongs to the new day', () => {
    const p = at('2026-10-04T21:00:00Z'); // 00:00 IDT on Monday
    expect(p.iso).toBe('2026-10-05');
    expect(p.hour).toBe(0);
    expect(p.weekday).toBe(1);
  });

  it('spring forward (Fri 27 Mar 2026, 02:00 → 03:00)', () => {
    expect(hm(at('2026-03-26T23:59:00Z'))).toBe('01:59');
    expect(hm(at('2026-03-27T00:00:00Z'))).toBe('03:00');
    expect(at('2026-03-27T00:00:00Z').iso).toBe('2026-03-27');
    // 07:30 is 05:30Z the day before (UTC+2) and 04:30Z after (UTC+3)
    expect(hm(at('2026-03-26T05:30:00Z'))).toBe('07:30');
    expect(hm(at('2026-03-27T04:30:00Z'))).toBe('07:30');
    // the local date flips at 22:00Z before, 21:00Z after
    expect(at('2026-03-26T21:59:00Z').iso).toBe('2026-03-26');
    expect(at('2026-03-26T22:00:00Z').iso).toBe('2026-03-27');
    expect(at('2026-03-27T20:59:00Z').iso).toBe('2026-03-27');
    expect(at('2026-03-27T21:00:00Z').iso).toBe('2026-03-28');
  });

  it('fall back (Sun 25 Oct 2026, 02:00 → 01:00, the 01:xx hour happens twice)', () => {
    expect(hm(at('2026-10-24T22:59:00Z'))).toBe('01:59');
    expect(hm(at('2026-10-24T23:00:00Z'))).toBe('01:00');
    expect(hm(at('2026-10-25T00:00:00Z'))).toBe('02:00');
    expect(at('2026-10-24T23:30:00Z').iso).toBe('2026-10-25');
    expect(at('2026-10-24T23:30:00Z').weekday).toBe(0);
    // 08:00 local is 05:00Z on Saturday (UTC+3) and 06:00Z on Sunday (UTC+2)
    expect(hm(at('2026-10-24T05:00:00Z'))).toBe('08:00');
    expect(hm(at('2026-10-25T06:00:00Z'))).toBe('08:00');
    expect(at('2026-10-24T20:59:00Z').iso).toBe('2026-10-24');
    expect(at('2026-10-24T21:00:00Z').iso).toBe('2026-10-25');
    expect(at('2026-10-25T21:59:00Z').iso).toBe('2026-10-25');
    expect(at('2026-10-25T22:00:00Z').iso).toBe('2026-10-26');
  });
});

describe('quiet hours 22:00–07:30 across DST', () => {
  it('in winter time (UTC+2)', () => {
    expect(isQuietHours(at('2026-03-26T05:29:00Z'))).toBe(true); // 07:29
    expect(isQuietHours(at('2026-03-26T05:30:00Z'))).toBe(false); // 07:30
    expect(isQuietHours(at('2026-03-26T19:59:00Z'))).toBe(false); // 21:59
    expect(isQuietHours(at('2026-03-26T20:00:00Z'))).toBe(true); // 22:00
  });

  it('in summer time right after the spring jump (UTC+3)', () => {
    expect(isQuietHours(at('2026-03-27T00:00:00Z'))).toBe(true); // 03:00
    expect(isQuietHours(at('2026-03-27T04:29:00Z'))).toBe(true); // 07:29
    expect(isQuietHours(at('2026-03-27T04:30:00Z'))).toBe(false); // 07:30
    expect(isQuietHours(at('2026-03-27T05:29:00Z'))).toBe(false); // 08:29 (was 07:29 a day earlier)
  });

  it('on the fall-back day', () => {
    expect(isQuietHours(at('2026-10-24T23:30:00Z'))).toBe(true); // second 01:30
    expect(isQuietHours(at('2026-10-25T05:29:00Z'))).toBe(true); // 07:29 IST
    expect(isQuietHours(at('2026-10-25T05:30:00Z'))).toBe(false); // 07:30 IST
    expect(isQuietHours(at('2026-10-24T04:30:00Z'))).toBe(false); // 07:30 IDT the day before
    expect(isQuietHours(at('2026-10-25T19:59:00Z'))).toBe(false); // 21:59
    expect(isQuietHours(at('2026-10-25T20:00:00Z'))).toBe(true); // 22:00
  });
});

describe('inWindow', () => {
  it('includes the start minute and excludes the end minute', () => {
    expect(inWindow({ hour: 7, minute: 59 }, '08:00', '12:00')).toBe(false);
    expect(inWindow({ hour: 8, minute: 0 }, '08:00', '12:00')).toBe(true);
    expect(inWindow({ hour: 11, minute: 59 }, '08:00', '12:00')).toBe(true);
    expect(inWindow({ hour: 12, minute: 0 }, '08:00', '12:00')).toBe(false);
  });

  it('wraps past midnight when start > end', () => {
    expect(inWindow({ hour: 23, minute: 0 }, '22:00', '07:30')).toBe(true);
    expect(inWindow({ hour: 0, minute: 0 }, '22:00', '07:30')).toBe(true);
    expect(inWindow({ hour: 7, minute: 30 }, '22:00', '07:30')).toBe(false);
    expect(inWindow({ hour: 12, minute: 0 }, '22:00', '07:30')).toBe(false);
  });

  it('rejects malformed times', () => {
    expect(() => inWindow({ hour: 1, minute: 0 }, '8am', '12:00')).toThrow(RangeError);
  });
});

describe('isBeforeLocal', () => {
  it('compares the Jerusalem wall clock on that day; any earlier day counts', () => {
    expect(isBeforeLocal(Date.parse('2026-10-05T08:59:00Z'), '2026-10-05', '12:00')).toBe(true); // 11:59
    expect(isBeforeLocal(Date.parse('2026-10-05T09:00:00Z'), '2026-10-05', '12:00')).toBe(false); // 12:00
    expect(isBeforeLocal(Date.parse('2026-10-04T20:00:00Z'), '2026-10-05', '00:00')).toBe(true); // 23:00 the day before
    expect(isBeforeLocal(Date.parse('2026-10-05T21:00:00Z'), '2026-10-05', '23:59')).toBe(false); // the next day
  });

  it('is DST-proof: noon is 10:00Z on the fall-back day, 09:00Z the day before', () => {
    expect(isBeforeLocal(Date.parse('2026-10-24T08:59:00Z'), '2026-10-24', '12:00')).toBe(true);
    expect(isBeforeLocal(Date.parse('2026-10-24T09:00:00Z'), '2026-10-24', '12:00')).toBe(false);
    expect(isBeforeLocal(Date.parse('2026-10-25T09:59:00Z'), '2026-10-25', '12:00')).toBe(true);
    expect(isBeforeLocal(Date.parse('2026-10-25T10:00:00Z'), '2026-10-25', '12:00')).toBe(false);
  });
});

describe('date-only helpers', () => {
  it('addDaysISO crosses months, years and leap days', () => {
    expect(addDaysISO('2026-10-04', 1)).toBe('2026-10-05');
    expect(addDaysISO('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysISO('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysISO('2026-03-27', 1)).toBe('2026-03-28'); // DST day is still one day
  });

  it('diffDays counts calendar days (DST-proof)', () => {
    expect(diffDays('2026-10-25', '2026-10-24')).toBe(1);
    expect(diffDays('2026-10-04', '2026-09-13')).toBe(21);
    expect(diffDays('2026-03-20', '2026-04-03')).toBe(-14);
  });

  it('isoWeekOf follows ISO-8601 (week of the Thursday)', () => {
    expect(isoWeekOf('2026-01-01')).toBe('2026-W01'); // Thursday
    expect(isoWeekOf('2025-12-29')).toBe('2026-W01'); // Monday of that week
    expect(isoWeekOf('2026-10-04')).toBe('2026-W40'); // Sunday closes its week
    expect(isoWeekOf('2026-10-05')).toBe('2026-W41');
    expect(isoWeekOf('2027-01-03')).toBe('2026-W53'); // 2026 has 53 ISO weeks
    expect(isoWeekOf('2027-01-04')).toBe('2027-W01');
  });

  it('isoDateOf converts an instant to the local date', () => {
    expect(isoDateOf(Date.parse('2026-10-04T20:59:00Z'))).toBe('2026-10-04');
    expect(isoDateOf(Date.parse('2026-10-04T21:00:00Z'))).toBe('2026-10-05');
  });

  it('isValidISO', () => {
    expect(isValidISO('2026-02-28')).toBe(true);
    expect(isValidISO('2026-02-29')).toBe(false);
    expect(isValidISO('2026-2-28')).toBe(false);
    expect(isValidISO(null)).toBe(false);
  });
});
