// Calendar-date helpers for the quick-add parser (Blueprint §6).
//
// Everything here works on `YYYY-MM-DD` strings and does its arithmetic on Y/M/D through
// Date.UTC / setUTCFullYear, so a DST change (Israel switches on 2026-03-27 and 2026-10-25) can
// never shift a day. The only timezone-aware function is `todayInTz`.

import type { ISODate } from '../domain/types';

export const DEFAULT_TZ = 'Asia/Jerusalem';

/** Sunday-based weekday index, as in `Date#getUTCDay`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface YMD {
  y: number;
  m: number;
  d: number;
}

const DAY_MS = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Today's calendar date in `tz`. Never throws: a bad timezone falls back to Asia/Jerusalem and an
 *  invalid Date to the current time. */
export function todayInTz(now: Date, tz: string = DEFAULT_TZ): ISODate {
  const instant = Number.isFinite(now?.getTime?.()) ? now : new Date();
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = formatterFor(tz);
  } catch {
    fmt = formatterFor(DEFAULT_TZ);
  }
  let y = 0;
  let m = 0;
  let d = 0;
  for (const part of fmt.formatToParts(instant)) {
    if (part.type === 'year') y = Number(part.value);
    else if (part.type === 'month') m = Number(part.value);
    else if (part.type === 'day') d = Number(part.value);
  }
  return toISO(y, m, d);
}

function monthLength(y: number, m: number): number {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

export function isValidYMD(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1) return false;
  return d <= monthLength(y, m);
}

export function toISO(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseISO(iso: ISODate): YMD | null {
  const match = ISO_RE.exec(iso);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  return isValidYMD(y, m, d) ? { y, m, d } : null;
}

function utcMillis(ymd: YMD): number {
  const dt = new Date(0);
  dt.setUTCFullYear(ymd.y, ymd.m - 1, ymd.d);
  return dt.getTime();
}

function fromMillis(ms: number): ISODate {
  const dt = new Date(ms);
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(iso: ISODate, n: number): ISODate {
  const ymd = parseISO(iso);
  if (!ymd) return iso;
  return fromMillis(utcMillis(ymd) + n * DAY_MS);
}

/** Adds calendar months and clamps the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso: ISODate, n: number): ISODate {
  const ymd = parseISO(iso);
  if (!ymd) return iso;
  const index = ymd.y * 12 + (ymd.m - 1) + n;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return toISO(y, m, Math.min(ymd.d, monthLength(y, m)));
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(iso: ISODate): Weekday {
  const ymd = parseISO(iso);
  return (ymd ? new Date(utcMillis(ymd)).getUTCDay() : 0) as Weekday;
}

/** First date on or after `iso` that falls on `wd`. */
export function nextWeekdayOnOrAfter(iso: ISODate, wd: number): ISODate {
  return addDays(iso, (wd - weekday(iso) + 7) % 7);
}

/** First date strictly after `iso` that falls on `wd` (always 1–7 days ahead). */
export function nextWeekdayAfter(iso: ISODate, wd: number): ISODate {
  return nextWeekdayOnOrAfter(addDays(iso, 1), wd);
}

/** Saturday of the Sunday–Saturday week containing `iso` (Saturday itself maps to itself). */
export function endOfWeek(iso: ISODate): ISODate {
  return nextWeekdayOnOrAfter(iso, 6);
}

export function endOfMonth(iso: ISODate): ISODate {
  const ymd = parseISO(iso);
  if (!ymd) return iso;
  return toISO(ymd.y, ymd.m, monthLength(ymd.y, ymd.m));
}

export function startOfNextMonth(iso: ISODate): ISODate {
  return addDays(endOfMonth(iso), 1);
}

/** The first date on or after `today` whose month/day match (a year-less "15/10"). A date that
 *  already passed this year rolls to next year; 29/2 waits for the next leap year. Returns null
 *  for dates that never exist (31/02). */
export function nextOccurrence(month: number, day: number, today: ISODate): ISODate | null {
  const now = parseISO(today);
  if (!now) return null;
  for (let y = now.y; y <= now.y + 8; y++) {
    if (!isValidYMD(y, month, day)) continue;
    const candidate = toISO(y, month, day);
    if (candidate >= today) return candidate;
  }
  return null;
}
