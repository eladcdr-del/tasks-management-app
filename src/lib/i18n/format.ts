// Hebrew formatting helpers (Blueprint §3, §7): dates, relative days, date chips, plurals, numbers,
// age and expiry copy, greeting. Pure and locale-explicit. The wording is deterministic (own tables,
// not Intl's Hebrew calendar names) so it cannot drift with the ICU version of the user's browser.
// UI strings that are not computed live in he.ts; user-entered text is rendered with dir="auto".
//
// MALFORMED-DATE POLICY: formatters never throw. Given an invalid ISODate (or an invalid epoch
// value), a formatter that returns `string` returns '' and one that returns `T | null` returns null.

import {
  addMonths,
  DEFAULT_TZ,
  diffDays,
  isValidISO,
  parseISO,
  todayISO,
  weekday
} from '../domain/dates';
import type { SnoozeKey } from '../domain/snooze';
import type { ISODate, Millis, Task } from '../domain/types';

/** Table lookup for an index that is known to be in range (validated dates only). */
const at = <T>(table: readonly T[], i: number): T => table[i] as T;

const WEEKDAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
/** Short form for chips: "יום ה׳" with a Hebrew geresh (U+05F3). Saturday is just "שבת". */
const WEEKDAY_SHORT = ['יום א׳', 'יום ב׳', 'יום ג׳', 'יום ד׳', 'יום ה׳', 'יום ו׳', 'שבת'];
const MONTH_NAMES = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר'
];

// ── Numbers ───────────────────────────────────────────────────────────────────

function memo<T>(make: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= make());
}

const numberFormat = memo(() => new Intl.NumberFormat('he-IL'));
const shekelsWhole = memo(
  () =>
    new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    })
);
const shekelsWithAgorot = memo(
  () =>
    new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
);

/** he-IL digit grouping: 1,234. */
export function formatNumber(n: number): string {
  return numberFormat().format(n);
}

/**
 * Shekels, he-IL: whole amounts without decimals ("180 ₪"), otherwise agorot ("12.50 ₪"). Note that
 * Intl's output carries bidi marks (U+200F) and a no-break space around the sign.
 * NaN and infinities give ''; -0 (or an amount that rounds to it) is printed as a plain "0 ₪".
 */
export function formatCurrency(n: number): string {
  if (!Number.isFinite(n)) return '';
  const agorot = Math.round(n * 100);
  const amount = agorot / 100 || 0; // `|| 0` turns -0 into 0
  return (agorot % 100 === 0 ? shekelsWhole() : shekelsWithAgorot()).format(amount);
}

// ── Plurals (Hebrew has a dual: יומיים, שבועיים, חודשיים, שנתיים, פעמיים) ────────

function plural(n: number, one: string, two: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  return `${formatNumber(n)} ${many}`;
}

/** יום / יומיים / N ימים (0 gives "0 ימים"). */
export const pluralDays = (n: number): string => plural(n, 'יום', 'יומיים', 'ימים');
/** שבוע / שבועיים / N שבועות */
export const pluralWeeks = (n: number): string => plural(n, 'שבוע', 'שבועיים', 'שבועות');
/** חודש / חודשיים / N חודשים */
export const pluralMonths = (n: number): string => plural(n, 'חודש', 'חודשיים', 'חודשים');
/** שנה / שנתיים / N שנים */
export const pluralYears = (n: number): string => plural(n, 'שנה', 'שנתיים', 'שנים');
/** פעם אחת / פעמיים / N פעמים */
export const pluralTimes = (n: number): string => plural(n, 'פעם אחת', 'פעמיים', 'פעמים');
/** משימה אחת / N משימות (2 gives "2 משימות", 0 gives "0 משימות": use an empty state for zero). */
export const pluralTasks = (n: number): string =>
  n === 1 ? 'משימה אחת' : `${formatNumber(n)} משימות`;

/** "נדחתה פעם אחת" / "נדחתה פעמיים" / "נדחתה 4 פעמים"; '' for a task that was never snoozed. */
export function snoozedLabel(count: number): string {
  return count >= 1 ? `נדחתה ${pluralTimes(count)}` : '';
}

