// Parser-only calendar helpers that $lib/domain/dates does not offer (decision (e): the parser uses
// the domain module for everything else). All of them take and return ISODate strings.

import {
  addDays,
  daysInMonth,
  DEFAULT_TZ,
  endOfMonth,
  localTimeParts,
  todayISO,
  toISO,
  weekday
} from '$lib/domain/dates';
import type { ISODate } from '$lib/domain/types';

/** The calendar date and the wall-clock minute (0–1439) of an instant in a timezone. */
export interface Clock {
  today: ISODate;
  minutes: number;
}

function clockIn(instant: Date, tz: string): Clock {
  const { hour, minute } = localTimeParts(instant, tz);
  return { today: todayISO(instant, tz), minutes: hour * 60 + minute };
}

/**
 * The parser's "now" in `tz`. Never throws: an invalid Date falls back to the current time and an
 * unknown timezone to Asia/Jerusalem (the parser must keep working whatever the caller passes).
 */
export function clockAt(now: Date, tz: string): Clock {
  const instant = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
  try {
    return clockIn(instant, tz);
  } catch {
    return clockIn(instant, DEFAULT_TZ);
  }
}

/** True for a real calendar date (years 1000–9999). */
export function isValidYMD(y: number, m: number, d: number): boolean {
  if (![y, m, d].every(Number.isInteger)) return false;
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

/** First date on or after `iso` that falls on weekday `wd` (0 = Sunday). */
export function nextWeekdayOnOrAfter(iso: ISODate, wd: number): ISODate {
  return addDays(iso, (wd - weekday(iso) + 7) % 7);
}

export function startOfNextMonth(iso: ISODate): ISODate {
  return addDays(endOfMonth(iso), 1);
}

/**
 * The date a year-less "dd/mm" means on `today`: the first occurrence on or after
 * `today - graceDays` (decision (c): a date a few days back is overdue, not a year away). Later
 * years are tried for 29/2. null for a date that never exists (31/02).
 */
export function yearlessDate(
  month: number,
  day: number,
  today: ISODate,
  graceDays = 14
): ISODate | null {
  const year = Number(today.slice(0, 4));
  const earliest = addDays(today, -graceDays);
  for (let y = year - 1; y <= year + 8; y++) {
    if (!isValidYMD(y, month, day)) continue;
    const candidate = toISO(y, month, day);
    if (candidate >= earliest) return candidate;
  }
  return null;
}

/**
 * "ה-10": the next date on or after `today` whose day of the month is `day` (a short month is
 * skipped: "ה-31" in November is 31 December). With `nextMonth`, "ה-10 לחודש הבא": that day of next
 * month, or null when next month is too short.
 */
export function dayOfMonthDate(day: number, today: ISODate, nextMonth = false): ISODate | null {
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7));
  for (let i = 0; i < 13; i++) {
    if (!nextMonth || i === 1) {
      if (isValidYMD(y, m, day)) {
        const candidate = toISO(y, m, day);
        if (candidate >= today) return candidate;
      }
      if (nextMonth) return null;
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  /* v8 ignore next -- every day 1-31 occurs within 13 months */
  return null;
}
