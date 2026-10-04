// Hebrew chip labels for parsed phrases: "מחר · יום ב׳ 5/10", "מחר בבוקר · יום ב׳ 5/10",
// "עד יום ה׳ 8/10", "השבוע · עד שבת 10/10", "17:30", "08:00–12:00", "דחוף", "רכב", "כל שבוע".

import { getCategory } from '$lib/domain/categories';
import { diffDays, weekday } from '$lib/domain/dates';
import type { CategoryId, ISODate, Priority, RecurrenceFreq } from '$lib/domain/types';
import { formatTime, relativeDayLabel } from '$lib/i18n/format';
import type { DayPart } from './lexicon';

/** "יום ה׳" with a Hebrew geresh (U+05F3); Saturday is just "שבת" (as in i18n/format chips). */
const WEEKDAY_SHORT = ['יום א׳', 'יום ב׳', 'יום ג׳', 'יום ד׳', 'יום ה׳', 'יום ו׳', 'שבת'];

/** The part of day a phrase carried ("מחר בבוקר"): it goes on the chip, since no time is set. */
const DAY_PART_LABELS: Record<DayPart, string> = {
  morning: 'בבוקר',
  noon: 'בצהריים',
  afternoon: 'אחה\u{5F4}צ',
  evening: 'בערב',
  night: 'בלילה'
};

/** "5/10", or "3/1/27" when the date falls in another calendar year than today. */
function numericDay(iso: ISODate, today: ISODate): string {
  const [y, m, d] = [iso.slice(0, 4), Number(iso.slice(5, 7)), Number(iso.slice(8, 10))];
  return y === today.slice(0, 4) ? `${d}/${m}` : `${d}/${m}/${y.slice(2)}`;
}

/** "יום ה׳ 8/10", "שבת 10/10", "יום א׳ 3/1/27". */
const plainDay = (iso: ISODate, today: ISODate): string =>
  `${WEEKDAY_SHORT[weekday(iso)] ?? ''} ${numericDay(iso, today)}`;

/**
 * "מחר · יום ב׳ 5/10", "היום · יום א׳ 4/10", "יום ה׳ 8/10", "שבת 10/10", "יום א׳ 3/1/27"; with a
 * part of day: "מחר בבוקר · יום ב׳ 5/10", "יום ה׳ 8/10 בצהריים".
 */
export function dateLabel(iso: ISODate, today: ISODate, dayPart?: DayPart): string {
  const day = plainDay(iso, today);
  const part = dayPart ? ` ${DAY_PART_LABELS[dayPart]}` : '';
  const near = Math.abs(diffDays(iso, today)) <= 1;
  return near ? `${relativeDayLabel(iso, today)}${part} · ${day}` : `${day}${part}`;
}

/** "עד יום ה׳ 8/10", "עד מחר בבוקר · יום ב׳ 5/10". */
export const dueLabel = (iso: ISODate, today: ISODate, dayPart?: DayPart): string =>
  `עד ${dateLabel(iso, today, dayPart)}`;

/** A week plan: "השבוע · עד שבת 10/10" (this week, to its Saturday) or "בשבוע הבא". */
export function weekPlanLabel(week: 'this' | 'next', iso: ISODate, today: ISODate): string {
  return week === 'next' ? 'בשבוע הבא' : `השבוע · עד ${plainDay(iso, today)}`;
}

/**
 * "17:30" or "08:00–12:00" (a range, with an en dash), prefixed "היום" / "מחר" when the date is
 * implied by the time alone.
 */
export function timeLabel(
  time: string,
  impliedDate: ISODate | undefined,
  today: ISODate,
  endTime?: string
): string {
  const clock = endTime ? `${formatTime(time)}\u2013${formatTime(endTime)}` : formatTime(time);
  return impliedDate === undefined ? clock : `${relativeDayLabel(impliedDate, today)} ${clock}`;
}

const PRIORITY_LABELS: Record<Exclude<Priority, 'normal'>, string> = {
  urgent: 'דחוף',
  high: 'חשוב'
};
export const priorityLabel = (p: Exclude<Priority, 'normal'>): string => PRIORITY_LABELS[p];

export const categoryLabel = (id: CategoryId): string => getCategory(id).label;

const RECURRENCE_LABELS: Record<RecurrenceFreq, string> = {
  weekly: 'כל שבוע',
  monthly: 'כל חודש',
  yearly: 'כל שנה'
};

/** "כל שבוע", or "כל שבוע · יום ג׳ 6/10 (בבוקר)" when the phrase also fixed the first date. */
export function recurrenceLabel(
  freq: RecurrenceFreq,
  firstDate: ISODate | undefined,
  today: ISODate,
  dayPart?: DayPart
): string {
  const base = RECURRENCE_LABELS[freq];
  if (firstDate === undefined) return base;
  const part = dayPart ? ` ${DAY_PART_LABELS[dayPart]}` : '';
  return `${base} · ${plainDay(firstDate, today)}${part}`;
}
