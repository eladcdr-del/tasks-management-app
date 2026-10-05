// owner: step 3.3. The task's story for the "היסטוריה" timeline, in natural Hebrew ("מיכל ביקשה
// מדני", "דני לקח, לבקשת מיכל", "דני אמר שלא מתאים לו", "מיכל ביטלה את הבקשה מדני"), oldest first. Pure: the screen passes the task, its events (tasks.eventsFor,
// newest first) and a member lookup.
//  - Runs of edits by the same person collapse into one "עדכן/ה" line (the newest).
//  - The live event window is limited (RECENT_EVENTS_LIMIT), so an old task may have lost its
//    'created' / 'completed' events: those two are rebuilt from the task's own fields.

import type { ActivityEvent, EventType, Member, Millis, Task } from '$lib/domain/types';
import { localTimeParts, todayISO, diffDays } from '$lib/domain/dates';
import { formatDate } from '$lib/i18n/format';
import { he } from '$lib/i18n/he';

export interface HistoryItem {
  id: string;
  type: EventType;
  actorId: string;
  at: Millis;
  text: string;
}

type Lookup = (uid: string | null | undefined) => Pick<Member, 'displayName' | 'addressAs'> | null;

const SHOWN: ReadonlySet<EventType> = new Set([
  'created',
  'taken',
  'requested',
  'accepted',
  'declined',
  'released',
  'completed',
  'reopened',
  'snoozed',
  'edited'
]);

export function buildHistory(
  task: Pick<Task, 'id' | 'createdBy' | 'createdAt' | 'status' | 'completedBy' | 'completedAt'>,
  events: readonly ActivityEvent[],
  memberById: Lookup
): HistoryItem[] {
  const actor = (uid: string | null | undefined) =>
    memberById(uid) ?? { displayName: he.taskDetail.someone, addressAs: 'n' as const };

  // Events written in one batch share a time (a task created as a request): "added" comes first.
  const tie = (e: ActivityEvent) => (e.type === 'created' ? 0 : e.type === 'requested' ? 1 : 2);
  const chronological = events
    .filter((e) => e.taskId === task.id && SHOWN.has(e.type))
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt || tie(a) - tie(b));

  const kept: ActivityEvent[] = [];
  for (const e of chronological) {
    const prev = kept.at(-1);
    if (prev && prev.type === 'edited' && e.type === 'edited' && prev.actorId === e.actorId) {
      kept[kept.length - 1] = e; // keep the newest of a run of edits
    } else kept.push(e);
  }

  const items: HistoryItem[] = kept.map((e) => ({
    id: e.id,
    type: e.type,
    actorId: e.actorId,
    at: e.createdAt,
    text: phrase(e.type, actor(e.actorId), e.targetId ? actor(e.targetId).displayName : '')
  }));

  if (!items.some((i) => i.type === 'created')) {
    items.unshift({
      id: `${task.id}:created`,
      type: 'created',
      actorId: task.createdBy,
      at: task.createdAt,
      text: phrase('created', actor(task.createdBy), '')
    });
  }
  if (
    task.status === 'done' &&
    task.completedAt !== null &&
    !items.some((i) => i.type === 'completed' && i.at >= (task.completedAt ?? 0) - 60_000)
  ) {
    items.push({
      id: `${task.id}:completed`,
      type: 'completed',
      actorId: task.completedBy ?? '',
      at: task.completedAt,
      text: phrase('completed', actor(task.completedBy), '')
    });
  }
  return items.sort((a, b) => a.at - b.at);
}

function phrase(
  type: EventType,
  a: { displayName: string; addressAs: Member['addressAs'] },
  target: string
): string {
  const ev = he.taskDetail.ev;
  switch (type) {
    case 'created':
      return ev.created(a);
    case 'taken':
      return ev.taken(a);
    case 'requested':
      return ev.requested(a, target);
    case 'accepted':
      return ev.accepted(a, target);
    case 'declined':
      return ev.declined(a);
    case 'released':
      // With a target, the asker withdrew a request that still waited for that member.
      return target ? ev.withdrew(a, target) : ev.released(a);
    case 'completed':
      return ev.completed(a);
    case 'reopened':
      return ev.reopened(a);
    case 'snoozed':
      return ev.snoozed(a);
    case 'deleted':
      return ev.deleted(a);
    default:
      return ev.edited(a);
  }
}

/** "היום · 09:12", "אתמול · 21:10", "14 בספטמבר · 08:30" (with the year when not this year). */
export function eventTime(at: Millis, today: string): string {
  const day = todayISO(at);
  const { hour, minute } = localTimeParts(at);
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const ago = diffDays(today, day);
  const date =
    ago === 0
      ? he.taskDetail.today
      : ago === 1
        ? he.taskDetail.yesterday
        : formatDate(day, { today });
  return `${date} · ${time}`;
}
