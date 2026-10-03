// Date-only helpers (Blueprint §3 "Domain rules").
//
// An ISODate is a plain calendar date 'YYYY-MM-DD' in Asia/Jerusalem. All arithmetic here works on
// the Y/M/D numbers via Date.UTC, so it is independent of the machine's timezone and DST can never
// shift a day (UTC has no DST; a "day" is always exactly 86 400 000 ms in this space).
// The only place a real instant meets a timezone is `todayISO` / `localTimeParts`, via Intl.
// Weeks run Sunday (0) to Saturday (6). No date libraries.

import type { ISODate } from './types';

export const DEFAULT_TZ = 'Asia/Jerusalem';

const DAY_MS = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface YMD {
  y: number;
  /** 1-12 */
  m: number;
  d: number;
}

// ── Construction / validation ─────────────────────────────────────────────────

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Formats numeric parts as 'YYYY-MM-DD'. A pure formatter: it does not validate (see isValidISO). */
export function toISO(y: number, m: number, d: number): ISODate {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month = last day of this one
}

/** True only for real calendar dates written exactly as 'YYYY-MM-DD' (years 1000-9999). */
export function isValidISO(value: unknown): value is ISODate {
  if (typeof value !== 'string') return false;
  const match = ISO_RE.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return y >= 1000 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

/** Splits an ISODate into numbers. Throws RangeError for anything isValidISO would reject. */
export function parseISO(iso: ISODate): YMD {
  if (!isValidISO(iso)) throw new RangeError(`Invalid ISODate: ${String(iso)}`);
  return { y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), d: Number(iso.slice(8, 10)) };
}

// ── Instants -> calendar (the only timezone-aware part) ───────────────────────

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    // Explicit gregory + latin digits so the parts are always plain numbers. hourCycle h23 so that
    // midnight is "00", never "24".
    f = new Intl.DateTimeFormat('he-IL-u-ca-gregory-nu-latn', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    });
    formatters.set(tz, f);
  }
  return f;
}

function partsOf(now: Date | number, tz: string) {
  const out: Record<string, number> = {};
  for (const p of formatterFor(tz).formatToParts(now)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out as { year: number; month: number; day: number; hour: number; minute: number };
}

/** The calendar date at instant `now` in `tz` (default Asia/Jerusalem). */
export function todayISO(now: Date | number, tz: string = DEFAULT_TZ): ISODate {
  const p = partsOf(now, tz);
  return toISO(p.year, p.month, p.day);
}

/** The calendar date of any instant in `tz`: the same function as `todayISO`, named for non-"now" uses. */
export const isoDateAt: (instant: Date | number, tz?: string) => ISODate = todayISO;

/** Longest real time between two local midnights (a 25-hour fall-back day) plus a safety margin. */
const ROLLOVER_SEARCH_MS = 50 * 3_600_000;

/**
 * Milliseconds from `now` until the local calendar date in `tz` next changes (normally 00:00), for a
 * timer that rolls "today" over. Always > 0: at exactly midnight it is the time to the NEXT midnight.
 * Correct on DST nights (23/25-hour days) and in zones where midnight itself is skipped (the day then
 * starts at 01:00). Found by binary search over the instant, so it never assumes a fixed offset.
 */
export function msUntilNextLocalMidnight(now: Date | number, tz: string = DEFAULT_TZ): number {
  const start = typeof now === 'number' ? now : now.getTime();
  const today = todayISO(start, tz);
  // Invariant: the date at `lo` is still today, the date at `hi` is not.
  let lo = start;
  let hi = start + ROLLOVER_SEARCH_MS;
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (todayISO(mid, tz) === today) lo = mid;
    else hi = mid;
  }
  return hi - start;
}

/** Wall-clock hour (0-23), minute and weekday (0 = Sunday) at instant `now` in `tz`. */
export function localTimeParts(
  now: Date | number,
  tz: string = DEFAULT_TZ
): { hour: number; minute: number; weekday: number } {
  const p = partsOf(now, tz);
  return { hour: p.hour, minute: p.minute, weekday: weekday(toISO(p.year, p.month, p.day)) };
}

// ── Date-only arithmetic ──────────────────────────────────────────────────────

const utcMs = (iso: ISODate): number => {
  const { y, m, d } = parseISO(iso);
  return Date.UTC(y, m - 1, d);
};

const fromUtcMs = (ms: number): ISODate => {
  const dt = new Date(ms);
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
};

export function addDays(iso: ISODate, n: number): ISODate {
  return fromUtcMs(utcMs(iso) + n * DAY_MS);
}

/** Adds calendar months; the day is clamped to the target month's length (Jan 31 + 1 = Feb 28/29). */
export function addMonths(iso: ISODate, n: number): ISODate {
  const { y, m, d } = parseISO(iso);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (((total % 12) + 12) % 12) + 1;
  return toISO(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

/** Adds calendar years; Feb 29 lands on Feb 28 in a common year. */
export function addYears(iso: ISODate, n: number): ISODate {
  return addMonths(iso, n * 12);
}

/** Whole calendar days from `b` to `a` (a - b): positive when `a` is later. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((utcMs(a) - utcMs(b)) / DAY_MS);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekday(iso: ISODate): number {
  return new Date(utcMs(iso)).getUTCDay();
}

/** The Sunday on or before `iso`. */
export function startOfWeek(iso: ISODate): ISODate {
  return addDays(iso, -weekday(iso));
}

/** The Saturday on or after `iso`. */
export function endOfWeek(iso: ISODate): ISODate {
  return addDays(iso, 6 - weekday(iso));
}

export function endOfMonth(iso: ISODate): ISODate {
  const { y, m } = parseISO(iso);
  return toISO(y, m, daysInMonth(y, m));
}

/** The first date strictly after `fromISO` that falls on weekday `wd` (0 = Sunday). 1-7 days ahead. */
export function nextWeekday(fromISO: ISODate, wd: number): ISODate {
  const ahead = (wd - weekday(fromISO) + 7) % 7;
  return addDays(fromISO, ahead === 0 ? 7 : ahead);
}

// ── Comparison ────────────────────────────────────────────────────────────────

/** Comparator for ISODates (valid ISODates sort lexicographically). */
export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Earliest of the given dates, ignoring null/undefined; null when there is none. */
export function minISO(...dates: (ISODate | null | undefined)[]): ISODate | null {
  let min: ISODate | null = null;
  for (const d of dates) {
    if (d != null && (min === null || d < min)) min = d;
  }
  return min;
}
