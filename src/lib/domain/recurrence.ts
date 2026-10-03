// Recurring tasks (Blueprint §3 "Domain rules" + the 1.2 QA anchor amendment). Completing a
// recurring task creates the next instance; its id is deterministic (`${seriesId}__${nextDate}`) so
// a retried or double-fired completion writes the same document instead of a duplicate.
//
// THE ANCHOR. `recurrence.anchor` is the series' base date. It is set on create when the task has a
// date (ensureAnchor), otherwise at the first completion (buildNextInstance), and every instance
// carries it unchanged. Each next date is computed from the anchor, base + k periods, never from the
// previous (possibly clamped, snoozed or edited) instance date. So a series on the 31st returns to
// the 31st every month that has one, a Feb 29 series returns to Feb 29 in leap years, and a snooze
// (which moves the instance date, see snooze.ts) does not shift the series.

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

/** The instance's own date: its due date, else its soft plan, else null. */
const instanceDate = (task: Recurring): ISODate | null => task.dueDate ?? task.scheduledFor;

/**
 * The recurrence to store on create or after an edit, with the anchor filled in when it can be:
 *  - an existing anchor is kept;
 *  - otherwise a dated task is anchored at its own date (`dueDate ?? scheduledFor`);
 *  - an undated task stays unanchored: by the binding rule its anchor is set at its first
 *    completion, so the series follows the day the work was actually done.
 * Adapters call this on create. When an edit changes the date or the frequency (a deliberate
 * re-plan, unlike a snooze), they drop the old anchor first (`{ freq }`) and call it again.
 * Returns a new object, or null for a task that does not recur.
 */
export function ensureAnchor(task: Recurring): Task['recurrence'] {
  if (task.recurrence === null) return null;
  const anchor = task.recurrence.anchor ?? instanceDate(task);
  return anchor === null ? { freq: task.recurrence.freq } : { freq: task.recurrence.freq, anchor };
}

/** The anchor the series uses: the stored one, else the instance date, else the completion date. */
const seriesAnchor = (task: Recurring, completionISO: ISODate): ISODate =>
  task.recurrence?.anchor ?? instanceDate(task) ?? completionISO;

/**
 * The date of the next instance: the first `anchor + k periods` (k >= 1, each computed from the
 * anchor) that is strictly after max(the instance's own date, the completion date).
 *  - completed early: the next date is still after the instance date (no double instance);
 *  - completed late: missed dates are skipped, but the series keeps its day;
 *  - an instance snoozed or edited off the series is skipped back onto it.
 * anchor = recurrence.anchor ?? (dueDate ?? scheduledFor) ?? completionISO.
 * `null` when the task does not recur.
 */
export function nextOccurrence(task: Recurring, completionISO: ISODate): ISODate | null {
  if (task.recurrence === null) return null;
  const { freq } = task.recurrence;
  const anchor = seriesAnchor(task, completionISO);
  const own = instanceDate(task);
  const floor = own !== null && own > completionISO ? own : completionISO;
  let steps = 1;
  let next = advance(anchor, freq, steps);
  while (next <= floor) next = advance(anchor, freq, ++steps);
  return next;
}

/** Deterministic id of the next instance in a series. */
export function nextTaskId(seriesId: string, nextISO: ISODate): string {
  return `${seriesId}__${nextISO}`;
}

/**
 * The next instance of a recurring task, as a complete open Task, or `null` if it does not recur.
 *  - copies title, notes, category, owner, hardDeadline and dueTime
 *  - priority is copied, except 'urgent', which becomes 'normal' (an emergency does not recur)
 *  - recurrence = { freq, anchor } with the series anchor (see nextOccurrence); the first
 *    completion of an unanchored series anchors it here
 *  - seriesId = task.seriesId ?? task.id (the first instance starts the series)
 *  - exactly one date is set: dueDate if the source had a dueDate (a soft plan alongside it is
 *    dropped, because one date drives the series), otherwise scheduledFor
 *  - snooze counters, request, and completion fields are reset; authorship and timestamps are the
 *    actor's and `now`
 */
export function buildNextInstance(
  task: Task,
  completionISO: ISODate,
  now: Date | Millis,
  actorUid: string
): Task | null {
  const next = nextOccurrence(task, completionISO);
  if (next === null || task.recurrence === null) return null;
  const nowMillis = typeof now === 'number' ? now : now.getTime();
  const seriesId = task.seriesId ?? task.id;
  const hasDue = task.dueDate !== null;
  return {
    id: nextTaskId(seriesId, next),
    title: task.title,
    notes: task.notes,
    categoryId: task.categoryId,
    priority: task.priority === 'urgent' ? 'normal' : task.priority,
    ownerId: task.ownerId,
    requestedBy: null,
    requestedAt: null,
    createdBy: actorUid,
    createdAt: nowMillis,
    updatedBy: actorUid,
    updatedAt: nowMillis,
    scheduledFor: hasDue ? null : next,
    weekPlan: hasDue ? false : task.weekPlan,
    dueDate: hasDue ? next : null,
    dueTime: task.dueTime,
    hardDeadline: task.hardDeadline,
    recurrence: { freq: task.recurrence.freq, anchor: seriesAnchor(task, completionISO) },
    seriesId,
    status: 'open',
    snoozeCount: 0,
    lastSnoozedAt: null,
    completedAt: null,
    completedBy: null,
    completion: null
  };
}
