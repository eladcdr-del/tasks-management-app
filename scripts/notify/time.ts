// Asia/Jerusalem wall-clock helpers for the notifier. No date library: the only timezone-aware step
// is Intl.DateTimeFormat (Node ships full ICU); everything after that is plain arithmetic on
// calendar numbers in UTC space, where a day is always 86 400 000 ms, so DST can never shift a date.

export const TZ = 'Asia/Jerusalem';

const DAY_MS = 86_400_000;

/** Wall-clock facts about one instant in Asia/Jerusalem. */
export interface LocalParts {
  /** Calendar date 'YYYY-MM-DD'. */
  iso: string;
  /** 0-23 (midnight is 0, never 24). */
  hour: number;
  minute: number;
  /** 0 = Sunday ... 6 = Saturday. */
  weekday: number;
  /** ISO-8601 week of `iso`, 'YYYY-Www' (weeks run Monday-Sunday, so a Sunday closes its week). */
  isoWeek: string;
}

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

const formatter = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

function utcOf(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new RangeError(`Invalid ISO date: ${iso}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function isoOfUtc(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** ISO-8601 week label of a calendar date: the week belongs to the year of its Thursday. */
export function isoWeekOf(iso: string): string {
  const ms = utcOf(iso);
  const dayFromMonday = (new Date(ms).getUTCDay() + 6) % 7; // Mon 0 ... Sun 6
  const thursday = new Date(ms + (3 - dayFromMonday) * DAY_MS);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY_MS / 7) + 1;
  return `${year}-W${pad(week)}`;
}

/** Wall-clock parts of `now` in Asia/Jerusalem. */
export function localParts(now: Date | number): LocalParts {
  const p: Record<string, number> = {};
  for (const part of formatter.formatToParts(now)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const iso = `${pad(p.year ?? 0, 4)}-${pad(p.month ?? 0)}-${pad(p.day ?? 0)}`;
  return {
    iso,
    hour: (p.hour ?? 0) % 24,
    minute: p.minute ?? 0,
    weekday: new Date(utcOf(iso)).getUTCDay(),
    isoWeek: isoWeekOf(iso)
  };
}

/** The Asia/Jerusalem calendar date of an instant (epoch ms or Date). */
export function isoDateOf(instant: Date | number): string {
  return localParts(instant).iso;
}

function minutesOf(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new RangeError(`Invalid HH:mm: ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * True when the wall-clock time of `parts` is in [from, to): the start minute is included, the end
 * minute is not. A window whose start is after its end wraps past midnight (22:00-07:30).
 */
export function inWindow(
  parts: Pick<LocalParts, 'hour' | 'minute'>,
  from: string,
  to: string
): boolean {
  const t = parts.hour * 60 + parts.minute;
  const a = minutesOf(from);
  const b = minutesOf(to);
  return a <= b ? t >= a && t < b : t >= a || t < b;
}

export const QUIET_FROM = '22:00';
export const QUIET_TO = '07:30';

/** Quiet hours 22:00-07:30 local: nothing is sent; event-driven pushes wait until 07:30. */
export function isQuietHours(parts: Pick<LocalParts, 'hour' | 'minute'>): boolean {
  return inWindow(parts, QUIET_FROM, QUIET_TO);
}

/** `iso` plus `n` calendar days (n may be negative). */
export function addDaysISO(iso: string, n: number): string {
  return isoOfUtc(utcOf(iso) + n * DAY_MS);
}

/** Whole calendar days from `b` to `a` (a - b): positive when `a` is later. */
export function diffDays(a: string, b: string): number {
  return Math.round((utcOf(a) - utcOf(b)) / DAY_MS);
}

/** True for a real calendar date written exactly as 'YYYY-MM-DD'. */
export function isValidISO(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return isoOfUtc(utcOf(value)) === value;
}
