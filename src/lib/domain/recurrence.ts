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
//
// THE RULE. `freq` daily | weekly | monthly | yearly, every `interval` periods (1..99, missing = 1).
// A weekly rule may list `weekdays` (0 = Sunday … 6 = Saturday, sorted, unique; missing = the
// anchor's weekday, i.e. one day a week as before). With weekdays, the series runs on the listed days
// of every `interval`-th week, counted from the anchor's (Sunday-based) week: "every 2 weeks on
// Sunday and Wednesday" is Sun+Wed of the anchor's week, then Sun+Wed two weeks later, and so on.
// Stored canonically (normalizeRecurrence): `interval` only when it is not 1, `weekdays` only on a
// weekly rule that lists days. So a plain "every week" is still exactly `{ freq: 'weekly', anchor }`,
// the shape an older client reads and writes.
//
// THE NEXT DATE is the first series date strictly after max(the instance's own date, the completion
// date) and after the anchor. One completion creates exactly one next instance: a late completion
// skips the missed dates (no burst of overdue copies), an early one still moves past the instance's
// own date, and a snoozed instance does not move the series.

import { addDays, addMonths, diffDays, isValidISO, parseISO, startOfWeek } from './dates';
import type { ISODate, Millis, Recurrence, RecurrenceFreq, Task } from './types';

type Recurring = Pick<Task, 'dueDate' | 'scheduledFor' | 'recurrence'>;

/** A recurrence without its anchor: what the parser and the pickers choose. */
export type RecurrenceRule = Omit<Recurrence, 'anchor'>;

export const RECURRENCE_FREQS: readonly RecurrenceFreq[] = ['daily', 'weekly', 'monthly', 'yearly'];
/** The largest `interval` ("every 99 weeks"); the rules enforce the same bound. */
export const MAX_INTERVAL = 99;

const isFreq = (v: unknown): v is RecurrenceFreq =>
  typeof v === 'string' && (RECURRENCE_FREQS as readonly string[]).includes(v);
const isWholeIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Every N periods: the stored interval when it is a whole number 1..99, else 1. */
export function intervalOf(r: Pick<Recurrence, 'interval'>): number {
  return isWholeIn(r.interval, 1, MAX_INTERVAL) ? r.interval : 1;
}

/**
 * The weekdays a weekly rule lists (sorted, unique, each 0..6), or null when it lists none (then the
 * series keeps the anchor's weekday) or is not weekly. Out-of-range entries are ignored.
 */
export function weekdaysOf(r: Pick<Recurrence, 'freq' | 'weekdays'>): number[] | null {
  if (r.freq !== 'weekly' || !Array.isArray(r.weekdays)) return null;
  const days = [...new Set(r.weekdays.filter((d) => isWholeIn(d, 0, 6)))].sort((a, b) => a - b);
  return days.length > 0 ? days : null;
}

/**
 * The canonical stored form of a recurrence (a new object): `interval` only when it is not 1,
 * `weekdays` sorted and unique and only on a weekly rule that lists at least one day, `anchor` as
 * given. Values that are not merely redundant (interval 0, weekday 9) are kept as they are, so that
 * validation (recurrenceProblem, the rules) rejects them instead of silently "fixing" them.
 */
export function normalizeRecurrence<R extends RecurrenceRule>(r: R): R {
  const out: Recurrence = { freq: r.freq };
  if (r.interval !== undefined && r.interval !== 1) out.interval = r.interval;
  if (r.freq === 'weekly' && Array.isArray(r.weekdays) && r.weekdays.length > 0) {
    out.weekdays = [...new Set(r.weekdays)].sort((a, b) => a - b);
  }
  const anchor = (r as Recurrence).anchor;
  if (anchor !== undefined) out.anchor = anchor;
  return out as R;
}

/** The rule alone, canonical and without the anchor (a new object). */
export function ruleOf(r: RecurrenceRule): RecurrenceRule {
  const { anchor: _anchor, ...rule } = normalizeRecurrence(r as Recurrence);
  return rule;
}

/** True when both describe the same repetition (frequency, interval and days), anchors aside. */
export function sameRule(a: RecurrenceRule | null, b: RecurrenceRule | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.freq === b.freq &&
    intervalOf(a) === intervalOf(b) &&
    String(weekdaysOf(a)) === String(weekdaysOf(b))
  );
}

