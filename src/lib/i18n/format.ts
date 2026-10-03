// Hebrew formatting helpers (Blueprint §3, §7): dates, relative days, due chips, plurals, numbers,
// greeting. Pure and locale-explicit. The wording is deterministic (own tables, not Intl's Hebrew
// calendar names) so it cannot drift with the ICU version of the user's browser.
// UI strings that are not computed live in he.ts; user-entered text is rendered with dir="auto".

import { diffDays, parseISO, weekday } from '../domain/dates';
import type { ISODate, Task } from '../domain/types';

/** Table lookup for an index that is known to be in range (validated dates only). */
const at = <T>(table: readonly T[], i: number): T => table[i] as T;

const WEEKDAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
/** Short form for chips: "יום ה'" (ASCII apostrophe, as the quick-add parser also accepts). Saturday is just "שבת". */
const WEEKDAY_SHORT = ["יום א'", "יום ב'", "יום ג'", "יום ד'", "יום ה'", "יום ו'", 'שבת'];
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
 */
export function formatCurrency(n: number): string {
  const wholeShekels = Math.round(n * 100) % 100 === 0;
  return (wholeShekels ? shekelsWhole() : shekelsWithAgorot()).format(n);
}

// ── Plurals (Hebrew has a dual: יומיים, שבועיים, חודשיים, שנתיים) ───────────────

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
/** משימה אחת / N משימות (2 gives "2 משימות", 0 gives "0 משימות": use an empty state for zero). */
export const pluralTasks = (n: number): string =>
  n === 1 ? 'משימה אחת' : `${formatNumber(n)} משימות`;

// ── Dates ─────────────────────────────────────────────────────────────────────

/** "יום ראשון, 4 באוקטובר" */
export function formatLongDate(iso: ISODate): string {
  const { m, d } = parseISO(iso);
  return `יום ${at(WEEKDAY_NAMES, weekday(iso))}, ${d} ב${at(MONTH_NAMES, m - 1)}`;
}

/**
 * A short, human label for `iso` relative to `today`:
 * היום / מחר / אתמול; a weekday ("יום ה'", "שבת") for 2-6 days ahead; otherwise "15/10", with a
 * two-digit year ("15/10/27") when it falls in another calendar year. From +7 days a numeric date
 * is used so the weekday name can never be confused with today's.
 */
export function relativeDayLabel(iso: ISODate, today: ISODate): string {
  const ahead = diffDays(iso, today);
  if (ahead === 0) return 'היום';
  if (ahead === 1) return 'מחר';
  if (ahead === -1) return 'אתמול';
  if (ahead >= 2 && ahead <= 6) return at(WEEKDAY_SHORT, weekday(iso));
  const { y, m, d } = parseISO(iso);
  const short = `${d}/${m}`;
  return y === parseISO(today).y ? short : `${short}/${String(y % 100).padStart(2, '0')}`;
}

/**
 * The deadline chip on a task card: "עד היום", "עד מחר", "עד יום ה'", "עד 15/10",
 * or "באיחור של יום" / "באיחור של יומיים" / "באיחור של 5 ימים" once past. `null` without a dueDate
 * (a soft plan has no deadline chip).
 */
export function dueChipLabel(task: Pick<Task, 'dueDate'>, today: ISODate): string | null {
  if (task.dueDate === null) return null;
  const late = diffDays(today, task.dueDate);
  if (late > 0) return `באיחור של ${pluralDays(late)}`;
  return `עד ${relativeDayLabel(task.dueDate, today)}`;
}

// ── Time of day ───────────────────────────────────────────────────────────────

/** בוקר טוב 05:00-11:59, צהריים טובים 12:00-16:59, ערב טוב 17:00-21:59, otherwise לילה טוב. */
export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'בוקר טוב';
  if (hour >= 12 && hour < 17) return 'צהריים טובים';
  if (hour >= 17 && hour < 22) return 'ערב טוב';
  return 'לילה טוב';
}

/** 24-hour "HH:mm" for display ('9:05' becomes '09:05'). Unparseable input is returned unchanged. */
export function formatTime(hhmm: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) return hhmm;
  const [h, min] = [Number(match[1]), Number(match[2])];
  if (h > 23 || min > 59) return hhmm;
  return `${String(h).padStart(2, '0')}:${match[2]}`;
}
