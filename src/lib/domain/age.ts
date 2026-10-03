// How long a task has been open (Blueprint §3 "Domain rules" + 1.2 QA amendments): the age badge
// and the "stuck" flag.
//
// Age is counted in CALENDAR days in Asia/Jerusalem (today's date minus the start date), not in
// 24-hour blocks: a task made at 23:50 is "1 day old" ten minutes later, and DST days of 23 or 25
// hours cannot skew the count.
//
// The start date (ageStart) is the creation day for a one-off. A recurring instance is created the
// moment the previous one is completed, often weeks before it is due, so its age counts from
// max(creation day, its own date): next month's bill does not look "open for 3 weeks" before it is
// even due. The Hebrew copy lives in i18n/format (ageLabelText); this module holds no UI text.

import { DEFAULT_TZ, diffDays, isValidISO, minISO, todayISO } from './dates';
import { ageLabelText } from '../i18n/format';
import type { ISODate, Millis, Task } from './types';

/** Open this many days (or more) counts as stuck. */
export const STUCK_AGE_DAYS = 21;
/** Snoozed this many times (or more) counts as stuck. */
export const STUCK_SNOOZE_COUNT = 3;

type AgeFields = Pick<Task, 'createdAt' | 'seriesId' | 'dueDate' | 'scheduledFor'>;

/** Whole calendar days between `createdAt` and `now` in `tz` (never negative). */
export function ageDaysFrom(
  createdAt: Millis,
  now: Millis | Date,
  tz: string = DEFAULT_TZ
): number {
  return Math.max(0, diffDays(todayISO(now, tz), todayISO(createdAt, tz)));
}

/**
 * The day a task's age counts from: the creation day for a one-off, and for a recurring instance
 * (`seriesId != null`) the later of the creation day and the instance's own date
 * (`dueDate ?? scheduledFor`). A malformed own date is ignored.
 */
export function ageStart(task: AgeFields, tz: string = DEFAULT_TZ): ISODate {
  const created = todayISO(task.createdAt, tz);
  if (task.seriesId == null) return created;
  const own = task.dueDate ?? task.scheduledFor;
  return isValidISO(own) && own > created ? own : created;
}

/** Whole calendar days from ageStart to `now` (never negative: 0 while an instance's date is ahead). */
export function ageDays(task: AgeFields, now: Millis | Date, tz: string = DEFAULT_TZ): number {
  return Math.max(0, diffDays(todayISO(now, tz), ageStart(task, tz)));
}

/**
 * The age badge text for `task`: ageLabelText(ageStart(task), today). The copy and its scale (days,
 * weeks, calendar months, years) live in i18n/format (ageLabelText / elapsedText).
 */
export function ageLabel(task: AgeFields, now: Millis | Date, tz: string = DEFAULT_TZ): string {
  return ageLabelText(ageStart(task, tz), todayISO(now, tz));
}

/**
 * Stuck = an open task that is ACTIONABLE (its effective date, min(dueDate, scheduledFor), is null
 * or today or earlier) AND has been open 21+ days (from ageStart) or snoozed 3+ times. A task that
 * is planned or due in the future is waiting for its day, not stuck. Done tasks never are.
 */
export function isStuck(
  task: AgeFields & Pick<Task, 'status' | 'snoozeCount'>,
  now: Millis | Date,
  tz: string = DEFAULT_TZ
): boolean {
  if (task.status !== 'open') return false;
  const effective = minISO(task.dueDate, task.scheduledFor);
  if (effective !== null && effective > todayISO(now, tz)) return false;
  return ageDays(task, now, tz) >= STUCK_AGE_DAYS || task.snoozeCount >= STUCK_SNOOZE_COUNT;
}
