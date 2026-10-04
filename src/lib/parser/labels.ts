// Hebrew chip labels for parsed phrases: "מחר · יום ב׳ 5/10", "עד יום ה׳ 8/10", "17:30", "דחוף",
// "רכב", "כל שבוע", "מועד אחרון".

import { getCategory } from '$lib/domain/categories';
import { diffDays, weekday } from '$lib/domain/dates';
import type { CategoryId, ISODate, Priority, RecurrenceFreq } from '$lib/domain/types';
import { formatTime, relativeDayLabel } from '$lib/i18n/format';

/** "יום ה׳" with a Hebrew geresh (U+05F3); Saturday is just "שבת" (as in i18n/format chips). */
const WEEKDAY_SHORT = ['יום א׳', 'יום ב׳', 'יום ג׳', 'יום ד׳', 'יום ה׳', 'יום ו׳', 'שבת'];

/** "5/10", or "3/1/27" when the date falls in another calendar year than today. */
function numericDay(iso: ISODate, today: ISODate): string {
  const [y, m, d] = [iso.slice(0, 4), Number(iso.slice(5, 7)), Number(iso.slice(8, 10))];
  return y === today.slice(0, 4) ? `${d}/${m}` : `${d}/${m}/${y.slice(2)}`;
}

/** "יום ה׳ 8/10", "שבת 10/10", "יום א׳ 3/1/27". */
const plainDay = (iso: ISODate, today: ISODate): string =>
  `${WEEKDAY_SHORT[weekday(iso)] ?? ''} ${numericDay(iso, today)}`;

/** "מחר · יום ב׳ 5/10", "היום · יום א׳ 4/10", "יום ה׳ 8/10", "שבת 10/10", "יום א׳ 3/1/27". */
export function dateLabel(iso: ISODate, today: ISODate): string {
  const day = plainDay(iso, today);
  const near = Math.abs(diffDays(iso, today)) <= 1;
  return near ? `${relativeDayLabel(iso, today)} · ${day}` : day;
}

/** "עד יום ה׳ 8/10", "עד מחר · יום ב׳ 5/10". */
export const dueLabel = (iso: ISODate, today: ISODate): string => `עד ${dateLabel(iso, today)}`;

/** The flag chip of a "מועד אחרון" with no date in the line. */
export const HARD_LABEL = 'מועד אחרון';

/** "17:30", or "היום 17:30" / "מחר 08:00" when the date is implied by the time alone. */
export function timeLabel(time: string, impliedDate: ISODate | undefined, today: ISODate): string {
  const clock = formatTime(time);
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

/** "כל שבוע", or "כל שבוע · יום ג׳ 6/10" when the phrase also fixed the first date. */
export function recurrenceLabel(
  freq: RecurrenceFreq,
  firstDate: ISODate | undefined,
  today: ISODate
): string {
  const base = RECURRENCE_LABELS[freq];
  return firstDate === undefined ? base : `${base} · ${plainDay(firstDate, today)}`;
}
