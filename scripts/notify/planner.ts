// The notifier's brain: a PURE function from (now, one household's data) to the pushes that should
// exist and the events that are settled. No I/O, no clock reads, no randomness: the same input
// always gives the same output (tested with a fake clock). Blueprint §9 "Planner rules".
//
// Idempotency lives outside, in run.ts: every Send carries dedupe keys, the I/O layer creates
// `households/{hid}/sent/{key}` with create() (ALREADY_EXISTS = already sent), so the planner can
// happily re-plan the same reminder on every 5-minute run inside its window.
//
// Keys and coalescing. A Send has `keys: string[]`, one key per item it covers:
//   requested   ev:{eventId}:{uid}                      (one event per Send)
//   accepted    ev:{eventId}:{uid}                      (the asked member's answer, to the asker)
//   declined    ev:{eventId}:{uid}
//   completed   ev:{eventId}:{uid} for every coalesced event of the same actor
//   jar_filled  ev:{eventId}:{uid}
//   new_tasks   new:{taskId}:{uid} for every task of one creator's burst that the recipient gets
//   soon        soon:{taskId}:{date}:{HHmm}:{uid}       (one task; a changed time re-arms it)
//   due         due:{taskId}:{date}:{uid} for every task in the per-recipient summary, where date is
//               the dueDate, or today's scheduledFor for a timed plan (no dueDate, a dueTime), and
//               late:{taskId}:{today}:{uid} for every overdue task in the same morning summary
//   eve         eve:{taskId}:{dueDate}:{uid} for every task in the per-recipient summary
//   weekly      wk:{YYYY-Www}:{uid}
//   test        test:{deviceId}:{testPushAt}                (one device; see planTests)
// The I/O layer creates every key of a Send and pushes ONCE if at least one key was new. A summary
// that grows inside its window (a second task due today appears at 09:00) is therefore re-sent as
// the new, complete summary; it carries the same `tag`, so the phone replaces the earlier
// notification instead of stacking a second one.
//
// New tasks are coalesced in time instead: one creator's additions form a burst while each comes
// within NEW_SETTLE_MS of the one before, and a burst goes out once it has been quiet that long, so
// a bulk add of 21 tasks is ONE push about 10-15 minutes after the last. A burst never grows after
// it went out (a later task is more than NEW_SETTLE_MS after its last one, so it starts a new
// burst), and later runs re-plan sent bursts only to find every key taken.

import type {
  ActivityEvent,
  DeviceToken,
  Household,
  Member,
  Millis,
  NotifyPrefs,
  Task
} from './types.ts';
import {
  addDaysISO,
  diffDays,
  hhmmOf,
  instantAt,
  inWindow,
  isBeforeLocal,
  isQuietHours,
  isValidISO,
  isoDateOf,
  localParts,
  minutesOf,
  type LocalParts
} from './time.ts';
import * as copy from './copy.ts';
import { jarIsFull } from './jar.ts';

export type SendType =
  | 'requested'
  | 'accepted'
  | 'declined'
  | 'completed'
  | 'jar_filled'
  | 'new_tasks'
  | 'soon'
  | 'due'
  | 'eve'
  | 'weekly'
  | 'test';

export interface Send {
  /** Dedupe keys, at least one (see the header). */
  keys: string[];
  /** Recipient member uid; the push goes to all of their device tokens (unless `deviceId`). */
  uid: string;
  /** Only this one device of theirs gets the push (a test push asked for from that phone). */
  deviceId?: string;
  type: SendType;
  title: string;
  body: string;
  url: string;
  /** Notification tag: a newer push with the same tag replaces the older one on the device. */
  tag: string;
  /** Pending events this push settles (empty for reminders). */
  eventIds: string[];
}

export interface EventMark {
  eventId: string;
  push: 'sent' | 'skipped';
}

export interface PlanInput {
  now: Date;
  household: Household;
  members: Member[];
  /** Open tasks (anything else is ignored). */
  tasks: Task[];
  /** Pending events (anything not `push == 'pending'` is ignored). */
  events: ActivityEvent[];
  /** Device tokens per member uid. A member with none receives nothing. */
  devicesByUid: Record<string, DeviceToken[]>;
}

export interface Plan {
  sends: Send[];
  eventMarks: EventMark[];
}