/**
 * Why `r` is not a storable recurrence (the client mirror of isRecurrence in firestore.rules), or
 * null when it is fine: freq is one of the four, interval (if any) a whole number 1..99, weekdays
 * (if any, weekly only) 1-7 strictly ascending whole numbers 0..6, anchor (if any) a real date.
 */
export function recurrenceProblem(r: unknown): string | null {
  if (r === null || typeof r !== 'object' || Array.isArray(r))
    return 'recurrence must be an object';
  const rec = r as Record<string, unknown>;
  if (!isFreq(rec.freq)) return 'unknown recurrence';
  if (rec.interval !== undefined && !isWholeIn(rec.interval, 1, MAX_INTERVAL)) {
    return `recurrence interval must be a whole number from 1 to ${MAX_INTERVAL}`;
  }
  if (rec.weekdays !== undefined) {
    if (rec.freq !== 'weekly') return 'recurrence weekdays need a weekly recurrence';
    const days = rec.weekdays;
    const ascending =
      Array.isArray(days) &&
      days.length >= 1 &&
      days.length <= 7 &&
      days.every((d, i) => isWholeIn(d, 0, 6) && (i === 0 || d > (days[i - 1] as number)));
    if (!ascending) return 'recurrence weekdays must be ascending days 0-6';
  }
  if (rec.anchor !== undefined && !isValidISO(rec.anchor)) return 'recurrence anchor is not a date';
  return null;
}

// ── the next date ─────────────────────────────────────────────────────────────

/** The first `anchor + k * period` days (k >= 1) strictly after `after` (>= anchor). */
function firstByDays(anchor: ISODate, period: number, after: ISODate): ISODate {
  const k = Math.floor(diffDays(after, anchor) / period) + 1;
  return addDays(anchor, k * period);
}

/**
 * The first `anchor + k * months` (k >= 1) strictly after `after` (>= anchor). Each candidate is
 * computed from the anchor and clamped on its own (Jan 31 → Feb 28 → Mar 31), never from a clamped
 * result.
 */
function firstByMonths(anchor: ISODate, months: number, after: ISODate): ISODate {
  const a = parseISO(anchor);
  const f = parseISO(after);
  // whole calendar months between them give a lower bound for k; the loop adds at most one step
  let k = Math.max(1, Math.floor(((f.y - a.y) * 12 + (f.m - a.m)) / months));
  let next = addMonths(anchor, k * months);
  while (next <= after) next = addMonths(anchor, ++k * months);
  return next;
}

/**
 * The first listed weekday strictly after `after` (>= anchor) in an "on" week: the anchor's
 * (Sunday-based) week and every `interval`-th week after it.
 */
function firstOnWeekdays(
  anchor: ISODate,
  interval: number,
  days: readonly number[],
  after: ISODate
): ISODate {
  const base = startOfWeek(anchor);
  const span = 7 * interval;
  // the on-week whose block holds `after`; when its listed days are all past, the next on-week
  for (let j = Math.floor(diffDays(after, base) / span); ; j++) {
    const week = addDays(base, j * span);
    for (const d of days) {
      const date = addDays(week, d);
      if (date > after) return date;
    }
  }
}

/** The first date of the series (rule + anchor) strictly after both `floor` and the anchor. */
function firstAfter(rule: Recurrence, anchor: ISODate, floor: ISODate): ISODate | null {
  const after = floor > anchor ? floor : anchor;
  const n = intervalOf(rule);
  const days = weekdaysOf(rule);
  if (days) return firstOnWeekdays(anchor, n, days, after);
  switch (rule.freq) {
    case 'daily':
      return firstByDays(anchor, n, after);
    case 'weekly':
      return firstByDays(anchor, 7 * n, after);
    case 'monthly':
      return firstByMonths(anchor, n, after);
    case 'yearly':
      return firstByMonths(anchor, 12 * n, after);
    default:
      return null; // a frequency this version does not know: no next instance rather than a wrong one
  }
}

/** The instance's own date: its due date, else its soft plan, else null. */
const instanceDate = (task: Recurring): ISODate | null => task.dueDate ?? task.scheduledFor;

