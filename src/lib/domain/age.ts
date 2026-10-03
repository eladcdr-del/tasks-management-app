// How long a task has been open (Blueprint §3 "Domain rules"): the age badge and the "stuck" flag.
//
// Age is counted in CALENDAR days in Asia/Jerusalem (today's date minus the creation date), not in
// 24-hour blocks: a task made at 23:50 is "1 day old" ten minutes later, and DST days of 23 or 25
// hours cannot skew the count.

import { DEFAULT_TZ, diffDays, todayISO } from './dates';
import { pluralDays, pluralMonths, pluralWeeks, pluralYears } from '../i18n/format';
import type { Millis, Task } from './types';

/** Open this many days (or more) counts as stuck. */
export const STUCK_AGE_DAYS = 21;
/** Snoozed this many times (or more) counts as stuck. */
export const STUCK_SNOOZE_COUNT = 3;

/** Whole calendar days between creation and `now` (never negative). */
export function ageDays(createdAt: Millis, now: Millis | Date, tz: string = DEFAULT_TZ): number {
  return Math.max(0, diffDays(todayISO(now, tz), todayISO(createdAt, tz)));
}

/**
 * The Hebrew age badge text. Thresholds (days open):
 *   0-1     חדשה
 *   2-6     פתוחה יומיים / פתוחה 3 ימים ... 6 ימים
 *   7-29    whole weeks: פתוחה שבוע / שבועיים / 3 שבועות / 4 שבועות
 *   30-364  30-day months, capped at 11: פתוחה חודש / חודשיים / 3 חודשים ... 11 חודשים
 *   365+    whole years: פתוחה שנה / שנתיים / 3 שנים ...
 */
export function ageLabel(createdAt: Millis, now: Millis | Date, tz: string = DEFAULT_TZ): string {
  const days = ageDays(createdAt, now, tz);
  if (days < 2) return 'חדשה';
  if (days < 7) return `פתוחה ${pluralDays(days)}`;
  if (days < 30) return `פתוחה ${pluralWeeks(Math.floor(days / 7))}`;
  if (days < 365) return `פתוחה ${pluralMonths(Math.min(11, Math.floor(days / 30)))}`;
  return `פתוחה ${pluralYears(Math.floor(days / 365))}`;
}

/** An open task that has been sitting for 21+ days or has been snoozed 3+ times. Done tasks never are. */
export function isStuck(
  task: Pick<Task, 'status' | 'createdAt' | 'snoozeCount'>,
  now: Millis | Date,
  tz: string = DEFAULT_TZ
): boolean {
  return (
    task.status === 'open' &&
    (ageDays(task.createdAt, now, tz) >= STUCK_AGE_DAYS || task.snoozeCount >= STUCK_SNOOZE_COUNT)
  );
}
