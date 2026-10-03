// Snoozing ("דחייה", Blueprint §3 "Domain rule amendments"). Every adapter applies `snoozePatch`, so
// a snooze always has a visible effect: the plan moves, a soft due date moves with it, and a hard
// deadline that is still ahead stays put (the sheet only offers dates up to it).
// Snoozing never touches `recurrence`, so a series' anchor is immune to it (see recurrence.ts).

import { addDays, addMonths, nextWeekday } from './dates';
import { SNOOZE_LABELS } from '../i18n/format';
import type { ISODate, Millis, Task } from './types';

export type SnoozeKey = 'tomorrow' | 'weekend' | 'nextWeek' | 'month';

/** Keys in the order the snooze sheet shows them. */
const SNOOZE_KEYS: readonly SnoozeKey[] = ['tomorrow', 'weekend', 'nextWeek', 'month'];
const FRIDAY = 5;
const SUNDAY = 0;

/**
 * The quick snooze dates from `today`:
 *   tomorrow  מחר         today + 1
 *   weekend   סוף השבוע   the coming Friday; NEXT Friday when today is Friday or Saturday
 *   nextWeek  שבוע הבא    the next Sunday (from Saturday that is tomorrow, from Sunday a week ahead)
 *   month     בעוד חודש   today + 1 calendar month, clamped (Jan 31 -> Feb 28)
 * Two keys can share a date (on Thursday, tomorrow is Friday); the sheet still shows all four.
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
  /** Hebrew button label (מחר / סוף השבוע / שבוע הבא / בעוד חודש). */
  label: string;
  date: ISODate;
}

/** A hard deadline that has not been missed yet: snoozing must not go past it. */
const hardDeadlineAhead = (task: Pick<Task, 'dueDate' | 'hardDeadline'>, today: ISODate) =>
  task.hardDeadline && task.dueDate !== null && task.dueDate >= today;

/**
 * The snooze sheet's quick options, in display order. Under a hard deadline that is today or later,
 * options after `dueDate` are removed (a deadline today leaves none; a custom date picker should
 * likewise be capped at `dueDate`). A soft or already-missed deadline moves with the snooze, so it
 * does not limit the options.
 */
export function snoozeOptions(
  task: Pick<Task, 'dueDate' | 'hardDeadline'>,
  today: ISODate
): SnoozeOption[] {
  const targets = snoozeTargets(today);
  const cap = hardDeadlineAhead(task, today) ? task.dueDate : null;
  return SNOOZE_KEYS.filter((key) => cap === null || targets[key] <= cap).map((key) => ({
    key,
    label: SNOOZE_LABELS[key],
    date: targets[key]
  }));
}

/** The exact fields a snooze writes. `dueDate` is present only when it changes. */
export interface SnoozeFields {
  scheduledFor: ISODate;
  dueDate?: ISODate;
  snoozeCount: number;
  lastSnoozedAt: Millis;
}

/**
 * The field patch for snoozing `task` until `until` at instant `now` (binding rules):
 *  - always: scheduledFor = until, snoozeCount + 1, lastSnoozedAt = now
 *  - a dueDate that is soft (!hardDeadline), or hard but already missed (dueDate < today), moves
 *    to `until` as well
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
    snoozeCount: task.snoozeCount + 1,
    lastSnoozedAt: now
  };
  if (task.dueDate !== null && !hardDeadlineAhead(task, today)) patch.dueDate = until;
  return patch;
}