// ── Spans of time (age badge, lateness) ───────────────────────────────────────

/** Whole calendar months from `from` to `to` (from <= to): Jan 31 -> Feb 28 is one month. */
function calendarMonths(from: ISODate, to: ISODate): number {
  const a = parseISO(from);
  const b = parseISO(to);
  const months = (b.y - a.y) * 12 + (b.m - a.m);
  return addMonths(from, months) > to ? months - 1 : months;
}

/**
 * The span from `from` to `to` in Hebrew, on one scale shared by the age badge and the lateness chip:
 *   0-6 days                     יום / יומיים / 3 ימים ... 6 ימים   (0 gives "0 ימים")
 *   7 days up to a calendar month  שבוע / שבועיים / 3 שבועות / 4 שבועות
 *   1-11 calendar months         חודש / חודשיים / 3 חודשים ... 11 חודשים
 *   12+ calendar months          שנה / שנתיים / 3 שנים ...
 * A month is counted on the same day of the month (clamped: Jan 31 -> Feb 28), not as 30 days.
 * '' when `to` is before `from` or either date is malformed.
 */
export function elapsedText(from: ISODate, to: ISODate): string {
  if (!isValidISO(from) || !isValidISO(to)) return '';
  const days = diffDays(to, from);
  if (days < 0) return '';
  if (days < 7) return pluralDays(days);
  const months = calendarMonths(from, to);
  if (months < 1) return pluralWeeks(Math.floor(days / 7));
  if (months < 12) return pluralMonths(months);
  return pluralYears(Math.floor(months / 12));
}

/**
 * The age badge copy for a task whose age is counted from `start` (see `ageStart` in domain/age):
 * "חדשה" for 0-1 days (or a start still ahead), then "פתוחה " + elapsedText, e.g. "פתוחה 3 שבועות".
 * Takes the two dates rather than a day count because months are calendar months.
 */
export function ageLabelText(start: ISODate, today: ISODate): string {
  if (!isValidISO(start) || !isValidISO(today)) return '';
  return diffDays(today, start) < 2 ? 'חדשה' : `פתוחה ${elapsedText(start, today)}`;
}

// ── Dates ─────────────────────────────────────────────────────────────────────

/** A calendar date given as an ISODate or as epoch millis (read in `tz`), or null when invalid. */
type DateInput = ISODate | Millis;

function toCalendarDate(input: DateInput, tz: string): ISODate | null {
  if (typeof input === 'number') {
    return Number.isNaN(new Date(input).getTime()) ? null : todayISO(input, tz);
  }
  return isValidISO(input) ? input : null;
}

/** "15/10", or "15/10/27" when `iso` is in another calendar year than `today`. */
function numericDay(iso: ISODate, today: ISODate): string {
  const { y, m, d } = parseISO(iso);
  const short = `${d}/${m}`;
  return y === parseISO(today).y ? short : `${short}/${String(y % 100).padStart(2, '0')}`;
}

/** "יום ראשון, 4 באוקטובר" */
export function formatLongDate(iso: ISODate): string {
  if (!isValidISO(iso)) return '';
  const { m, d } = parseISO(iso);
  return `יום ${at(WEEKDAY_NAMES, weekday(iso))}, ${d} ב${at(MONTH_NAMES, m - 1)}`;
}

export interface FormatDateOptions {
  /** true: always add the year; false: never. Omitted: add it only when `today` is in another year. */
  withYear?: boolean;
  /** Enables the automatic year (see `withYear`). */
  today?: ISODate;
  /** Timezone for epoch-millis input (default Asia/Jerusalem). */
  tz?: string;
}

/** "14 במרץ", or "14 במרץ 2025" with the year (see FormatDateOptions). Accepts an ISODate or millis. */
export function formatDate(input: DateInput, options: FormatDateOptions = {}): string {
  const iso = toCalendarDate(input, options.tz ?? DEFAULT_TZ);
  if (iso === null) return '';
  const { y, m, d } = parseISO(iso);
  const { today } = options;
  const withYear =
    options.withYear ?? (today !== undefined && isValidISO(today) && parseISO(today).y !== y);
  return `${d} ב${at(MONTH_NAMES, m - 1)}${withYear ? ` ${y}` : ''}`;
}