/**
 * The recurrence to store on create or after an edit, canonical (normalizeRecurrence), with the
 * anchor filled in when it can be:
 *  - an existing anchor is kept;
 *  - otherwise a dated task is anchored at its own date (`dueDate ?? scheduledFor`);
 *  - an undated task stays unanchored: by the binding rule its anchor is set at its first
 *    completion, so the series follows the day the work was actually done.
 * Adapters call this on create. When an edit changes the date or the rule (a deliberate re-plan,
 * unlike a snooze), they drop the old anchor first (ruleOf) and call it again.
 * Returns a new object, or null for a task that does not recur.
 */
export function ensureAnchor(task: Recurring): Task['recurrence'] {
  if (task.recurrence === null) return null;
  const rule = ruleOf(task.recurrence);
  const anchor = task.recurrence.anchor ?? instanceDate(task);
  return anchor === null ? rule : { ...rule, anchor };
}

/** The anchor the series uses: the stored one, else the instance date, else the completion date. */
const seriesAnchor = (task: Recurring, completionISO: ISODate): ISODate =>
  task.recurrence?.anchor ?? instanceDate(task) ?? completionISO;

/**
 * The date of the next instance: the first date of the series (the anchor, then every `interval`
 * days / weeks / months / years from it, or the listed weekdays of every `interval`-th week) that is
 * strictly after max(the instance's own date, the completion date), and after the anchor.
 *  - completed early: the next date is still after the instance date (no double instance);
 *  - completed late: missed dates are skipped (one next instance, never a burst), the series keeps
 *    its days;
 *  - an instance snoozed or edited off the series is skipped back onto it.
 * anchor = recurrence.anchor ?? (dueDate ?? scheduledFor) ?? completionISO.
 * `null` when the task does not recur.
 */
export function nextOccurrence(task: Recurring, completionISO: ISODate): ISODate | null {
  if (task.recurrence === null) return null;
  const own = instanceDate(task);
  const floor = own !== null && own > completionISO ? own : completionISO;
  return firstAfter(task.recurrence, seriesAnchor(task, completionISO), floor);
}

/**
 * The date to plan a NEW series on when the phrase or the pick that created it says nothing else:
 * today for a daily rule ("כל יום" belongs in Today), the first listed weekday strictly after today
 * for a weekly rule with days ("כל ראשון ורביעי", as "כל יום ראשון" always did), else null (a plain
 * weekly / monthly / yearly rule leaves the date to the user).
 */
export function firstPlanDate(rule: RecurrenceRule, today: ISODate): ISODate | null {
  if (rule.freq === 'daily') return today;
  const days = weekdaysOf(rule);
  return days ? firstOnWeekdays(today, 1, days, today) : null;
}

/** Deterministic id of the next instance in a series. */
export function nextTaskId(seriesId: string, nextISO: ISODate): string {
  return `${seriesId}__${nextISO}`;
}

/**
 * A week plan (scheduledFor = the Saturday ending a week) carries over to the next instance only for
 * a weekly rule without listed days, which moves in whole weeks from that Saturday. Under any other
 * rule (daily, listed weekdays, monthly, yearly) the next instance lands on a plain day.
 */
const keepsWeekPlan = (rule: Recurrence): boolean =>
  rule.freq === 'weekly' && weekdaysOf(rule) === null;

/**
 * The next instance of a recurring task, as a complete open Task, or `null` if it does not recur.
 *  - copies title, notes, category, owner, hardDeadline and dueTime
 *  - priority is copied, except 'urgent', which becomes 'normal' (an emergency does not recur)
 *  - recurrence = the same rule (canonical) with the series anchor (see nextOccurrence); the first
 *    completion of an unanchored series anchors it here
 *  - seriesId = task.seriesId ?? task.id (the first instance starts the series)
 *  - exactly one date is set: dueDate if the source had a dueDate (a soft plan alongside it is
 *    dropped, because one date drives the series), otherwise scheduledFor; it stays a week plan
 *    only under a plain weekly rule (keepsWeekPlan)
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
    weekPlan: hasDue ? false : task.weekPlan && keepsWeekPlan(task.recurrence),
    dueDate: hasDue ? next : null,
    dueTime: task.dueTime,
    hardDeadline: task.hardDeadline,
    recurrence: { ...ruleOf(task.recurrence), anchor: seriesAnchor(task, completionISO) },
    seriesId,
    status: 'open',
    snoozeCount: 0,
    lastSnoozedAt: null,
    completedAt: null,
    completedBy: null,
    completion: null
  };
}
