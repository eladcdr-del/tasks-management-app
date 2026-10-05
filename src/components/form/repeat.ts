// The "חוזרת" picker's logic as pure helpers (RecurrencePicker: QuickAdd and TaskDetail): the
// presets (לא חוזרת / כל יום / כל שבוע / כל חודש / כל שנה), the custom row "כל [N] [unit]" and the
// weekday toggles of a weekly rule. Rules are canonical (domain/recurrence ruleOf) and
// never carry an anchor: the adapters keep or re-derive it.

import { intervalOf, MAX_INTERVAL, ruleOf, weekdaysOf } from '$lib/domain/recurrence';
import type { RecurrenceRule } from '$lib/domain/recurrence';
import { isValidISO, weekday } from '$lib/domain/dates';
import type { ISODate, RecurrenceFreq } from '$lib/domain/types';

export type RepeatPreset = 'none' | RecurrenceFreq;

/** The one-tap options, in order. */
export const PRESETS: readonly RepeatPreset[] = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
/** The units of the custom row, in order. */
export const UNITS: readonly RecurrenceFreq[] = ['daily', 'weekly', 'monthly', 'yearly'];

/** The rule a preset stands for (null = does not repeat). */
export function presetRule(p: RepeatPreset): RecurrenceRule | null {
  return p === 'none' ? null : { freq: p };
}

/**
 * Which preset a rule shows as: none, or its frequency when it repeats every single period (a weekly
 * rule with listed days is still "כל שבוע": its days show below it). Every N > 1 is 'custom'.
 */
export function presetOf(rule: RecurrenceRule | null): RepeatPreset | 'custom' {
  if (rule === null) return 'none';
  return intervalOf(rule) > 1 ? 'custom' : rule.freq;
}

/** The weekday a weekly rule without listed days repeats on: the task's own date's (a day plan). */
export function impliedWeekday(date: ISODate | null | undefined): number | null {
  return date && isValidISO(date) ? weekday(date) : null;
}

/** The days the weekday toggles show as on: the listed ones, else the implied one (if any). */
export function shownDays(rule: RecurrenceRule | null, date?: ISODate | null): number[] {
  if (rule === null || rule.freq !== 'weekly') return [];
  const listed = weekdaysOf(rule);
  if (listed) return listed;
  const implied = impliedWeekday(date);
  return implied === null ? [] : [implied];
}

/**
 * The weekly rule with `day` toggled, starting from the days shown (so the implied day of a plain
 * rule stays on when another is added). Turning the last day off leaves no listed days: the series
 * then keeps the date's weekday, as a plain weekly rule always did.
 */
export function toggleDay(
  rule: RecurrenceRule | null,
  day: number,
  date?: ISODate | null
): RecurrenceRule {
  const current = shownDays(rule, date);
  const days = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
  const interval = rule && rule.freq === 'weekly' ? intervalOf(rule) : 1;
  return ruleOf({
    freq: 'weekly',
    ...(interval > 1 ? { interval } : {}),
    ...(days.length > 0 ? { weekdays: days } : {})
  });
}

/** Every `n` (clamped to 1..99) of the rule's unit; listed days are kept. */
export function withInterval(rule: RecurrenceRule, n: number): RecurrenceRule {
  const interval = Math.min(MAX_INTERVAL, Math.max(1, Math.round(n)));
  return ruleOf({ ...rule, interval });
}

/** The same interval in another unit; listed days survive only a weekly rule. */
export function withUnit(rule: RecurrenceRule, freq: RecurrenceFreq): RecurrenceRule {
  return ruleOf({ ...rule, freq });
}

/**
 * The rule the custom row starts from: the current one in its unit (or weekly when there is none),
 * every 2 when it repeated every single period, so the choice is visibly different from a preset.
 */
export function customStart(rule: RecurrenceRule | null): RecurrenceRule {
  const base = rule ?? { freq: 'weekly' as const };
  return withInterval(base, Math.max(2, intervalOf(base)));
}
