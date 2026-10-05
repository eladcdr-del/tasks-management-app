// Hebrew formatting helpers (Blueprint §3, §7): dates, relative days, date chips, plurals, numbers,
// age and expiry copy, greeting. Pure and locale-explicit. The wording is deterministic (own tables,
// not Intl's Hebrew calendar names) so it cannot drift with the ICU version of the user's browser.
// UI strings that are not computed live in he.ts; user-entered text is never formatted here.
// Layering: this module maps the domain's keys and dates to Hebrew; domain/* never imports from here.
//
// MALFORMED-DATE POLICY: formatters never throw. Given an invalid ISODate (or an invalid epoch
// value), a formatter that returns `string` returns '' and one that returns `T | null` returns null.

import { ageStart } from '../domain/age';
import { bucketInfo, weekHorizon } from '../domain/buckets';
import {
  addDays,
  addMonths,
  DEFAULT_TZ,
  diffDays,
  isValidISO,
  parseISO,
  todayISO,
  weekday
} from '../domain/dates';
import { intervalOf, weekdaysOf, type RecurrenceRule } from '../domain/recurrence';
import {
  snoozeOptions,
  type SnoozeBlockedReason,
  type SnoozeKey,
  type SnoozeOption
} from '../domain/snooze';
import type { ISODate, Millis, Priority, RecurrenceFreq, Task } from '../domain/types';

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

/** The span scale switches from weeks to calendar months at this many days ("8 שבועות" is the last). */
const WEEKS_UNTIL_DAYS = 60;

/**
 * The span from `from` to `to` in Hebrew, on one scale shared by the age badge and the lateness chip:
 *   0-6 days                 יום / יומיים / 3 ימים ... 6 ימים   (0 gives "0 ימים")
 *   7-59 days                שבוע / שבועיים / 3 שבועות ... 8 שבועות   (whole weeks)
 *   60 days to 11 months     חודשיים / 3 חודשים ... 11 חודשים   (calendar months, at least 2)
 *   12+ calendar months      שנה / שנתיים / 3 שנים ...
 * A month is counted on the same day of the month (clamped: Jan 31 -> Feb 28), not as 30 days. At
 * 60 days the calendar count can still be 1 (Jul 31 -> Sep 29), so it is floored at 2: the scale
 * never steps back from "8 שבועות" to "חודש".
 * '' when `to` is before `from` or either date is malformed.
 */