/** "אוקטובר 2026": a month heading (e.g. the memory list grouped by completion month). */
export function formatMonthYear(input: DateInput, tz: string = DEFAULT_TZ): string {
  const iso = toCalendarDate(input, tz);
  if (iso === null) return '';
  const { y, m } = parseISO(iso);
  return `${at(MONTH_NAMES, m - 1)} ${y}`;
}

/** "2026-10": a sortable grouping key for the month of `input`. */
export function monthKey(input: DateInput, tz: string = DEFAULT_TZ): string {
  const iso = toCalendarDate(input, tz);
  return iso === null ? '' : iso.slice(0, 7);
}

/**
 * A short, human label for `iso` relative to `today`:
 * היום / מחר / אתמול; a weekday ("יום ה׳", "שבת") for 2-6 days ahead; otherwise "15/10", with a
 * two-digit year ("15/10/27") when it falls in another calendar year. From +7 days a numeric date
 * is used so the weekday name can never be confused with today's.
 */
export function relativeDayLabel(iso: ISODate, today: ISODate): string {
  if (!isValidISO(iso) || !isValidISO(today)) return '';
  const ahead = diffDays(iso, today);
  if (ahead === 0) return 'היום';
  if (ahead === 1) return 'מחר';
  if (ahead === -1) return 'אתמול';
  if (ahead >= 2 && ahead <= 6) return at(WEEKDAY_SHORT, weekday(iso));
  return numericDay(iso, today);
}

/**
 * The "missed soft plan" hint (feminine, the subject is משימה): "מתוכננת מאתמול", a weekday within
 * the last 6 days ("מתוכננת מיום ה׳", "מתוכננת משבת"), else "מתוכננת מ-27/9". '' unless
 * `scheduledFor` is before `today`.
 */
export function plannedFromLabel(scheduledFor: ISODate, today: ISODate): string {
  if (!isValidISO(scheduledFor) || !isValidISO(today)) return '';
  const ago = diffDays(today, scheduledFor);
  if (ago < 1) return '';
  if (ago === 1) return 'מתוכננת מאתמול';
  if (ago <= 6) return `מתוכננת מ${at(WEEKDAY_SHORT, weekday(scheduledFor))}`;
  return `מתוכננת מ-${numericDay(scheduledFor, today)}`;
}

// ── Date chips ────────────────────────────────────────────────────────────────

export type WhenTone = 'late' | 'today' | 'soon' | 'normal';
export interface WhenChip {
  text: string;
  tone: WhenTone;
}

/** Minutes after midnight for a valid 'H:mm' / 'HH:mm', else null. */
function timeMinutes(hhmm: string | null): number | null {
  const match = hhmm === null ? null : /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  const [h, min] = [Number(match[1]), Number(match[2])];
  return h > 23 || min > 59 ? null : h * 60 + min;
}

/**
 * The date chip on a task card. It uses `dueDate` when there is one ("עד ..."), else `scheduledFor`
 * (no "עד"), and appends `dueTime` when set:
 *   "עד היום 17:30" (today)  "מחר 17:30" / "עד יום ג׳" (soon: the next 2 days)  "יום ד׳" / "עד 15/10" (normal)
 *   overdue due date        "באיחור של יום / יומיים / 3 ימים / שבוע / 3 שבועות / חודשיים"  (late)
 *   due today, time passed  "היום 09:00 · עבר"  (late; needs `now`, the local wall clock)
 *   missed soft plan        "מתוכננת מאתמול" (today; a missed plan is not overdue, see bucketOf)
 * null when the task has no date (or the date is malformed).
 * Only the tone and text are time-aware: BUCKETING STAYS DATE-ONLY (a task due today at 09:00 is in
 * "today" all day, and becomes overdue at midnight, not at 09:01).
 */
