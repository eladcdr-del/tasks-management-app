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
//   due         due:{taskId}:{date}:{uid} for every task in the per-recipient summary, where date is
//               the dueDate, or today's scheduledFor for a timed plan (no dueDate, a dueTime)
//   eve         eve:{taskId}:{dueDate}:{uid} for every task in the per-recipient summary
//   weekly      wk:{YYYY-Www}:{uid}
// The I/O layer creates every key of a Send and pushes ONCE if at least one key was new. A summary
// that grows inside its window (a second task due today appears at 09:00) is therefore re-sent as
// the new, complete summary; it carries the same `tag`, so the phone replaces the earlier
// notification instead of stacking a second one.

import type { ActivityEvent, DeviceToken, Household, Member, NotifyPrefs, Task } from './types.ts';
import {
  addDaysISO,
  diffDays,
  inWindow,
  isBeforeLocal,
  isQuietHours,
  isValidISO,
  isoDateOf,
  localParts,
  type LocalParts
} from './time.ts';
import * as copy from './copy.ts';

export type SendType =
  'requested' | 'accepted' | 'declined' | 'completed' | 'jar_filled' | 'due' | 'eve' | 'weekly';

export interface Send {
  /** Dedupe keys, at least one (see the header). */
  keys: string[];
  /** Recipient member uid; the push goes to all of their device tokens. */
  uid: string;
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

export interface ActiveWindows {
  /** Event-driven pushes may go out (outside quiet hours 22:00-07:30). */
  events: boolean;
  due: boolean;
  eve: boolean;
  weekly: boolean;
}

export function activeWindows(parts: LocalParts): ActiveWindows {
  return {
    events: !isQuietHours(parts),
    due: inWindow(parts, ...WINDOWS.due),
    eve: inWindow(parts, ...WINDOWS.eve),
    weekly: parts.weekday === 0 && inWindow(parts, ...WINDOWS.weekly)
  };
}

/** True when a time-based reminder window is open (the run loads tasks/members only when needed). */
export function anyReminderWindow(w: ActiveWindows): boolean {
  return w.due || w.eve || w.weekly;
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
  due: 5,
  eve: 6,
  weekly: 7
};

const byCreated = (a: ActivityEvent, b: ActivityEvent): number =>
  a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const byId = <T extends { id: string }>(a: T, b: T): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

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

  const openTasks = input.tasks.filter((t) => t.status === 'open').sort(byId);
  const openById = new Map(openTasks.map((t) => [t.id, t]));
  const jar = input.household.jar;
  /** The jar a fill event filled is still full now: no undo took a marble out, no redeem since. */
  const jarStillFull = (e: ActivityEvent): boolean =>
    jar !== null && jar.count >= jar.target && jar.startedAt <= e.createdAt;

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
              ...copy.jarFilled(jar?.treat),
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

  // ── Time-based reminders: owner, or every member when unassigned; coalesced per recipient.
  /** The owner, or null when nobody owns it or the owner left the household (no member doc). */
  const ownerOf = (t: Task): string | null =>
    t.ownerId !== null && memberByUid.has(t.ownerId) ? t.ownerId : null;
  const recipientsOf = (t: Task): string[] => {
    const owner = ownerOf(t);
    return owner !== null ? [owner] : members.map((m) => m.uid);
  };
  /** A soft plan for today with a time and no due date ("היום ב-17:30"). Never a week plan. */
  const isTimedPlanToday = (t: Task): t is Task & { dueTime: string } =>
    t.dueDate === null && t.dueTime !== null && t.scheduledFor === parts.iso && !t.weekPlan;

  const reminderSummaries = (tasks: Task[], kind: 'due' | 'eve', date: string): void => {
    const perUid = new Map<string, Task[]>();
    for (const t of tasks) {
      for (const uid of recipientsOf(t)) {
        if (!canReceive(uid, 'reminders')) continue;
        perUid.set(uid, [...(perUid.get(uid) ?? []), t]);
      }
    }
    for (const [uid, list] of perUid) {
      list.sort(
        (a, b) =>
          (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99') ||
          a.title.localeCompare(b.title, 'he') ||
          byId(a, b)
      );
      const first = list.length === 1 ? list[0] : undefined;
      const only = first && { ...first, ownerId: ownerOf(first) }; // a former member's: unassigned
      const text = only
        ? kind === 'eve'
          ? copy.eveOne(only)
          : isTimedPlanToday(only)
            ? copy.planOne(only)
            : copy.dueOne(only)
        : kind === 'due'
          ? copy.dueMany(list.map((t) => t.title))
          : copy.eveMany(list.map((t) => t.title));
      sends.push({
        keys: list.map((t) => `${kind}:${t.id}:${t.dueDate ?? t.scheduledFor}:${uid}`),
        uid,
        type: kind,
        ...text,
        url: only ? copy.taskUrl(only.id) : copy.homeUrl(),
        tag: `${kind}:${date}`,
        eventIds: []
      });
    }
  };

  if (windows.due) {
    // A due date today (a deadline: reminded even on a week-planned task), or a timed plan for today.
    // After 12:00 only tasks that existed by then: a catch-up for a morning with no run.
    const joining = inWindow(parts, WINDOWS.due[0], DUE_JOIN_UNTIL);
    reminderSummaries(
      openTasks.filter(
        (t) =>
          (t.dueDate === parts.iso || isTimedPlanToday(t)) &&
          (joining || isBeforeLocal(t.createdAt, parts.iso, DUE_JOIN_UNTIL))
      ),
      'due',
      parts.iso
    );
  }

  if (windows.eve) {
    const tomorrow = addDaysISO(parts.iso, 1);
    reminderSummaries(
      openTasks.filter((t) => t.hardDeadline && t.dueDate === tomorrow),
      'eve',
      tomorrow
    );
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

  sends.sort(
    (a, b) =>
      (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0) ||
      TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
      ((a.keys[0] ?? '') < (b.keys[0] ?? '') ? -1 : (a.keys[0] ?? '') > (b.keys[0] ?? '') ? 1 : 0)
  );
  return { sends, eventMarks };
}
