// Bucketing, attention/waiting grouping, ordering and counts for the Home screen
// (Blueprint §3 "Domain rules", §7 Home). Pure functions over open tasks and an ISODate `today`.
//
// Vocabulary
//   effective date  eff = min(dueDate, scheduledFor), ignoring nulls (null when the task has neither)
//   bucket          overdue | today | week | later, see bucketOf
//   attention       overdue OR priority 'urgent': the "needs a look right now" spotlight
//   waiting         nobody owns it yet (ownerId === null), see groupTasks

import { endOfWeek, minISO } from './dates';
import type { Bucket, ISODate, Priority, Task } from './types';

/** The fields of a Task that bucketing reads. */
type Dated = Pick<Task, 'dueDate' | 'scheduledFor'>;

export function effectiveDate(task: Dated): ISODate | null {
  return minISO(task.dueDate, task.scheduledFor);
}

/**
 * Which time bucket a task belongs in:
 *   dueDate < today                 -> overdue   (a missed *deadline*; a missed soft plan alone is not)
 *   eff <= today                    -> today     (a missed soft plan stays here, see plannedFromPast)
 *   eff <= Saturday of this week    -> week      (week = Sunday-Saturday; on a Saturday this is empty)
 *   otherwise, or no dates at all   -> later
 */
export function bucketOf(task: Dated, today: ISODate): Bucket {
  if (task.dueDate !== null && task.dueDate < today) return 'overdue';
  const eff = effectiveDate(task);
  if (eff === null) return 'later';
  if (eff <= today) return 'today';
  if (eff <= endOfWeek(today)) return 'week';
  return 'later';
}

/**
 * The bucket plus the "מתוכנן מאתמול" hint flag: true when the task sits in `today` only because its
 * soft plan (scheduledFor) was missed. Overdue tasks never carry it (they already shout louder).
 */
export function bucketInfo(
  task: Dated,
  today: ISODate
): { bucket: Bucket; plannedFromPast: boolean } {
  const bucket = bucketOf(task, today);
  return {
    bucket,
    plannedFromPast: bucket === 'today' && task.scheduledFor !== null && task.scheduledFor < today
  };
}

/** Overdue OR urgent. */
export function needsAttention(task: Dated & Pick<Task, 'priority'>, today: ISODate): boolean {
  return task.priority === 'urgent' || bucketOf(task, today) === 'overdue';
}

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, normal: 2 };

/**
 * Display order used by every list: priority (urgent > high > normal), then effective date ascending
 * with undated tasks last, then createdAt ascending (oldest first). Stable, and returns a new array.
 */
export function sortTasks<T extends Dated & Pick<Task, 'priority' | 'createdAt'>>(
  tasks: readonly T[]
): T[] {
  return [...tasks].sort((a, b) => {
    const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (byPriority !== 0) return byPriority;
    const ea = effectiveDate(a);
    const eb = effectiveDate(b);
    if (ea !== eb) {
      if (ea === null) return 1;
      if (eb === null) return -1;
      return ea < eb ? -1 : 1;
    }
    return a.createdAt - b.createdAt;
  });
}

export interface GroupedTasks {
  /** Overdue or urgent, owned or not. */
  attention: Task[];
  /** Unowned tasks that are not already in `attention`. */
  waiting: Task[];
  today: Task[];
  week: Task[];
  later: Task[];
}

/**
 * Splits open tasks into the Home screen's sections, each sorted with `sortTasks`.
 *
 * THE RULE (chosen for the "clear picture in one second"):
 *  1. `attention` is a spotlight that REMOVES tasks from everything else. A task that is overdue or
 *     urgent is shown there once and nowhere below, so the same alarming card never appears twice
 *     and attention + today + week + later always add up to every open task.
 *  2. `waiting` is a call-out for "someone please take this", limited to tasks that are NOT already
 *     in attention. So a task is in at most one of attention / waiting (an unowned overdue task is
 *     attention; the take / request buttons live on its card there).
 *  3. `waiting` does NOT remove a task from its time bucket. today / week / later answer "what is on
 *     when?" for everyone, and an unowned task due today must not vanish from today (otherwise the
 *     empty state would say "הכל סגור להיום" while work is waiting). Unowned cards show the dashed
 *     "?" avatar there. The Pulse numerals follow the lists, see pulseCounts.
 */
export function groupTasks(openTasks: readonly Task[], today: ISODate): GroupedTasks {
  const attention: Task[] = [];
  const waiting: Task[] = [];
  const today_: Task[] = [];
  const week: Task[] = [];
  const later: Task[] = [];

  for (const t of openTasks) {
    const bucket = bucketOf(t, today);
    if (bucket === 'overdue' || t.priority === 'urgent') {
      attention.push(t);
      continue;
    }
    if (t.ownerId === null) waiting.push(t);
    if (bucket === 'today') today_.push(t);
    else if (bucket === 'week') week.push(t);
    else later.push(t);
  }

  return {
    attention: sortTasks(attention),
    waiting: sortTasks(waiting),
    today: sortTasks(today_),
    week: sortTasks(week),
    later: sortTasks(later)
  };
}

/** The three Pulse-card numerals: באיחור/דחוף, להיום, מחכות שמישהו ייקח. */
export function pulseCounts(
  openTasks: readonly Task[],
  today: ISODate
): { attention: number; today: number; waiting: number } {
  const g = groupTasks(openTasks, today);
  return { attention: g.attention.length, today: g.today.length, waiting: g.waiting.length };
}

/** Open tasks per member (every id in `memberIds` is present, 0 when idle). Unowned tasks are not counted. */
export function openCountsByMember(
  openTasks: readonly Pick<Task, 'ownerId'>[],
  memberIds: readonly string[]
): Record<string, number> {
  const counts = new Map(memberIds.map((id) => [id, 0]));
  for (const { ownerId } of openTasks) {
    if (ownerId === null) continue;
    const n = counts.get(ownerId);
    if (n !== undefined) counts.set(ownerId, n + 1);
  }
  return Object.fromEntries(counts);
}