/**
 * Local reminder windows, [from, to): the start minute is in, the end minute is out. Every run
 * inside a window plans its reminders again and the sent/{key} dedupe lets each one out once, so a
 * reminder goes out on the FIRST run at or after `from`, however late that run comes (GitHub's
 * schedule can leave hours between runs). Each window closes at 22:00, when quiet hours begin.
 */
export const WINDOWS = {
  due: ['08:00', '22:00'],
  /** New tasks: a settled burst goes out in the day; additions at night wait for 08:00. */
  newTasks: ['08:00', '22:00'],
  /**
   * Before the time: each task has its own half hour [time − 30, time) inside this window, with no
   * catch-up once its time has come. The window starts when quiet hours end, so a task at 07:45 is
   * reminded at 07:30, one at 07:00 not at all.
   */
  soon: ['07:30', '22:00'],
  eve: ['18:00', '22:00'],
  /** Sundays only. */
  weekly: ['10:00', '22:00']
} as const;

/**
 * Tasks join the due-day summary until 12:00. Later runs only catch up on what a morning run would
 * have sent, so a task added in the afternoon (often by the person it is for) sets off no push.
 */
export const DUE_JOIN_UNTIL = '12:00';

/** A completion (or jar fill) older than this is old news and is skipped. */
export const COMPLETED_STALE_MS = 24 * 3_600_000;
/** A request older than this is skipped (e.g. events that piled up before the secret existed). */
export const REQUEST_STALE_MS = 7 * 86_400_000;
export const STUCK_AGE_DAYS = 21;
export const STUCK_SNOOZE_COUNT = 3;
/**
 * "משימות חדשות" launched here: tasks created before it are never announced, so the first deploy
 * does not announce the backlog of tasks already in the house.
 */
export const NEW_TASKS_FROM_MS = Date.parse('2026-10-12T16:30:00+03:00');
/** A task added longer ago than this is old news: never announced (also bounds the scan). */
export const NEW_MAX_AGE_MS = 18 * 3_600_000;
/**
 * One creator's additions closer together than this are one burst, and a burst goes out once this
 * long has passed since its last addition.
 */
export const NEW_SETTLE_MS = 10 * 60_000;
/** "לפני השעה": how long before a task's time the reminder goes out. */
export const SOON_BEFORE_MIN = 30;
/** A due date missed by more days than this leaves the morning summary (the Sunday nudge remains). */
export const OVERDUE_MAX_DAYS = 7;
/** A test push request ("בדיקת התראות") older than this is not answered any more. */
export const TEST_PUSH_WINDOW_MS = 2 * 3_600_000;
/** A request this far in the future still counts (the phone's clock may run a little ahead). */
export const TEST_PUSH_SKEW_MS = 10 * 60_000;

export interface ActiveWindows {
  /** Event-driven pushes may go out (outside quiet hours 22:00-07:30). */
  events: boolean;
  /** The morning summary: due today, timed plans for today, and overdue tasks. */
  due: boolean;
  newTasks: boolean;
  soon: boolean;
  eve: boolean;
  weekly: boolean;
}

export function activeWindows(parts: LocalParts): ActiveWindows {
  return {
    events: !isQuietHours(parts),
    due: inWindow(parts, ...WINDOWS.due),
    newTasks: inWindow(parts, ...WINDOWS.newTasks),
    soon: inWindow(parts, ...WINDOWS.soon),
    eve: inWindow(parts, ...WINDOWS.eve),
    weekly: parts.weekday === 0 && inWindow(parts, ...WINDOWS.weekly)
  };
}

/**
 * True when a window that reads tasks is open (the run loads tasks/members only when needed):
 * 07:30-22:00 every day, through `soon`.
 */
export function anyReminderWindow(w: ActiveWindows): boolean {
  return w.due || w.newTasks || w.soon || w.eve || w.weekly;
}

// ── Stuck (mirror of src/lib/domain/age.ts, Blueprint §3 amendments) ──────────────────────────────

type StuckFields = Pick<
  Task,
  'status' | 'createdAt' | 'seriesId' | 'dueDate' | 'scheduledFor' | 'snoozeCount'
>;

/** Creation day for a one-off; max(creation day, own date) for a recurring instance. */
export function ageStart(
  task: Pick<Task, 'createdAt' | 'seriesId' | 'dueDate' | 'scheduledFor'>
): string {
  const created = isoDateOf(task.createdAt);
  if (task.seriesId == null) return created;
  const own = task.dueDate ?? task.scheduledFor;
  return isValidISO(own) && own > created ? own : created;
}

