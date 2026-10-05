// Bucketing, attention/waiting grouping, ordering and counts for the Home screen
// (Blueprint §3 "Domain rules" + 1.2 QA amendments, §7 Home). Pure functions over open tasks and an
// ISODate `today`. Bucketing is DATE-ONLY: a task due today at 09:00 stays in "today" all day (the
// time-aware chip lives in i18n/format whenChip).
//
// Vocabulary
//   effective date  eff = min(dueDate, scheduledFor), ignoring nulls (null when the task has neither)
//   week horizon    the last day of "this week": Saturday, or NEXT Saturday on Friday and Saturday
//   bucket          overdue | today | week | later, see bucketOf
//   attention       overdue, OR urgent and not planned for a later day, OR a hard deadline today or
//                   tomorrow (see needsAttention), OR an urgent request to the viewer (urgentRequestFor)
//   requested       someone else asked the viewer to do it, see isRequestFor / groupTasks
//   waiting         nobody (or a former member) owns it, see groupTasks

import { addDays, endOfWeek, minISO, weekday } from './dates';
import type { Bucket, ISODate, Priority, Task } from './types';

/** The fields of a Task that bucketing reads. */
type Dated = Pick<Task, 'dueDate' | 'scheduledFor'>;

export function effectiveDate(task: Dated): ISODate | null {
  return minISO(task.dueDate, task.scheduledFor);
}

const FRIDAY = 5;

/**
 * The last day of the "week" bucket: the Saturday of this week (weeks run Sunday-Saturday), but on
 * Friday and Saturday the NEXT Saturday, because Israeli families plan the coming week on the
 * weekend (otherwise the week tab would be empty on Saturday and tomorrow would read as "later").
 */
export function weekHorizon(today: ISODate): ISODate {
  const saturday = endOfWeek(today);
  return weekday(today) >= FRIDAY ? addDays(saturday, 7) : saturday;
}

/**
 * Which time bucket a task belongs in:
 *   dueDate < today                 -> overdue   (a missed *deadline*; a missed soft plan alone is not)
 *   eff <= today                    -> today     (a missed soft plan stays here, see plannedFromPast)
 *   eff <= weekHorizon(today)       -> week
 *   otherwise, or no dates at all   -> later
 */
export function bucketOf(task: Dated, today: ISODate): Bucket {
  if (task.dueDate !== null && task.dueDate < today) return 'overdue';
  const eff = effectiveDate(task);
  if (eff === null) return 'later';
  if (eff <= today) return 'today';
  if (eff <= weekHorizon(today)) return 'week';
  return 'later';
}

/**
 * The bucket plus the "planned from the past" hint flag: true when the task sits in `today` only
 * because its soft plan (scheduledFor) was missed. Overdue tasks never carry it (they already shout
 * louder). The hint's copy is planHint in i18n/format ("תוכננה לאתמול", "תוכננה לשבוע שעבר").
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

/**
 * A task needs attention when it is:
 *  - overdue (dueDate < today), or
 *  - urgent AND (no plan, or planned for today or earlier): snoozing an urgent task (which sets
 *    scheduledFor, see snooze.ts) therefore takes it out of attention until its new date, or
 *  - a hard deadline on its last day or the day before (dueDate <= today + 1), whatever its plan:
 *    a snooze cannot move a hard deadline that is still ahead, so it keeps shouting.
 */
export function needsAttention(
  task: Dated & Pick<Task, 'priority' | 'hardDeadline'>,
  today: ISODate
): boolean {
  if (bucketOf(task, today) === 'overdue') return true;
  if (task.hardDeadline && task.dueDate !== null && task.dueDate <= addDays(today, 1)) return true;
  return task.priority === 'urgent' && (task.scheduledFor === null || task.scheduledFor <= today);
}

/**
 * Someone else asked `me` to do it: `me` owns it and another uid requested it. Never true while the
 * viewer is unknown (`me` null).
 */
export function isRequestFor(
  task: Pick<Task, 'ownerId' | 'requestedBy'>,
  me: string | null
): boolean {
  return me !== null && task.ownerId === me && task.requestedBy !== null && task.requestedBy !== me;
}

/**
 * An urgent request to `me` needs attention whatever its plan: "לתקן את הברז מחר דחוף" from the
 * partner must not read as "0 urgent". Once it is snoozed after the request, needsAttention's own
 * rule takes over (out of attention until its new date), so a snooze still quiets it.
 */
