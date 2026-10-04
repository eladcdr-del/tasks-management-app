// A demo household for the EMULATOR only: used by integration.test.ts and by
// `index.ts --seed-demo` (refused unless FIRESTORE_EMULATOR_HOST is set). Dates are relative to
// `now` in Asia/Jerusalem, so any `--now` gives a meaningful plan. Documents are shaped exactly as
// the app writes them (Timestamps for *At, 'YYYY-MM-DD' strings for dates).

import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { addDaysISO, localParts } from './time.ts';

export const DEMO = {
  householdId: 'hh-demo',
  michal: 'u-michal',
  dani: 'u-dani',
  devices: {
    michalPhone: { uid: 'u-michal', deviceId: 'michal-phone', token: 'tok-michal-phone' },
    /** A token FCM no longer knows: the fake sender reports it invalid. */
    michalOld: { uid: 'u-michal', deviceId: 'michal-old-tablet', token: 'tok-michal-dead' },
    daniPhone: { uid: 'u-dani', deviceId: 'dani-phone', token: 'tok-dani-phone' }
  }
} as const;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export async function seedDemo(db: Firestore, now: Date): Promise<void> {
  const today = localParts(now).iso;
  const ts = (ms: number) => Timestamp.fromMillis(ms);
  const t0 = now.getTime();
  const { householdId: hid, michal, dani } = DEMO;
  const batch = db.batch();

  batch.set(db.doc(`households/${hid}`), {
    name: 'הבית שלנו',
    memberIds: [michal, dani],
    memberCount: 2,
    maxMembers: 6,
    createdBy: michal,
    createdAt: ts(t0 - 90 * DAY),
    jar: { treat: 'ארוחה במסעדה', target: 10, count: 10, round: 1, startedAt: ts(t0 - 30 * DAY) },
    invite: null
  });

  const allOn = { requests: true, reminders: true, partnerDone: true, weekly: true };
  batch.set(db.doc(`households/${hid}/members/${michal}`), {
    uid: michal,
    displayName: 'מיכל',
    photoURL: null,
    color: 'terracotta',
    addressAs: 'f',
    role: 'owner',
    joinedAt: ts(t0 - 90 * DAY),
    notify: allOn,
    inviteCode: null
  });
  batch.set(db.doc(`households/${hid}/members/${dani}`), {
    uid: dani,
    displayName: 'דני',
    photoURL: null,
    color: 'slate',
    addressAs: 'm',
    role: 'member',
    joinedAt: ts(t0 - 89 * DAY),
    notify: allOn,
    inviteCode: 'x'.repeat(24)
  });

  for (const d of Object.values(DEMO.devices)) {
    batch.set(db.doc(`users/${d.uid}/devices/${d.deviceId}`), {
      deviceId: d.deviceId,
      householdId: hid,
      token: d.token,
      userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/140',
      createdAt: ts(t0 - 10 * DAY),
      updatedAt: ts(t0 - DAY)
    });
  }

  const task = (
    id: string,
    fields: Partial<{
      title: string;
      ownerId: string | null;
      requestedBy: string | null;
      createdAt: number;
      scheduledFor: string | null;
      weekPlan: boolean;
      dueDate: string | null;
      dueTime: string | null;
      hardDeadline: boolean;
      seriesId: string | null;
      status: 'open' | 'done';
      snoozeCount: number;
      completedBy: string | null;
    }>
  ) => {
    const createdAt = fields.createdAt ?? t0 - 2 * DAY;
    const done = fields.status === 'done';
    batch.set(db.doc(`households/${hid}/tasks/${id}`), {
      title: fields.title ?? id,
      notes: '',
      categoryId: null,
      priority: 'normal',
      ownerId: fields.ownerId ?? null,
      requestedBy: fields.requestedBy ?? null,
      requestedAt: fields.requestedBy ? ts(t0 - 10 * 60_000) : null,
      createdBy: michal,
      createdAt: ts(createdAt),
      updatedBy: michal,
      updatedAt: ts(t0 - HOUR),
      scheduledFor: fields.scheduledFor ?? null,
      weekPlan: fields.weekPlan ?? false,
      dueDate: fields.dueDate ?? null,
      dueTime: fields.dueTime ?? null,
      hardDeadline: fields.hardDeadline ?? false,
      recurrence: null,
      seriesId: fields.seriesId ?? null,
      status: fields.status ?? 'open',
      snoozeCount: fields.snoozeCount ?? 0,
      lastSnoozedAt: fields.snoozeCount ? ts(t0 - 3 * DAY) : null,
      completedAt: done ? ts(t0 - 20 * 60_000) : null,
      completedBy: done ? (fields.completedBy ?? michal) : null,
      completion: done ? { note: '', cost: null, place: '', contact: '', photoIds: [] } : null
    });
  };

  // Open tasks
  task('t-arnona', { title: 'לשלם ארנונה', ownerId: michal, dueDate: today });
  task('t-dentist', { title: 'לקבוע תור לרופא שיניים', ownerId: null, dueDate: today });
  task('t-shirt', {
    title: 'להחזיר את החולצה לקניון',
    ownerId: dani,
    dueDate: addDaysISO(today, 1),
    hardDeadline: true
  });
  task('t-ac', {
    title: 'לברר על מזגן חדש',
    ownerId: dani,
    createdAt: t0 - 50 * DAY,
    snoozeCount: 4
  });
  task('t-faucet', {
    title: 'לתקן את הברז',
    ownerId: michal,
    createdAt: t0 - 30 * DAY,
    scheduledFor: addDaysISO(today, 3)
  });
  task('t-parcel', { title: 'לאסוף חבילה מהדואר', ownerId: michal, requestedBy: dani });
  // Done tasks (the completion events below point at them)
  task('t-trash', { title: 'להוריד את הזבל', ownerId: michal, status: 'done' });
  task('t-milk', { title: 'לקנות חלב', ownerId: michal, status: 'done' });
  task('t-old', { title: 'לשטוף את הרכב', ownerId: dani, status: 'done', completedBy: dani });

  const event = (
    id: string,
    type: string,
    actorId: string,
    agoMs: number,
    extra: Partial<{ taskId: string; taskTitle: string; targetId: string; push: string }> = {}
  ) =>
    batch.set(db.doc(`households/${hid}/events/${id}`), {
      type,
      actorId,
      taskId: extra.taskId ?? null,
      taskTitle: extra.taskTitle ?? null,
      targetId: extra.targetId ?? null,
      createdAt: ts(t0 - agoMs),
      push: extra.push ?? 'pending'
    });

  event('ev-req', 'requested', dani, 10 * 60_000, {
    taskId: 't-parcel',
    taskTitle: 'לאסוף חבילה מהדואר',
    targetId: michal
  });
  event('ev-done-trash', 'completed', michal, 30 * 60_000, {
    taskId: 't-trash',
    taskTitle: 'להוריד את הזבל'
  });
  event('ev-done-milk', 'completed', michal, 20 * 60_000, {
    taskId: 't-milk',
    taskTitle: 'לקנות חלב'
  });
  event('ev-jar', 'jar_filled', michal, 20 * 60_000, { taskId: 't-milk', taskTitle: 'לקנות חלב' });
  event('ev-done-stale', 'completed', dani, 13 * HOUR, {
    taskId: 't-old',
    taskTitle: 'לשטוף את הרכב'
  });
  event('ev-created', 'created', michal, 2 * DAY, {
    taskId: 't-arnona',
    taskTitle: 'לשלם ארנונה',
    push: 'none'
  });

  await batch.commit();
}