/** Earliest of the given dates, ignoring nulls. */
function minISO(...dates: (string | null)[]): string | null {
  let min: string | null = null;
  for (const d of dates) if (d != null && (min === null || d < min)) min = d;
  return min;
}

/**
 * Stuck = open AND actionable (effective date min(dueDate, scheduledFor) is null or <= today) AND
 * (open >= 21 days from ageStart OR snoozed >= 3 times).
 */
export function isStuck(task: StuckFields, today: string): boolean {
  if (task.status !== 'open') return false;
  const effective = minISO(task.dueDate, task.scheduledFor);
  if (effective !== null && effective > today) return false;
  const age = Math.max(0, diffDays(today, ageStart(task)));
  return age >= STUCK_AGE_DAYS || task.snoozeCount >= STUCK_SNOOZE_COUNT;
}

// ── The planner ───────────────────────────────────────────────────────────────────────────────────

const TYPE_ORDER: Record<SendType, number> = {
  requested: 0,
  accepted: 1,
  declined: 2,
  completed: 3,
  jar_filled: 4,
  new_tasks: 5,
  soon: 6,
  due: 7,
  eve: 8,
  weekly: 9,
  test: 10
};

const byCreated = (a: ActivityEvent, b: ActivityEvent): number =>
  a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const byId = <T extends { id: string }>(a: T, b: T): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** The order of a plan's sends: by recipient, then type, then first key. */
const bySend = (a: Send, b: Send): number =>
  (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0) ||
  TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
  ((a.keys[0] ?? '') < (b.keys[0] ?? '') ? -1 : (a.keys[0] ?? '') > (b.keys[0] ?? '') ? 1 : 0);

/** A request still to answer at `nowMs`: within the last TEST_PUSH_WINDOW_MS (or a bit ahead). */
export function isFreshTestPush(testPushAt: Millis | null | undefined, nowMs: number): boolean {
  return (
    typeof testPushAt === 'number' &&
    testPushAt >= nowMs - TEST_PUSH_WINDOW_MS &&
    testPushAt <= nowMs + TEST_PUSH_SKEW_MS
  );
}

/**
 * Test pushes ("בדיקת התראות" in Settings): each device of a current member whose testPushAt is
 * fresh gets one push, to its own token only. A person asked for it just now, so neither quiet
 * hours nor their notification switches apply. Its key carries the request's own time, so every
 * tap is answered once however many runs see it (and a later tap is a new request).
 */
export function planTests(
  input: Pick<PlanInput, 'now' | 'household' | 'devicesByUid'> & { members?: Member[] }
): Send[] {
  const nowMs = input.now.getTime();
  const current = new Set([
    ...input.household.memberIds,
    ...(input.members ?? []).map((m) => m.uid)
  ]);
  const sends: Send[] = [];
  for (const [uid, devices] of Object.entries(input.devicesByUid)) {
    if (!current.has(uid)) continue;
    for (const d of devices) {
      if (d.token.length === 0 || !isFreshTestPush(d.testPushAt, nowMs)) continue;
      sends.push({
        keys: [`test:${d.deviceId}:${d.testPushAt}`],
        uid,
        deviceId: d.deviceId,
        type: 'test',
        ...copy.testPush(),
        url: copy.settingsUrl(),
        tag: 'homecare-test',
        eventIds: []
      });
    }
  }
  return sends.sort(bySend);
}

// ── New tasks ("משימות חדשות") ────────────────────────────────────────────────────────────────────

/**
 * When a task counts as added: its createdAt, except that one added at night (22:00-08:00 local)
 * counts as added at the next 08:00, so the night's additions settle into one morning burst.
 */
export function newTaskTime(createdAt: Millis): Millis {
  const p = localParts(createdAt);
  const [from, to] = WINDOWS.newTasks;
  if (inWindow(p, from, to)) return createdAt;
  const day = p.hour * 60 + p.minute >= minutesOf(to) ? addDaysISO(p.iso, 1) : p.iso;
  return instantAt(day, from);
}

export interface NewTasksBurst {
  /** Who added them (the tasks' createdBy). */
  creatorId: string;
  /** In the order they count as added. */
  tasks: Task[];
  /** When the last one counts as added (newTaskTime). */
  last: Millis;
}

