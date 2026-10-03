// Recurring tasks (Blueprint §3 "Domain rules"). Completing a recurring task creates the next
// instance; its id is deterministic (`${seriesId}__${nextDate}`) so a retried or double-fired
// completion writes the same document instead of a duplicate.

import { addDays, addMonths, addYears } from './dates';
import type { ISODate, Millis, RecurrenceFreq, Task } from './types';

type Recurring = Pick<Task, 'dueDate' | 'scheduledFor' | 'recurrence'>;

/** `base` moved forward by `steps` whole periods. Always measured from `base`, never from a clamped result. */
function advance(base: ISODate, freq: RecurrenceFreq, steps: number): ISODate {
  switch (freq) {
    case 'weekly':
      return addDays(base, 7 * steps);
    case 'monthly':
      return addMonths(base, steps);
    case 'yearly':
      return addYears(base, steps);
  }
}

/**
 * The date of the next instance: `dueDate ?? scheduledFor ?? completionISO` plus one period.
 * If that is still not after `completionISO` (finished very late), it rolls forward period by
 * period until it is. Rolling is measured from the ORIGINAL date (base + k periods), so a 31st-of-
 * the-month task skips Feb 28 / Apr 30 and lands back on the 31st instead of drifting to the 28th,
 * and a Feb 29 task returns to Feb 29 in the next leap year.
 * `null` when the task does not recur.
 */
export function nextOccurrence(task: Recurring, completionISO: ISODate): ISODate | null {
  if (task.recurrence === null) return null;
  const { freq } = task.recurrence;
  const base = task.dueDate ?? task.scheduledFor ?? completionISO;
  let steps = 1;
  let next = advance(base, freq, steps);
  while (next <= completionISO) next = advance(base, freq, ++steps);
  return next;
}

/** Deterministic id of the next instance in a series. */
export function nextTaskId(seriesId: string, nextISO: ISODate): string {
  return `${seriesId}__${nextISO}`;
}

/**
 * The next instance of a recurring task, as a complete open Task, or `null` if it does not recur.
 *  - copies title, notes, category, priority, owner, hardDeadline, dueTime and recurrence
 *  - seriesId = task.seriesId ?? task.id (the first instance starts the series)
 *  - exactly one date is set: dueDate if the source had a dueDate (a soft plan alongside it is
 *    dropped, because one date drives the series), otherwise scheduledFor
 *  - snooze counters, request, and completion fields are reset; authorship and timestamps are the
 *    actor's and `nowMillis`
 */
export function buildNextInstance(
  task: Task,
  completionISO: ISODate,
  nowMillis: Millis,
  actorUid: string
): Task | null {
  const next = nextOccurrence(task, completionISO);
  if (next === null || task.recurrence === null) return null;
  const seriesId = task.seriesId ?? task.id;
  const hasDue = task.dueDate !== null;
  return {
    id: nextTaskId(seriesId, next),
    title: task.title,
    notes: task.notes,
    categoryId: task.categoryId,
    priority: task.priority,
    ownerId: task.ownerId,
    requestedBy: null,
    requestedAt: null,
    createdBy: actorUid,
    createdAt: nowMillis,
    updatedBy: actorUid,
    updatedAt: nowMillis,
    scheduledFor: hasDue ? null : next,
    dueDate: hasDue ? next : null,
    dueTime: task.dueTime,
    hardDeadline: task.hardDeadline,
    recurrence: { freq: task.recurrence.freq },
    seriesId,
    status: 'open',
    snoozeCount: 0,
    lastSnoozedAt: null,
    completedAt: null,
    completedBy: null,
    completion: null
  };
}