export function urgentRequestFor(
  task: Pick<Task, 'ownerId' | 'requestedBy' | 'requestedAt' | 'priority' | 'lastSnoozedAt'>,
  me: string | null
): boolean {
  if (task.priority !== 'urgent' || !isRequestFor(task, me)) return false;
  const snoozedSince =
    task.lastSnoozedAt !== null &&
    (task.requestedAt === null || task.lastSnoozedAt >= task.requestedAt);
  return !snoozedSince;
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
  /**
   * needsAttention: overdue, urgent and not planned for later, or a hard deadline today/tomorrow;
   * plus an urgent request to the viewer (urgentRequestFor).
   */
  attention: Task[];
  /** Asked of the viewer by someone else ("ביקשו ממך"), not already in `attention`. */
  requested: Task[];
  /** Unowned tasks (or a former member's) that are not already in `attention`. */
  waiting: Task[];
  today: Task[];
  week: Task[];
  later: Task[];
}

/**
 * The household's current member uids, REQUIRED so no caller forgets former members. `undefined`
 * means "not known yet" (the household document is still loading): owners are then trusted as-is.
 */
export type MemberIds = readonly string[] | undefined;

/**
 * Splits open tasks into the Home screen's sections, each sorted with `sortTasks`.
 *
 * THE RULE (chosen for the "clear picture in one second"):
 *  1. `attention` is a spotlight that REMOVES tasks from everything else: an attention task is shown
 *     there once and in no other list, so attention + today + week + later is every open task
 *     exactly once.
 *  2. `waiting` ("someone please take this") holds the unowned tasks that are NOT in attention, so a
 *     task is in at most one of attention / waiting (an unowned overdue task is attention; the take /
 *     request buttons live on its card there).
 *  3. `waiting` does NOT remove a task from its time bucket: an unowned task due today appears in
 *     BOTH waiting and today (today / week / later answer "what is on when?", and the today list must
 *     not look done while work is waiting). The overlap is deliberate; the Home screen (3.2)
 *     de-emphasises unowned cards in the time lists. pulseCounts follows the lists, so its today and
 *     waiting numbers can count the same task.
 *  4. `requested` ("ביקשו ממך": someone else asked the viewer `me`) works like `waiting`: shown
 *     whatever the date tab, and still in its time bucket (a request due today counts for today).
 *     Requests usually have no date, so they would otherwise sit unseen under "later". An urgent
 *     request is attention instead (urgentRequestFor), until it is snoozed.
 *
 * Defensive: tasks whose status is not 'open' are ignored. A task owned by someone who is not in
 * `memberIds` (a member who left the household) is treated as unowned; with `memberIds` undefined
 * (not loaded yet) every owner is trusted. With `me` null (viewer unknown) nothing is a request.
 */
export function groupTasks(
  openTasks: readonly Task[],
  today: ISODate,
  memberIds: MemberIds,
  me: string | null = null
): GroupedTasks {
  const members = memberIds === undefined ? null : new Set(memberIds);
  const attention: Task[] = [];
  const requested: Task[] = [];
  const waiting: Task[] = [];
  const today_: Task[] = [];
  const week: Task[] = [];
  const later: Task[] = [];

  for (const t of openTasks) {
    if (t.status !== 'open') continue;
    if (needsAttention(t, today) || urgentRequestFor(t, me)) {
      attention.push(t);
      continue;
    }
    if (isRequestFor(t, me)) requested.push(t);
    else if (t.ownerId === null || (members !== null && !members.has(t.ownerId))) waiting.push(t);
    const bucket = bucketOf(t, today);
    if (bucket === 'today') today_.push(t);
    else if (bucket === 'week') week.push(t);
    else later.push(t);
  }

  return {
    attention: sortTasks(attention),
    requested: sortTasks(requested),
    waiting: sortTasks(waiting),
    today: sortTasks(today_),
    week: sortTasks(week),
    later: sortTasks(later)
  };
}

/**
 * The three Pulse-card numerals (באיחור/דחוף, להיום, מחכות שמישהו ייקח) and its "ביקשו ממך" row,
 * counted exactly as groupTasks lists them (same `memberIds` / `me` handling; non-open tasks
 * ignored).
 */
export function pulseCounts(
  openTasks: readonly Task[],
  today: ISODate,
  memberIds: MemberIds,
  me: string | null = null
): { attention: number; today: number; waiting: number; requested: number } {
  const g = groupTasks(openTasks, today, memberIds, me);
  return {
    attention: g.attention.length,
    today: g.today.length,
    waiting: g.waiting.length,
    requested: g.requested.length
  };
}

/**
 * Open tasks per member (every id in `memberIds` is present, 0 when idle). Unowned tasks, owners who
 * are not in `memberIds`, and tasks whose status is not 'open' are not counted.
 */
export function openCountsByMember(
  openTasks: readonly Pick<Task, 'ownerId' | 'status'>[],
  memberIds: readonly string[]
): Record<string, number> {
  const counts = new Map(memberIds.map((id) => [id, 0]));
  for (const { ownerId, status } of openTasks) {
    if (ownerId === null || status !== 'open') continue;
    const n = counts.get(ownerId);
    if (n !== undefined) counts.set(ownerId, n + 1);
  }
  return Object.fromEntries(counts);
}
