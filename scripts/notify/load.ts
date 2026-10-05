// Firestore reads (firebase-admin; rules do not apply to admin). Every query is a single-field
// equality or a plain collection read, so no composite index is needed (Blueprint §4).
// Documents are normalised defensively: Timestamps become epoch millis, missing fields get safe
// defaults, so one malformed doc can never crash a run for the whole household.

import { Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import type {
  ActivityEvent,
  AddressAs,
  DeviceToken,
  EventType,
  Household,
  Member,
  MemberColor,
  NotifyPrefs,
  Recurrence,
  RecurrenceFreq,
  Task,
  TreatJar
} from './types.ts';
import { isValidISO } from './time.ts';

/** Deeply replaces Firestore Timestamps with epoch millis. */
export function toPlain(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toMillis();
  if (Array.isArray(value)) return value.map(toPlain);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toPlain(v);
    return out;
  }
  return value;
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const numOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const isoOrNull = (v: unknown): string | null => (isValidISO(v) ? v : null);
const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function normalizeHousehold(id: string, raw: DocumentData): Household {
  const d = obj(toPlain(raw));
  const jar = obj(d.jar);
  const invite = obj(d.invite);
  return {
    id,
    name: str(d.name),
    memberIds: Array.isArray(d.memberIds) ? d.memberIds.filter((x) => typeof x === 'string') : [],
    memberCount: num(d.memberCount),
    maxMembers: num(d.maxMembers, 6),
    createdBy: str(d.createdBy),
    createdAt: num(d.createdAt),
    jar:
      d.jar && typeof jar.treat === 'string'
        ? {
            treat: jar.treat,
            target: num(jar.target),
            count: num(jar.count),
            round: num(jar.round),
            startedAt: num(jar.startedAt),
            ...normalizeJarGoal(jar)
          }
        : null,
    invite:
      d.invite && typeof invite.code === 'string'
        ? { code: invite.code, expiresAt: num(invite.expiresAt) }
        : null
  };
}

/** The jar's optional goal-mode fields (mode, share, per-member tallies), kept only when sane. */
export function normalizeJarGoal(
  jar: Record<string, unknown>
): Pick<TreatJar, 'mode' | 'share' | 'counts'> {
  const counts: Record<string, number> = {};
  for (const [uid, n] of Object.entries(obj(jar.counts))) {
    if (typeof n === 'number' && Number.isInteger(n) && n >= 0) counts[uid] = n;
  }
  return {
    ...(jar.mode === 'each' || jar.mode === 'together' ? { mode: jar.mode } : {}),
    ...(typeof jar.share === 'number' && Number.isInteger(jar.share) && jar.share >= 1
      ? { share: jar.share }
      : {}),
    ...(jar.counts !== undefined ? { counts } : {})
  };
}

/** A missing preference counts as ON; only an explicit `false` turns a type off. */
function normalizePrefs(v: unknown): NotifyPrefs {
  const n = obj(v);
  return {
    requests: n.requests !== false,
    reminders: n.reminders !== false,
    partnerDone: n.partnerDone !== false,
    weekly: n.weekly !== false
  };
}

export function normalizeMember(uid: string, raw: DocumentData): Member {
  const d = obj(toPlain(raw));
  const addressAs: AddressAs = d.addressAs === 'f' || d.addressAs === 'm' ? d.addressAs : 'n';
  return {
    uid,
    displayName: str(d.displayName),
    photoURL: strOrNull(d.photoURL),
    color: str(d.color, 'terracotta') as MemberColor,
    addressAs,
    role: d.role === 'owner' ? 'owner' : 'member',
    joinedAt: num(d.joinedAt),
    notify: normalizePrefs(d.notify),
    inviteCode: strOrNull(d.inviteCode)
  };
}

const FREQS: readonly RecurrenceFreq[] = ['daily', 'weekly', 'monthly', 'yearly'];
const isWhole = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/**
 * The stored recurrence (the app's rule, read like its converter does): `freq` one of the four,
 * `interval` only when a whole 2..99, `weekdays` only as valid days of a weekly rule (sorted,
 * unique), `anchor` only when a date. Unknown or malformed parts read as missing; null for no rule.
 * The notifier only carries it along today (nothing it sends depends on the rule).
 */
export function normalizeRecurrence(rec: Record<string, unknown>): Recurrence | null {
  const freq = rec.freq;
  if (typeof freq !== 'string' || !(FREQS as readonly string[]).includes(freq)) return null;
  const days =
    freq === 'weekly' && Array.isArray(rec.weekdays)
      ? [...new Set(rec.weekdays.filter((d): d is number => isWhole(d, 0, 6)))].sort(
          (a, b) => a - b
        )
      : [];
  return {
    freq: freq as RecurrenceFreq,
    ...(isWhole(rec.interval, 2, 99) ? { interval: rec.interval } : {}),
    ...(days.length > 0 ? { weekdays: days } : {}),
    ...(isValidISO(rec.anchor) ? { anchor: rec.anchor } : {})
  };
}

export function normalizeTask(id: string, raw: DocumentData): Task {
  const d = obj(toPlain(raw));
  const rec = obj(d.recurrence);
  return {
    id,
    title: str(d.title),
    notes: str(d.notes),
    categoryId: (strOrNull(d.categoryId) as Task['categoryId']) ?? null,
    priority: d.priority === 'high' || d.priority === 'urgent' ? d.priority : 'normal',
    ownerId: strOrNull(d.ownerId),
    requestedBy: strOrNull(d.requestedBy),
    requestedAt: numOrNull(d.requestedAt),
    requestedOf: strOrNull(d.requestedOf), // missing on older documents
    createdBy: str(d.createdBy),
    createdAt: num(d.createdAt),
    updatedBy: str(d.updatedBy),
    updatedAt: num(d.updatedAt),
    scheduledFor: isoOrNull(d.scheduledFor),
    weekPlan: d.weekPlan === true,
    dueDate: isoOrNull(d.dueDate),
    dueTime: typeof d.dueTime === 'string' && /^\d{2}:\d{2}$/.test(d.dueTime) ? d.dueTime : null,
    hardDeadline: d.hardDeadline === true,
    recurrence: normalizeRecurrence(rec),
    seriesId: strOrNull(d.seriesId),
    status: d.status === 'done' ? 'done' : 'open',
    snoozeCount: num(d.snoozeCount),
    lastSnoozedAt: numOrNull(d.lastSnoozedAt),
    completedAt: numOrNull(d.completedAt),
    completedBy: strOrNull(d.completedBy),
    completion: null // never needed by the notifier
  };
}

export function normalizeEvent(id: string, raw: DocumentData): ActivityEvent {
  const d = obj(toPlain(raw));
  const push = d.push;
  return {
    id,
    type: str(d.type) as EventType,
    actorId: str(d.actorId),
    taskId: strOrNull(d.taskId),
    taskTitle: strOrNull(d.taskTitle),
    targetId: strOrNull(d.targetId),
    createdAt: num(d.createdAt),
    push: push === 'pending' || push === 'sent' || push === 'skipped' ? push : 'none'
  };
}

export function normalizeDevice(deviceId: string, raw: DocumentData): DeviceToken {
  const d = obj(toPlain(raw));
  return {
    deviceId,
    householdId: str(d.householdId),
    token: str(d.token).trim(),
    userAgent: str(d.userAgent),
    createdAt: num(d.createdAt),
    updatedAt: num(d.updatedAt)
  };
}

// ── Queries ───────────────────────────────────────────────────────────────────────────────────────

export async function listHouseholds(db: Firestore): Promise<Household[]> {
  const snap = await db.collection('households').get();
  return snap.docs.map((doc) => normalizeHousehold(doc.id, doc.data()));
}

export async function loadPendingEvents(db: Firestore, hid: string): Promise<ActivityEvent[]> {
  const snap = await db.collection(`households/${hid}/events`).where('push', '==', 'pending').get();
  return snap.docs.map((doc) => normalizeEvent(doc.id, doc.data()));
}

export async function loadMembers(db: Firestore, hid: string): Promise<Member[]> {
  const snap = await db.collection(`households/${hid}/members`).get();
  return snap.docs.map((doc) => normalizeMember(doc.id, doc.data()));
}

export async function loadOpenTasks(db: Firestore, hid: string): Promise<Task[]> {
  const snap = await db.collection(`households/${hid}/tasks`).where('status', '==', 'open').get();
  return snap.docs.map((doc) => normalizeTask(doc.id, doc.data()));
}

/**
 * `users/{uid}/devices` for each member. A device registered for a DIFFERENT household (the user
 * moved homes from another phone) is ignored; one without a householdId is kept. Empty tokens are
 * dropped.
 */
export async function loadDevices(
  db: Firestore,
  hid: string,
  uids: string[]
): Promise<Record<string, DeviceToken[]>> {
  const entries = await Promise.all(
    uids.map(async (uid) => {
      const snap = await db.collection(`users/${uid}/devices`).get();
      const devices = snap.docs
        .map((doc) => normalizeDevice(doc.id, doc.data()))
        .filter((d) => d.token !== '' && (d.householdId === '' || d.householdId === hid));
      return [uid, devices] as const;
    })
  );
  return Object.fromEntries(entries);
}