export function whenChip(
  task: Pick<Task, 'dueDate' | 'scheduledFor' | 'dueTime'>,
  today: ISODate,
  now?: { hour: number; minute: number }
): WhenChip | null {
  const isDue = task.dueDate !== null;
  const date = task.dueDate ?? task.scheduledFor;
  if (date === null || !isValidISO(date) || !isValidISO(today)) return null;

  const ahead = diffDays(date, today);
  if (ahead < 0) {
    return isDue
      ? { text: `באיחור של ${elapsedText(date, today)}`, tone: 'late' }
      : { text: plannedFromLabel(date, today), tone: 'today' };
  }

  const minutes = timeMinutes(task.dueTime);
  const time = minutes === null ? '' : ` ${formatTime(task.dueTime as string)}`;
  const prefix = isDue ? 'עד ' : '';
  if (ahead === 0) {
    if (minutes !== null && now !== undefined && now.hour * 60 + now.minute > minutes) {
      return { text: `היום${time} · עבר`, tone: 'late' };
    }
    return { text: `${prefix}היום${time}`, tone: 'today' };
  }
  return {
    text: `${prefix}${relativeDayLabel(date, today)}${time}`,
    tone: ahead <= 2 ? 'soon' : 'normal'
  };
}

/**
 * The deadline chip text alone: "עד היום", "עד מחר", "עד יום ה׳", "עד 15/10", or once past
 * "באיחור של יום" / "באיחור של שבוע" ... `null` without a dueDate (a soft plan has no deadline chip).
 * @deprecated Kept for compatibility; use `whenChip`, which also covers soft plans, dueTime and tone.
 */
export function dueChipLabel(task: Pick<Task, 'dueDate'>, today: ISODate): string | null {
  return (
    whenChip({ dueDate: task.dueDate, scheduledFor: null, dueTime: null }, today)?.text ?? null
  );
}

// ── Expiry (invites) ──────────────────────────────────────────────────────────

/**
 * Whole calendar days in `tz` from the date of `now` to the date of `expiresAt` (0 = expires later
 * today, negative once that date has passed). NaN for invalid instants.
 */
export function daysUntil(expiresAt: Millis, now: Date | Millis, tz: string = DEFAULT_TZ): number {
  const nowMs = typeof now === 'number' ? now : now.getTime();
  if (Number.isNaN(new Date(expiresAt).getTime()) || Number.isNaN(new Date(nowMs).getTime())) {
    return Number.NaN;
  }
  return diffDays(todayISO(expiresAt, tz), todayISO(nowMs, tz));
}

/** "בתוקף עוד 6 ימים" / "בתוקף עוד יומיים" / "בתוקף עד מחר" / "בתוקף עד היום" / "פג תוקף". */
export function validForLabel(
  expiresAt: Millis,
  now: Date | Millis,
  tz: string = DEFAULT_TZ
): string {
  const days = daysUntil(expiresAt, now, tz);
  if (Number.isNaN(days)) return '';
  if (expiresAt <= (typeof now === 'number' ? now : now.getTime())) return 'פג תוקף';
  if (days < 1) return 'בתוקף עד היום';
  if (days === 1) return 'בתוקף עד מחר';
  return `בתוקף עוד ${pluralDays(days)}`;
}

// ── Snooze ────────────────────────────────────────────────────────────────────

/** Labels for the snooze sheet's quick options (dates come from `snoozeTargets` in domain/snooze). */
export const SNOOZE_LABELS: Readonly<Record<SnoozeKey, string>> = {
  tomorrow: 'מחר',
  weekend: 'סוף השבוע',
  nextWeek: 'שבוע הבא',
  month: 'בעוד חודש'
};

// ── Time of day ───────────────────────────────────────────────────────────────

/**
 * בוקר טוב 05:00-11:59, צהריים טובים 12:00-16:59, otherwise (17:00-04:59) ערב טוב.
 * There is deliberately no "לילה טוב": in Hebrew it is a farewell, not a greeting.
 */
export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'בוקר טוב';
  if (hour >= 12 && hour < 17) return 'צהריים טובים';
  return 'ערב טוב';
}

/** 24-hour "HH:mm" for display ('9:05' becomes '09:05'). Unparseable input is returned unchanged. */
export function formatTime(hhmm: string): string {
  const minutes = timeMinutes(hhmm);
  if (minutes === null) return hhmm;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