/**
 * One creator's recent additions, as bursts. A candidate is an open task a person added: not the
 * next instance a recurring task's completion creates (it has a seriesId; the completion push is
 * the news there), at or after NEW_TASKS_FROM_MS and less than NEW_MAX_AGE_MS ago. In the order
 * they count as added (newTaskTime), a gap of more than NEW_SETTLE_MS starts a new burst.
 */
export function newTaskBursts(tasks: Task[], nowMs: number): NewTasksBurst[] {
  const since = Math.max(NEW_TASKS_FROM_MS, nowMs - NEW_MAX_AGE_MS);
  const added = tasks
    .filter((t) => t.status === 'open' && t.seriesId === null && t.createdAt >= since)
    .map((t) => ({ t, at: newTaskTime(t.createdAt) }))
    .sort((a, b) => a.at - b.at || a.t.createdAt - b.t.createdAt || byId(a.t, b.t));
  const latest = new Map<string, NewTasksBurst>();
  const bursts: NewTasksBurst[] = [];
  for (const { t, at } of added) {
    const burst = latest.get(t.createdBy);
    if (burst && at - burst.last <= NEW_SETTLE_MS) {
      burst.tasks.push(t);
      burst.last = at;
      continue;
    }
    const next = { creatorId: t.createdBy, tasks: [t], last: at };
    latest.set(t.createdBy, next);
    bursts.push(next);
  }
  return bursts;
}