export function elapsedText(from: ISODate, to: ISODate): string {
  if (!isValidISO(from) || !isValidISO(to)) return '';
  const days = diffDays(to, from);
  if (days < 0) return '';
  if (days < 7) return pluralDays(days);
  if (days < WEEKS_UNTIL_DAYS) return pluralWeeks(Math.floor(days / 7));
  const months = Math.max(2, calendarMonths(from, to));
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

/**
 * The age badge text for `task` at instant `now`: ageLabelText(ageStart(task), today in `tz`). A
 * recurring instance counts from its own date (domain/age ageStart), so next month's bill is "חדשה".
 */
export function ageLabel(
  task: Pick<Task, 'createdAt' | 'seriesId' | 'dueDate' | 'scheduledFor'>,
  now: Millis | Date,
  tz: string = DEFAULT_TZ
): string {
  return ageLabelText(ageStart(task, tz), todayISO(now, tz));
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
 * The "missed soft plan" hint (feminine past, the subject is משימה): "תוכננה לאתמול", a weekday
 * within the last 6 days ("תוכננה ליום ה׳", "תוכננה לשבת"), else "תוכננה ל-27/9". '' unless
 * `scheduledFor` is before `today`. A day plan only: see planHint for week plans.
 */
export function plannedFromLabel(scheduledFor: ISODate, today: ISODate): string {
  if (!isValidISO(scheduledFor) || !isValidISO(today)) return '';
  const ago = diffDays(today, scheduledFor);
  if (ago < 1) return '';
  if (ago === 1) return 'תוכננה לאתמול';
  if (ago <= 6) return `תוכננה ל${at(WEEKDAY_SHORT, weekday(scheduledFor))}`;
  return `תוכננה ל-${numericDay(scheduledFor, today)}`;
}

/** The missed-week-plan copy (Task.weekPlan whose Saturday has passed). */
const MISSED_WEEK = 'תוכננה לשבוע שעבר';

/**
 * The "missed plan" line on a card, aware of week plans: '' unless the task sits in Today only
 * because its plan was missed (bucketInfo.plannedFromPast: an overdue task already shouts louder).
 * Then "תוכננה לשבוע שעבר" for a week plan, plannedFromLabel ("תוכננה לאתמול") for a day plan.
 */
export function planHint(
  task: Pick<Task, 'scheduledFor' | 'dueDate'> & { weekPlan?: boolean },
  today: ISODate
): string {
  const { scheduledFor } = task;
  if (scheduledFor === null || !isValidISO(scheduledFor) || !isValidISO(today)) return '';
  if (!bucketInfo(task, today).plannedFromPast) return '';
  return task.weekPlan === true ? MISSED_WEEK : plannedFromLabel(scheduledFor, today);
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
 * A week plan's chip (Task.weekPlan, no dueDate; `scheduledFor` is the Saturday ending the week):
 *   Saturday passed                       "תוכננה לשבוע שעבר"  (today: it sits in Today)
 *   the Saturday is today                 "סוף השבוע"          (today)
 *   up to weekHorizon(today)              "השבוע"              (normal)
 *   the week right after the horizon      "בשבוע הבא"          (normal)
 *   later                                 "שבוע של 24/10"      (normal: the week ending that Saturday)
 */
function weekPlanChip(saturday: ISODate, today: ISODate): WhenChip {
  if (saturday < today) return { text: MISSED_WEEK, tone: 'today' };
  if (saturday === today) return { text: 'סוף השבוע', tone: 'today' };
  const horizon = weekHorizon(today);
  if (saturday <= horizon) return { text: 'השבוע', tone: 'normal' };
  if (saturday <= addDays(horizon, 7)) return { text: 'בשבוע הבא', tone: 'normal' };
  return { text: `שבוע של ${numericDay(saturday, today)}`, tone: 'normal' };
}

/** The fields whenChip reads. `weekPlan` is optional (absent = a day plan). */
export type WhenFields = Pick<Task, 'dueDate' | 'scheduledFor' | 'dueTime'> & {
  weekPlan?: boolean;
};

/**
 * The date chip on a task card. It uses `dueDate` when there is one ("עד ..."), else `scheduledFor`
 * (no "עד"), and appends `dueTime` when set:
 *   "עד היום 17:30" (today)  "מחר 17:30" / "עד יום ג׳" (soon: the next 2 days)  "יום ד׳" / "עד 15/10" (normal)
 *   overdue due date        "באיחור של יום / יומיים / 3 ימים / שבוע / 3 שבועות / חודשיים"  (late)
 *   due today, time passed  "היום 09:00 · הזמן עבר"  (late; needs `now`, the local wall clock)
 *   missed soft plan        "תוכננה לאתמול" (today; a missed plan is not overdue, see bucketOf)
 *   planned today (or a missed plan) with a LATER due date: both, "היום · עד 14/10" /
 *                           "תוכננה לאתמול · עד מחר" (today: it is in Today because of the plan)
 *   week plan, no due date  "השבוע" / "סוף השבוע" / "בשבוע הבא" / "שבוע של 24/10" /
 *                           "תוכננה לשבוע שעבר" (see weekPlanChip; a week has no time of day)
 *   a time and no date      "17:30" (normal: quick add no longer saves one, older tasks may)
 * null when the task has no date and no time (or the date is malformed).
 * Only the tone and text are time-aware: BUCKETING STAYS DATE-ONLY (a task due today at 09:00 is in
 * "today" all day, and becomes overdue at midnight, not at 09:01).
 */
export function whenChip(
  task: WhenFields,
  today: ISODate,
  now?: { hour: number; minute: number }
): WhenChip | null {
  const isDue = task.dueDate !== null;
  const date = task.dueDate ?? task.scheduledFor;
  // a time with no date (quick add once saved one) still shows rather than vanishing
  if (date === null && timeMinutes(task.dueTime) !== null) {
    return { text: formatTime(task.dueTime as string), tone: 'normal' };
  }
  if (date === null || !isValidISO(date) || !isValidISO(today)) return null;
  if (!isDue && task.weekPlan === true) return weekPlanChip(date, today);

  const ahead = diffDays(date, today);
  if (ahead < 0) {
    return isDue
      ? { text: `באיחור של ${elapsedText(date, today)}`, tone: 'late' }
      : { text: plannedFromLabel(date, today), tone: 'today' };
  }

  const minutes = timeMinutes(task.dueTime);
  const time = minutes === null ? '' : ` ${formatTime(task.dueTime as string)}`;
  const plan = task.scheduledFor;
  if (isDue && ahead > 0 && plan !== null && isValidISO(plan) && plan <= today) {
    const planned =
      task.weekPlan === true
        ? plan === today
          ? 'סוף השבוע'
          : MISSED_WEEK
        : plan === today
          ? 'היום'
          : plannedFromLabel(plan, today);
    return { text: `${planned} · עד ${relativeDayLabel(date, today)}${time}`, tone: 'today' };
  }

  const prefix = isDue ? 'עד ' : '';
  if (ahead === 0) {
    if (minutes !== null && now !== undefined && now.hour * 60 + now.minute > minutes) {
      return { text: `היום${time} · הזמן עבר`, tone: 'late' };
    }
    return { text: `${prefix}היום${time}`, tone: 'today' };
  }
  return {
    text: `${prefix}${relativeDayLabel(date, today)}${time}`,
    tone: ahead <= 2 ? 'soon' : 'normal'
  };
}

/**
 * The hard-deadline badge: "מועד אחרון: יום ד׳" (relativeDayLabel: היום / מחר / יום ד׳ / שבת /
 * 15/10). null unless the task has a hard deadline with a valid dueDate.
 */
export function deadlineLabel(
  task: Pick<Task, 'dueDate' | 'hardDeadline'>,
  today: ISODate
): string | null {
  if (!task.hardDeadline || task.dueDate === null) return null;
  const day = relativeDayLabel(task.dueDate, today);
  return day === '' ? null : `מועד אחרון: ${day}`;
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

/** The snooze sheet's quick options (domain snoozeOptions: deduped, sorted, capped) with labels. */
export function labeledSnoozeOptions(
  task: Pick<Task, 'dueDate' | 'hardDeadline'>,
  today: ISODate
): (SnoozeOption & { label: string })[] {
  return snoozeOptions(task, today).map((o) => ({
    key: o.key,
    label: SNOOZE_LABELS[o.key],
    date: o.date
  }));
}

const SNOOZE_BLOCKED_TEXT: Readonly<Record<SnoozeBlockedReason, string>> = {
  'deadline-today': 'היום המועד האחרון, אי אפשר לדחות'
};

/** Why the snooze sheet offers nothing (domain snoozeBlockedReason), in Hebrew. */
export function snoozeBlockedText(reason: SnoozeBlockedReason): string {
  return SNOOZE_BLOCKED_TEXT[reason];
}

// ── Static labels ─────────────────────────────────────────────────────────────

/**
 * Priority names for the pickers and the "עדיפות" field, feminine to agree with עדיפות
 * ("עדיפות: דחופה"). The card badges keep their own short "דחוף" / "חשוב" (he.taskCard).
 */
export const PRIORITY_LABELS: Readonly<Record<Priority, string>> = {
  normal: 'רגילה',
  high: 'חשובה',
  urgent: 'דחופה'
};

/**
 * The bare frequency names (interval 1, no listed days).
 * @deprecated Use `recurrenceText(task.recurrence)`, which also reads interval and weekdays.
 */
export const RECURRENCE_LABELS: Readonly<Record<RecurrenceFreq, string>> = {
  daily: 'כל יום',
  weekly: 'כל שבוע',
  monthly: 'כל חודש',
  yearly: 'כל שנה'
};

// ── Recurrence ────────────────────────────────────────────────────────────────

/** Day letters with a geresh, as in "ימים א׳–ה׳"; Saturday is just "שבת" (as in WEEKDAY_SHORT). */
const WEEKDAY_LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת'];

/** "יום ראשון" … "שבת": the full day name (accessible names of the weekday toggles). */
export function weekdayFullName(day: number): string {
  if (!Number.isInteger(day) || day < 0 || day > 6) return '';
  return day === 6 ? 'שבת' : `יום ${at(WEEKDAY_NAMES, day)}`;
}

/** Hebrew "and" joins the last item: "א׳ וד׳", "א׳, ג׳ וה׳". */
function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} ו${items.at(-1) as string}`;
}

/**
 * Days as letters, in week order: "א׳ וד׳", "ב׳, ד׳ וה׳", "ו׳ ושבת". A run of three or more
 * consecutive days is a range, as Israelis write opening hours: "א׳–ה׳".
 */
function weekdayList(days: readonly number[]): string {
  const items: string[] = [];
  for (let i = 0; i < days.length;) {
    let j = i;
    while (j + 1 < days.length && (days[j + 1] as number) === (days[j] as number) + 1) j++;
    const first = at(WEEKDAY_LETTERS, days[i] as number);
    const last = at(WEEKDAY_LETTERS, days[j] as number);
    if (j - i >= 2) items.push(`${first}–${last}`);
    else for (let k = i; k <= j; k++) items.push(at(WEEKDAY_LETTERS, days[k] as number));
    i = j + 1;
  }
  return joinAnd(items);
}

/** "ביום ב׳" / "בשבת" (one day) or "בימים א׳ וד׳" (several). */
function onDays(days: readonly number[]): string {
  if (days.length === 1)
    return days[0] === 6 ? 'בשבת' : `ביום ${at(WEEKDAY_LETTERS, days[0] as number)}`;
  return `בימים ${weekdayList(days)}`;
}

/**
 * A recurrence in plain Hebrew, for the card, the detail screen and the chips:
 *   daily     כל יום · כל יומיים · כל 3 ימים
 *   weekly    כל שבוע · כל שבועיים · כל 3 שבועות
 *   weekdays  כל יום ב׳ · כל שבת · בימים א׳ וד׳ · בימים א׳–ה׳ · כל יום (all seven)
 *             every N weeks: כל שבועיים ביום ב׳ · כל 3 שבועות בימים א׳ וד׳
 *   monthly   כל חודש · כל חודשיים · כל 3 חודשים
 *   yearly    כל שנה · כל שנתיים · כל 3 שנים
 * Reads interval and weekdays the way the domain does (a bad interval is 1; weekdays only on a
 * weekly rule). '' for null.
 */
export function recurrenceText(rule: RecurrenceRule | null | undefined): string {
  if (!rule) return '';
  const n = intervalOf(rule);
  switch (rule.freq) {
    case 'daily':
      return n === 1 ? 'כל יום' : `כל ${pluralDays(n)}`;
    case 'weekly': {
      const days = weekdaysOf(rule);
      const every = `כל ${pluralWeeks(n)}`;
      if (!days) return every;
      if (n > 1) return `${every} ${onDays(days)}`;
      if (days.length === 7) return 'כל יום';
      if (days.length === 1)
        return days[0] === 6 ? 'כל שבת' : `כל יום ${at(WEEKDAY_LETTERS, days[0] as number)}`;
      return onDays(days);
    }
    case 'monthly':
      return `כל ${pluralMonths(n)}`;
    case 'yearly':
      return `כל ${pluralYears(n)}`;
    default:
      return '';
  }
}

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
