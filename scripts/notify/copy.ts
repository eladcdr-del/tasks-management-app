// Every Hebrew string the notifier sends, plus the deep links. Gender rules (Blueprint §8 "Copy"):
// an actor phrase uses the ACTOR's form from `addressAs` (f: "מיכל ביקשה", m: "דני ביקש",
// n: "ביקש/ה"). "ממך" is spelled the same for every recipient, and the reminder copy addresses no
// one by gender, so the recipient's form is never needed. Gentle tone: one exclamation mark, for the
// jar, and nowhere else.

import type { AddressAs } from './types.ts';

export const APP_URL = 'https://eladcdr-del.github.io/tasks-management-app/';

export const homeUrl = (): string => `${APP_URL}#/`;
export const taskUrl = (taskId: string): string => `${APP_URL}#/task/${encodeURIComponent(taskId)}`;
export const jarUrl = (): string => `${APP_URL}#/jar`;

export interface Actor {
  displayName: string;
  addressAs: AddressAs;
}

export interface Copy {
  title: string;
  body: string;
}

/** Used when the actor's member doc is gone (they left the household). Generic Hebrew is masculine. */
export const FALLBACK_ACTOR: Actor = { displayName: 'מישהו מהבית', addressAs: 'm' };

const VERBS = {
  asked: { f: 'ביקשה', m: 'ביקש', n: 'ביקש/ה' },
  finished: { f: 'סיימה', m: 'סיים', n: 'סיים/ה' }
} as const satisfies Record<string, Record<AddressAs, string>>;

/** The actor's past-tense verb in their own form. Unknown forms fall back to neutral. */
export function actorVerb(kind: keyof typeof VERBS, addressAs: AddressAs): string {
  return VERBS[kind][addressAs] ?? VERBS[kind].n;
}

const MAX_TITLE = 80;
const MAX_LISTED = 3;

/** A task title as shown in a notification: trimmed, never empty, clipped to keep payloads small. */
export function cleanTitle(title: string | null | undefined): string {
  const t = (title ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return 'משימה';
  return t.length > MAX_TITLE ? `${t.slice(0, MAX_TITLE - 1).trimEnd()}…` : t;
}

/** Up to three titles, comma separated, then "ועוד N" for the rest. */
export function titleList(titles: string[]): string {
  const shown = titles.slice(0, MAX_LISTED).map(cleanTitle).join(', ');
  const extra = titles.length - MAX_LISTED;
  if (extra <= 0) return shown;
  return `${shown} ${extra === 1 ? 'ועוד משימה אחת' : `ועוד ${extra}`}`;
}

function actorName(actor: Actor): string {
  return actor.displayName.trim() || FALLBACK_ACTOR.displayName;
}

/** "דני ביקש ממך משימה" / "מיכל ביקשה ממך משימה" / "נועם ביקש/ה ממך משימה"; body = the task. */
export function requested(actor: Actor, taskTitle: string | null): Copy {
  return {
    title: `${actorName(actor)} ${actorVerb('asked', actor.addressAs)} ממך משימה`,
    body: cleanTitle(taskTitle)
  };
}

/** One completion: "מיכל סיימה: {title}". */
export function completedOne(actor: Actor, taskTitle: string | null): Copy {
  return {
    title: `${actorName(actor)} ${actorVerb('finished', actor.addressAs)}: ${cleanTitle(taskTitle)}`,
    body: 'עוד משימה ירדה מהרשימה'
  };
}

/** Coalesced completions by one actor: "מיכל סיימה 3 משימות"; body lists the titles. */
export function completedMany(actor: Actor, taskTitles: (string | null)[]): Copy {
  return {
    title: `${actorName(actor)} ${actorVerb('finished', actor.addressAs)} ${taskTitles.length} משימות`,
    body: titleList(taskTitles.map(cleanTitle))
  };
}

/** "הצנצנת התמלאה!" + "הגיע הזמן ל: {treat}". */
export function jarFilled(treat: string | null | undefined): Copy {
  const t = (treat ?? '').trim();
  return {
    title: 'הצנצנת התמלאה!',
    body: t ? `הגיע הזמן ל: ${t}` : 'הגיע הזמן לפינוק שקבעתם'
  };
}

interface ReminderTask {
  title: string;
  dueTime: string | null;
  hardDeadline: boolean;
  ownerId: string | null;
}

/** Due-day morning, one task: "להיום: {title}". */
export function dueOne(task: ReminderTask): Copy {
  const details: string[] = [];
  if (task.dueTime) details.push(`עד השעה ${task.dueTime}`);
  if (task.hardDeadline) details.push('מועד אחרון');
  if (task.ownerId === null) details.push('עוד לא נלקחה');
  return {
    title: `להיום: ${cleanTitle(task.title)}`,
    body: details.length ? details.join(' · ') : 'מחכה ברשימה של היום'
  };
}

/**
 * Due-day morning, one TIMED PLAN (no due date, a time, planned for today): "היום ב-17:30: {title}".
 * A plan is not a deadline, so there is no "עד השעה".
 */
export function planOne(task: ReminderTask & { dueTime: string }): Copy {
  return {
    title: `היום ב-${task.dueTime}: ${cleanTitle(task.title)}`,
    body: task.ownerId === null ? 'עוד לא נלקחה' : 'מחכה ברשימה של היום'
  };
}

/** Due-day morning, coalesced: "3 משימות להיום". */
export function dueMany(taskTitles: string[]): Copy {
  return { title: `${taskTitles.length} משימות להיום`, body: titleList(taskTitles) };
}

/** Evening before a hard deadline, one task: "מחר אחרון: {title}". */
export function eveOne(task: ReminderTask): Copy {
  return {
    title: `מחר אחרון: ${cleanTitle(task.title)}`,
    body: task.dueTime ? `נשאר עוד יום · מחר עד השעה ${task.dueTime}` : 'נשאר עוד יום'
  };
}

/** Evening before hard deadlines, coalesced: "מחר אחרון: 2 משימות". */
export function eveMany(taskTitles: string[]): Copy {
  return { title: `מחר אחרון: ${taskTitles.length} משימות`, body: titleList(taskTitles) };
}

/** Sunday nudge: "יש 2 משימות שמחכות כבר זמן מה", up to 3 titles in the body. */
export function weekly(taskTitles: string[]): Copy {
  const n = taskTitles.length;
  return {
    title: n === 1 ? 'יש משימה אחת שמחכה כבר זמן מה' : `יש ${n} משימות שמחכות כבר זמן מה`,
    body: titleList(taskTitles)
  };
}
