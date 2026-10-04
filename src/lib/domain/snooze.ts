// Snoozing ("דחייה", Blueprint §3 "Domain rule amendments" + Phase 1 council amendments). Every
// adapter applies `snoozePatch`, so a snooze always has a visible effect: the plan moves to a day, a
// soft due date moves with it, a missed hard deadline becomes a soft moved date, and a hard deadline
// that is still ahead stays put (the sheet only offers dates up to it, see snoozeMaxDate).
// Snoozing never touches `recurrence`, so a series' anchor is immune to it (see recurrence.ts).
// This module returns keys and dates only; the Hebrew labels live in i18n/format (SNOOZE_LABELS).

import { addDays, addMonths, nextWeekday } from './dates';
import type { ISODate, Millis, Task } from './types';

export type SnoozeKey = 'tomorrow' | 'weekend' | 'nextWeek' | 'month';

/** Keys in priority order: when two share a date, the earlier one is kept (see snoozeOptions). */
const SNOOZE_KEYS: readonly SnoozeKey[] = ['tomorrow', 'weekend', 'nextWeek', 'month'];
const FRIDAY = 5;
const SUNDAY = 0;

/**
 * The quick snooze dates from `today`:
 *   tomorrow  מחר         today + 1
 *   weekend   סוף השבוע   the coming Friday; NEXT Friday when today is Friday or Saturday
 *   nextWeek  שבוע הבא    the next Sunday (from Saturday that is tomorrow, from Sunday a week ahead)
 *   month     בעוד חודש   today + 1 calendar month, clamped (Jan 31 -> Feb 28)
 * Two keys can share a date (on Thursday, tomorrow is Friday); snoozeOptions removes the duplicate.
 */
export function snoozeTargets(today: ISODate): Record<SnoozeKey, ISODate> {
  return {
    tomorrow: addDays(today, 1),
    weekend: nextWeekday(today, FRIDAY), // strictly after today, so Fri -> +7 and Sat -> +6
    nextWeek: nextWeekday(today, SUNDAY),
    month: addMonths(today, 1)
  };
}

export interface SnoozeOption {
  key: SnoozeKey;
  date: ISODate;
}

type DeadlineFields = Pick<Task, 'dueDate' | 'hardDeadline'>;

/**
 * The latest date a snooze may go to: the hard deadline when it is today or later (it does not move,
 * so snoozing past it would hide the task beyond its last day). null when there is no cap: no hard
 * deadline, or one that was already missed (snoozing then turns it into a soft moved date). A custom
 * date picker in the snooze sheet uses this as its max.
 */
export function snoozeMaxDate(task: DeadlineFields, today: ISODate): ISODate | null {
  return task.hardDeadline && task.dueDate !== null && task.dueDate >= today ? task.dueDate : null;
}

/** Why the task cannot be snoozed at all, as a key the UI turns into copy; null when it can. */
export type SnoozeBlockedReason = 'deadline-today';

/**
 * 'deadline-today' when the task has a hard deadline today: there is no later day left to snooze to
 * (snoozeOptions is then empty, and the sheet explains instead of showing nothing). Otherwise null.
 */
export function snoozeBlockedReason(
  task: DeadlineFields,
  today: ISODate
): SnoozeBlockedReason | null {
  return snoozeMaxDate(task, today) === today ? 'deadline-today' : null;
}

/**
 * The snooze sheet's quick options, sorted by date (ascending), each date offered once: when two keys
 * share a date the earlier key in מחר > סוף השבוע > שבוע הבא > בעוד חודש is kept (on Thursday
 * "מחר" is the Friday, so "סוף השבוע" is dropped; on Friday "שבוע הבא" sorts before "סוף השבוע").
 * Options after snoozeMaxDate are removed, so a hard deadline today leaves none (see
 * snoozeBlockedReason). A soft or already-missed deadline moves with the snooze and does not limit
 * the options. The labels come from i18n/format (SNOOZE_LABELS, labeledSnoozeOptions).
 */
export function snoozeOptions(task: DeadlineFields, today: ISODate): SnoozeOption[] {
  const targets = snoozeTargets(today);
  const cap = snoozeMaxDate(task, today);
  const seen = new Set<ISODate>();
  const options: SnoozeOption[] = [];
  for (const key of SNOOZE_KEYS) {
    const date = targets[key];
    if (seen.has(date) || (cap !== null && date > cap)) continue;
    seen.add(date);
    options.push({ key, date });
  }
  return options.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** The exact fields a snooze writes. `dueDate` and `hardDeadline` are present only when they change. */
export interface SnoozeFields {
  scheduledFor: ISODate;
  /** Always false: a snooze target is a day, never a week (Task.weekPlan). */
  weekPlan: false;
  dueDate?: ISODate;
  /** Only for a missed hard deadline, which becomes a soft date as it moves. */
  hardDeadline?: false;
  snoozeCount: number;
  lastSnoozedAt: Millis;
}

/**
 * The field patch for snoozing `task` until `until` at instant `now` (binding rules):
 *  - always: scheduledFor = until, weekPlan = false, snoozeCount + 1, lastSnoozedAt = now
 *  - a soft dueDate (!hardDeadline) moves to `until` as well
 *  - a MISSED hard deadline (dueDate < today) moves to `until` AND becomes soft (hardDeadline =
 *    false): the old last day is gone, and a lock-clock on the new date would be a fake deadline
 *  - a hard deadline today or later stays (no `dueDate` key); the UI caps `until` at it
 * Pure: returns a new object and leaves `task` (including its recurrence anchor) untouched.
 */
export function snoozePatch(
  task: Pick<Task, 'dueDate' | 'hardDeadline' | 'snoozeCount'>,
  until: ISODate,
  now: Millis,
  today: ISODate
): SnoozeFields {
  const patch: SnoozeFields = {
    scheduledFor: until,
    weekPlan: false,
    snoozeCount: task.snoozeCount + 1,
    lastSnoozedAt: now
  };
  if (task.dueDate !== null && snoozeMaxDate(task, today) === null) {
    patch.dueDate = until;
    if (task.hardDeadline) patch.hardDeadline = false;
  }
  return patch;
}