export function plan(input: PlanInput): Plan {
  const parts = localParts(input.now);
  const nowMs = input.now.getTime();
  const windows = activeWindows(parts);

  const members = [...input.members].sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
  const memberByUid = new Map(members.map((m) => [m.uid, m]));
  const hasDevices = (uid: string): boolean =>
    (input.devicesByUid[uid] ?? []).some((d) => d.token.length > 0);
  /** A member exists, has the preference on, and has at least one device. */
  const canReceive = (uid: string, pref: keyof NotifyPrefs): boolean => {
    const m = memberByUid.get(uid);
    return m !== undefined && m.notify[pref] === true && hasDevices(uid);
  };
  const actorOf = (uid: string): copy.Actor => memberByUid.get(uid) ?? copy.FALLBACK_ACTOR;
  const titles = (tasks: Task[]): string[] => tasks.map((t) => t.title);

  const openTasks = input.tasks.filter((t) => t.status === 'open').sort(byId);
  const openById = new Map(openTasks.map((t) => [t.id, t]));
  const jar = input.household.jar;
  /**
   * The jar a fill event filled is still full now, by its goal (jar.ts): no undo took a marble out
   * (or someone's part back below their share), nobody joined with a part still to do, no redeem.
   */
  const jarStillFull = (e: ActivityEvent): boolean =>
    jar !== null && jarIsFull(jar, input.household.memberIds) && jar.startedAt <= e.createdAt;

  const sends: Send[] = [];
  const eventMarks: EventMark[] = [];

  // ── Event-driven pushes. During quiet hours nothing is touched: events stay pending, unmarked,
  //    and the first run at or after 07:30 handles them (staleness is judged then).
  if (windows.events) {
    const pending = input.events.filter((e) => e.push === 'pending').sort(byCreated);
    /** completed events grouped by actor -> recipient, in first-seen order. */
    const doneGroups = new Map<string, { actorId: string; uid: string; events: ActivityEvent[] }>();

    for (const e of pending) {
      if (e.type === 'requested') {
        const target = e.targetId;
        const task = e.taskId ? openById.get(e.taskId) : undefined;
        // Still asked of them: the request waits for their answer (requestedOf), or it is theirs
        // (the previous app version assigned it at once; or they already said yes). Not withdrawn,
        // declined, taken by someone else, done or deleted.
        const stillAsked =
          task !== undefined &&
          (task.ownerId === target || (task.ownerId === null && task.requestedOf === target));
        const ok =
          target !== null &&
          target !== e.actorId &&
          nowMs - e.createdAt <= REQUEST_STALE_MS &&
          stillAsked &&
          canReceive(target, 'requests');
        if (!ok || !target || !task) {
          eventMarks.push({ eventId: e.id, push: 'skipped' });
          continue;
        }
        sends.push({
          keys: [`ev:${e.id}:${target}`],
          uid: target,
          type: 'requested',
          ...copy.requested(actorOf(e.actorId), e.taskTitle ?? task.title),
          url: copy.taskUrl(task.id),
          tag: `req:${e.id}`,
          eventIds: [e.id]
        });
        eventMarks.push({ eventId: e.id, push: 'sent' });
        continue;
      }

      if (e.type === 'accepted' || e.type === 'declined') {
        // The asked member's answer goes to the asker (targetId), under their requests preference.
        // Old news is skipped: an accepted task they no longer hold (released, done, deleted), or a
        // declined one that is done, deleted or already taken by someone.
        const asker = e.targetId;
        const task = e.taskId ? openById.get(e.taskId) : undefined;
        const current =
          task !== undefined &&
          (e.type === 'accepted' ? task.ownerId === e.actorId : task.ownerId === null);
        const ok =
          asker !== null &&
          asker !== e.actorId &&
          nowMs - e.createdAt <= REQUEST_STALE_MS &&
          current &&
          canReceive(asker, 'requests');
        if (!ok || !asker || !task) {
          eventMarks.push({ eventId: e.id, push: 'skipped' });
          continue;
        }
        const words = e.type === 'accepted' ? copy.accepted : copy.declined;
        sends.push({
          keys: [`ev:${e.id}:${asker}`],
          uid: asker,
          type: e.type,
          ...words(actorOf(e.actorId), e.taskTitle ?? task.title),
          url: copy.taskUrl(task.id),
          tag: `ans:${e.id}`,
          eventIds: [e.id]
        });
        eventMarks.push({ eventId: e.id, push: 'sent' });
        continue;
      }

      if (e.type === 'completed' || e.type === 'jar_filled') {
        const stale = nowMs - e.createdAt > COMPLETED_STALE_MS;
        // A completion whose task is open again was undone (reopenTask) before we got to it; so was
        // a jar fill whose completing task (its taskId, when set) is open again. The app writes a
        // jar fill without a taskId, so a fill also needs the jar to be full still, in its round.
        const undone =
          (e.taskId !== null && openById.has(e.taskId)) ||
          (e.type === 'jar_filled' && !jarStillFull(e));
        const recipients =
          stale || undone
            ? []
            : members.filter((m) => m.uid !== e.actorId && canReceive(m.uid, 'partnerDone'));
        if (recipients.length === 0) {
          eventMarks.push({ eventId: e.id, push: 'skipped' });
          continue;
        }
        for (const m of recipients) {
          if (e.type === 'jar_filled') {
            sends.push({
              keys: [`ev:${e.id}:${m.uid}`],
              uid: m.uid,
              type: 'jar_filled',
              ...copy.jarFilled(jar?.treat, jar?.mode),
              url: copy.jarUrl(),
              tag: `jar:${e.id}`,
              eventIds: [e.id]
            });
          } else {
            const groupKey = `${e.actorId}\u0000${m.uid}`;
            const group = doneGroups.get(groupKey) ?? {
              actorId: e.actorId,
              uid: m.uid,
              events: []
            };
            group.events.push(e);
            doneGroups.set(groupKey, group);
          }
        }
        eventMarks.push({ eventId: e.id, push: 'sent' });
        continue;
      }

      // Only the types above are ever written as pending; settle anything else.
      eventMarks.push({ eventId: e.id, push: 'skipped' });
    }

    for (const { actorId, uid, events } of doneGroups.values()) {
      const actor = actorOf(actorId);
      const first = events[0];
      if (!first) continue;
      const single = events.length === 1;
      sends.push({
        keys: events.map((e) => `ev:${e.id}:${uid}`),
        uid,
        type: 'completed',
        ...(single
          ? copy.completedOne(actor, first.taskTitle)
          : copy.completedMany(
              actor,
              events.map((e) => e.taskTitle)
            )),
        url: single && first.taskId ? copy.taskUrl(first.taskId) : copy.homeUrl(),
        tag: `done:${first.id}`,
        eventIds: events.map((e) => e.id)
      });
    }
  }

  // ── New tasks: each settled burst goes to every other member with newTasks on, one push per
  //    burst. Left out for them: a task that is theirs or asked of them (the request push covers
  //    it), one they have acted on themselves (took, released, declined, edited: they know it),
  //    and one added before they joined (they found the list as it was).
  if (windows.newTasks) {
    for (const burst of newTaskBursts(openTasks, nowMs)) {
      const first = burst.tasks[0];
      if (!first || nowMs - burst.last < NEW_SETTLE_MS) continue; // still settling
      const actor = actorOf(burst.creatorId);
      for (const m of members) {
        if (m.uid === burst.creatorId || !canReceive(m.uid, 'newTasks')) continue;
        const news = burst.tasks.filter(
          (t) =>
            t.ownerId !== m.uid &&
            t.requestedOf !== m.uid &&
            t.updatedBy !== m.uid &&
            t.createdAt >= m.joinedAt
        );
        if (news.length === 0) continue;
        const only = news.length === 1 ? news[0] : undefined;
        sends.push({
          keys: news.map((t) => `new:${t.id}:${m.uid}`),
          uid: m.uid,
          type: 'new_tasks',
          ...(only ? copy.newTaskOne(actor, only.title) : copy.newTasksMany(actor, titles(news))),
          url: only ? copy.taskUrl(only.id) : copy.homeUrl(),
          tag: `new:${burst.creatorId}:${first.id}`,
          eventIds: []
        });
      }
    }
  }

  // ── Time-based reminders: owner, or every member when unassigned; coalesced per recipient.
  /** The owner, or null when nobody owns it or the owner left the household (no member doc). */
  const ownerOf = (t: Task): string | null =>
    t.ownerId !== null && memberByUid.has(t.ownerId) ? t.ownerId : null;
  const recipientsOf = (t: Task): string[] => {
    const owner = ownerOf(t);
    return owner !== null ? [owner] : members.map((m) => m.uid);
  };
  /** The task as the copy shows it: a former member's task reads as unassigned. */
  const asShown = <T extends Task>(t: T): T => ({ ...t, ownerId: ownerOf(t) });
  /** A soft plan for today with a time and no due date ("היום ב-17:30"). Never a week plan. */
  const isTimedPlanToday = (t: Task): t is Task & { dueTime: string } =>
    t.dueDate === null && t.dueTime !== null && t.scheduledFor === parts.iso && !t.weekPlan;
  const byTime = (a: Task, b: Task): number =>
    (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99') ||
    a.title.localeCompare(b.title, 'he') ||
    byId(a, b);
  /** Each recipient of `tasks` who has `pref` on, with their tasks in `order`. */
  const perRecipient = (
    tasks: Task[],
    pref: keyof NotifyPrefs,
    order: (a: Task, b: Task) => number
  ): Map<string, Task[]> => {
    const perUid = new Map<string, Task[]>();
    for (const t of tasks) {
      for (const uid of recipientsOf(t)) {
        if (canReceive(uid, pref)) perUid.set(uid, [...(perUid.get(uid) ?? []), t]);
      }
    }
    for (const list of perUid.values()) list.sort(order);
    return perUid;
  };

  // ── Before the time: in the half hour before a task's time today, one push per task and
  //    recipient with `soon` on, except to whoever added it themselves after that half hour began
  //    (they have just written it). The key carries the time, so a changed time re-arms it.
  if (windows.soon) {
    const nowMin = parts.hour * 60 + parts.minute;
    for (const t of openTasks) {
      const time = t.dueDate === parts.iso || isTimedPlanToday(t) ? t.dueTime : null;
      if (time === null) continue;
      const at = minutesOf(time);
      const left = at - nowMin;
      if (left <= 0 || left > SOON_BEFORE_MIN) continue;
      const from = hhmmOf(at - SOON_BEFORE_MIN);
      const shown = {
        ...asShown(t),
        dueTime: time,
        hardDeadline: t.hardDeadline && t.dueDate === parts.iso
      };
      for (const uid of recipientsOf(t)) {
        if (!canReceive(uid, 'soon')) continue;
        if (t.createdBy === uid && !isBeforeLocal(t.createdAt, parts.iso, from)) continue;
        sends.push({
          keys: [`soon:${t.id}:${parts.iso}:${time.replace(':', '')}:${uid}`],
          uid,
          type: 'soon',
          ...copy.soon(shown, Math.max(5, Math.round(left / 5) * 5)),
          url: copy.taskUrl(t.id),
          tag: `soon:${t.id}`,
          eventIds: []
        });
      }
    }
  }

  // ── The morning summary, one push per recipient: what is due today (a due date today, a
  //    deadline even on a week-planned task, or a timed plan for today) under `reminders`, and
  //    what is overdue under `overdue`. Overdue = a due date 1 to 7 days ago, unless the task was
  //    re-planned to a later day (scheduledFor after today); a soft plan alone is never overdue.
  //    After 12:00 only tasks that existed by then: a catch-up for a morning with no run.
  if (windows.due) {
    const joining = inWindow(parts, WINDOWS.due[0], DUE_JOIN_UNTIL);
    const joins = (t: Task): boolean =>
      joining || isBeforeLocal(t.createdAt, parts.iso, DUE_JOIN_UNTIL);
    const oldest = addDaysISO(parts.iso, -OVERDUE_MAX_DAYS);
    const isOverdue = (t: Task): t is Task & { dueDate: string } =>
      t.dueDate !== null &&
      t.dueDate >= oldest &&
      t.dueDate < parts.iso &&
      !(t.scheduledFor !== null && t.scheduledFor > parts.iso);
    const today = perRecipient(
      openTasks.filter((t) => (t.dueDate === parts.iso || isTimedPlanToday(t)) && joins(t)),
      'reminders',
      byTime
    );
    const late = perRecipient(
      openTasks.filter((t) => isOverdue(t) && joins(t)),
      'overdue',
      (a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || byTime(a, b)
    );
    for (const uid of new Set([...today.keys(), ...late.keys()])) {
      const due = today.get(uid) ?? [];
      const missed = late.get(uid) ?? [];
      const all = [...due, ...missed];
      const only = all.length === 1 && all[0] ? asShown(all[0]) : undefined;
      const text =
        missed.length === 0
          ? only
            ? isTimedPlanToday(only)
              ? copy.planOne(only)
              : copy.dueOne(only)
            : copy.dueMany(titles(due))
          : due.length === 0
            ? only && isOverdue(only)
              ? copy.lateOne(only, diffDays(parts.iso, only.dueDate))
              : copy.lateMany(titles(missed))
            : copy.dueAndLate(titles(due), titles(missed));
      sends.push({
        keys: [
          ...due.map((t) => `due:${t.id}:${t.dueDate ?? t.scheduledFor}:${uid}`),
          ...missed.map((t) => `late:${t.id}:${parts.iso}:${uid}`)
        ],
        uid,
        type: 'due',
        ...text,
        url: only ? copy.taskUrl(only.id) : copy.homeUrl(),
        tag: `due:${parts.iso}`,
        eventIds: []
      });
    }
  }

  if (windows.eve) {
    const tomorrow = addDaysISO(parts.iso, 1);
    const due = perRecipient(
      openTasks.filter((t) => t.hardDeadline && t.dueDate === tomorrow),
      'reminders',
      byTime
    );
    for (const [uid, list] of due) {
      const only = list.length === 1 && list[0] ? asShown(list[0]) : undefined;
      sends.push({
        keys: list.map((t) => `eve:${t.id}:${t.dueDate}:${uid}`),
        uid,
        type: 'eve',
        ...(only ? copy.eveOne(only) : copy.eveMany(titles(list))),
        url: only ? copy.taskUrl(only.id) : copy.homeUrl(),
        tag: `eve:${tomorrow}`,
        eventIds: []
      });
    }
  }

  if (windows.weekly) {
    const stuck = openTasks
      .filter((t) => isStuck(t, parts.iso))
      .sort(
        (a, b) =>
          ageStart(a).localeCompare(ageStart(b)) || b.snoozeCount - a.snoozeCount || byId(a, b)
      );
    for (const m of members) {
      if (!canReceive(m.uid, 'weekly')) continue;
      const mine = stuck.filter((t) => {
        const owner = ownerOf(t);
        return owner === m.uid || owner === null;
      });
      const only = mine.length === 1 ? mine[0] : undefined;
      if (mine.length === 0) continue;
      sends.push({
        keys: [`wk:${parts.isoWeek}:${m.uid}`],
        uid: m.uid,
        type: 'weekly',
        ...copy.weekly(mine.map((t) => t.title)),
        url: only ? copy.taskUrl(only.id) : copy.homeUrl(),
        tag: `wk:${parts.isoWeek}`,
        eventIds: []
      });
    }
  }

  // ── Test pushes: any time (see planTests).
  sends.push(...planTests(input));

  sends.sort(bySend);
  return { sends, eventMarks };
}
