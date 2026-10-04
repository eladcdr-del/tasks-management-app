// Firestore ↔ domain (owner step 2.2), exactly the stored shapes of docs/firestore-schema.md.
//
//  - Reads: ids come from the document path (never stored); every Timestamp becomes epoch millis;
//    snapshots are read with { serverTimestamps: 'estimate' } so a write that is still queued
//    (offline, or in flight) already carries a value; `Task.pending` = metadata.hasPendingWrites.
//    Objects are rebuilt field by field, so unknown stored keys are dropped.
//  - Writes: the full documents the rules accept. "Now" fields are serverTimestamp(); the optional
//    `recurrence.anchor` is omitted when undefined (never null/undefined); `id`, `uid`, `code`,
//    `deviceId` and `pending` are never written.

import {
  serverTimestamp,
  type DocumentData,
  type DocumentSnapshot,
  type FieldValue,
  type SnapshotOptions
} from 'firebase/firestore';
import type {
  ActivityEvent,
  AddressAs,
  CategoryId,
  Completion,
  EarnedTreat,
  EventType,
  Household,
  Invite,
  Member,
  MemberColor,
  NotifyPrefs,
  Photo,
  Priority,
  RecurrenceFreq,
  Task,
  TreatJar
} from '../../domain/types';

export const READ_OPTIONS: SnapshotOptions = { serverTimestamps: 'estimate' };

type Snap = DocumentSnapshot<DocumentData>;

// ── primitive readers (defensive: a malformed field never throws) ──────────────

function millis(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof (v as { toMillis?: unknown }).toMillis === 'function') {
    return (v as { toMillis(): number }).toMillis();
  }
  if (v instanceof Date) return v.getTime();
  return null;
}

const millisOr0 = (v: unknown): number => millis(v) ?? 0;
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const bool = (v: unknown): boolean => v === true;

const isTimestamp = (v: unknown): v is { toMillis(): number } =>
  v !== null &&
  typeof v === 'object' &&
  typeof (v as { toMillis?: unknown }).toMillis === 'function';
const isMap = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && !isTimestamp(v);

/**
 * The document's data with every still-pending serverTimestamp() replaced by a better estimate
 * than the SDK's (which is the local write time truncated to the second): the time this client
 * issued the write (`writeTime`, when known), and never earlier than a time the server has already
 * stamped on the same document (so updatedAt ≥ createdAt holds while a write is in flight).
 */
function data(snap: Snap, writeTime?: number): Record<string, unknown> {
  const est = (snap.data(READ_OPTIONS) ?? {}) as Record<string, unknown>;
  if (!snap.metadata.hasPendingWrites) return est;
  const raw = (snap.data({ serverTimestamps: 'none' }) ?? {}) as Record<string, unknown>;
  let floor = 0;
  const scan = (e: Record<string, unknown>, r: Record<string, unknown>) => {
    for (const [k, ev] of Object.entries(e)) {
      const rv = r[k];
      if (isTimestamp(ev) && isTimestamp(rv)) floor = Math.max(floor, ev.toMillis());
      else if (isMap(ev) && isMap(rv)) scan(ev, rv);
    }
  };
  const fix = (e: Record<string, unknown>, r: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = { ...e };
    for (const [k, ev] of Object.entries(e)) {
      const rv = r[k];
      if (isTimestamp(ev) && rv === null) {
        out[k] = Math.max(ev.toMillis(), writeTime ?? 0, floor);
      } else if (isMap(ev) && isMap(rv)) {
        out[k] = fix(ev, rv);
      }
    }
    return out;
  };
  scan(est, raw);
  return fix(est, raw);
}

/** True while `jar.startedAt` is a serverTimestamp() the server has not stamped yet. */
export function jarStartPending(snap: Snap): boolean {
  if (!snap.metadata.hasPendingWrites) return false;
  const raw: unknown = snap.get('jar', { serverTimestamps: 'none' });
  return isMap(raw) && raw.startedAt === null;
}

// ── households ────────────────────────────────────────────────────────────────

function jarFrom(v: unknown): TreatJar | null {
  if (!v || typeof v !== 'object') return null;
  const j = v as Record<string, unknown>;
  return {
    treat: str(j.treat),
    target: num(j.target),
    count: num(j.count),
    round: num(j.round, 1),
    startedAt: millisOr0(j.startedAt)
  };
}

export function householdFromSnap(snap: Snap, writeTime?: number): Household {
  const d = data(snap, writeTime);
  const memberIds = Array.isArray(d.memberIds)
    ? d.memberIds.filter((x): x is string => typeof x === 'string')
    : [];
  const inv = d.invite as Record<string, unknown> | null | undefined;
  return {
    id: snap.id,
    name: str(d.name),
    memberIds,
    memberCount: num(d.memberCount, memberIds.length),
    maxMembers: num(d.maxMembers, 6),
    createdBy: str(d.createdBy),
    createdAt: millisOr0(d.createdAt),
    jar: jarFrom(d.jar),
    invite:
      inv && typeof inv === 'object' && typeof inv.code === 'string'
        ? { code: inv.code, expiresAt: millisOr0(inv.expiresAt) }
        : null
  };
}

// ── members ───────────────────────────────────────────────────────────────────

function notifyFrom(v: unknown): NotifyPrefs {
  const n = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    requests: bool(n.requests),
    reminders: bool(n.reminders),
    partnerDone: bool(n.partnerDone),
    weekly: bool(n.weekly)
  };
}

export function memberFromSnap(snap: Snap, writeTime?: number): Member {
  const d = data(snap, writeTime);
  return {
    uid: snap.id,
    displayName: str(d.displayName),
    photoURL: strOrNull(d.photoURL),
    color: str(d.color, 'terracotta') as MemberColor,
    addressAs: str(d.addressAs, 'n') as AddressAs,
    role: d.role === 'owner' ? 'owner' : 'member',
    joinedAt: millisOr0(d.joinedAt),
    notify: notifyFrom(d.notify),
    inviteCode: strOrNull(d.inviteCode)
  };
}

export interface MemberWrite {
  displayName: string;
  photoURL: string | null;
  color: MemberColor;
  addressAs: AddressAs;
  role: Member['role'];
  notify: NotifyPrefs;
  inviteCode: string | null;
}

export function memberDoc(m: MemberWrite): DocumentData {
  return {
    displayName: m.displayName,
    photoURL: m.photoURL,
    color: m.color,
    addressAs: m.addressAs,
    role: m.role,
    joinedAt: serverTimestamp(),
    notify: { ...m.notify },
    inviteCode: m.inviteCode
  };
}

// ── tasks ─────────────────────────────────────────────────────────────────────

function recurrenceFrom(v: unknown): Task['recurrence'] {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (typeof r.freq !== 'string') return null;
  const freq = r.freq as RecurrenceFreq;
  return typeof r.anchor === 'string' ? { freq, anchor: r.anchor } : { freq };
}

/** The stored recurrence: `{freq}` or `{freq, anchor}`; never an `anchor: undefined` key. */
export function recurrenceDoc(r: Task['recurrence']): DocumentData | null {
  if (r === null) return null;
  return r.anchor === undefined ? { freq: r.freq } : { freq: r.freq, anchor: r.anchor };
}

function completionFrom(v: unknown): Completion | null {
  if (!v || typeof v !== 'object') return null;
  const c = v as Record<string, unknown>;
  return {
    note: str(c.note),
    cost: typeof c.cost === 'number' ? c.cost : null,
    place: str(c.place),
    contact: str(c.contact),
    photoIds: Array.isArray(c.photoIds)
      ? c.photoIds.filter((x): x is string => typeof x === 'string')
      : []
  };
}

export function taskFromSnap(snap: Snap, writeTime?: number): Task {
  const d = data(snap, writeTime);
  return {
    id: snap.id,
    title: str(d.title),
    notes: str(d.notes),
    categoryId: strOrNull(d.categoryId) as CategoryId | null,
    priority: str(d.priority, 'normal') as Priority,
    ownerId: strOrNull(d.ownerId),
    requestedBy: strOrNull(d.requestedBy),
    requestedAt: millis(d.requestedAt),
    createdBy: str(d.createdBy),
    createdAt: millisOr0(d.createdAt),
    updatedBy: str(d.updatedBy),
    updatedAt: millisOr0(d.updatedAt),
    scheduledFor: strOrNull(d.scheduledFor),
    weekPlan: bool(d.weekPlan),
    dueDate: strOrNull(d.dueDate),
    dueTime: strOrNull(d.dueTime),
    hardDeadline: bool(d.hardDeadline),
    recurrence: recurrenceFrom(d.recurrence),
    seriesId: strOrNull(d.seriesId),
    status: d.status === 'done' ? 'done' : 'open',
    snoozeCount: num(d.snoozeCount),
    lastSnoozedAt: millis(d.lastSnoozedAt),
    completedAt: millis(d.completedAt),
    completedBy: strOrNull(d.completedBy),
    completion: completionFrom(d.completion),
    pending: snap.metadata.hasPendingWrites
  };
}

/** The user-editable part of a task, as stored. */
export type TaskContent = Pick<
  Task,
  | 'title'
  | 'notes'
  | 'categoryId'
  | 'priority'
  | 'ownerId'
  | 'scheduledFor'
  | 'weekPlan'
  | 'dueDate'
  | 'dueTime'
  | 'hardDeadline'
  | 'recurrence'
  | 'seriesId'
>;

/**
 * A new open task (createTask, or the next recurring instance): the full create shape, created and
 * updated now by `uid`, requested now by `uid` when `requested`.
 */
export function newTaskDoc(t: TaskContent, uid: string, requested: boolean): DocumentData {
  const now: FieldValue = serverTimestamp();
  return {
    title: t.title,
    notes: t.notes,
    categoryId: t.categoryId,
    priority: t.priority,
    ownerId: t.ownerId,
    requestedBy: requested ? uid : null,
    requestedAt: requested ? now : null,
    createdBy: uid,
    createdAt: now,
    updatedBy: uid,
    updatedAt: now,
    scheduledFor: t.scheduledFor,
    weekPlan: t.weekPlan,
    dueDate: t.dueDate,
    dueTime: t.dueTime,
    hardDeadline: t.hardDeadline,
    recurrence: recurrenceDoc(t.recurrence),
    seriesId: t.seriesId,
    status: 'open',
    snoozeCount: 0,
    lastSnoozedAt: null,
    completedAt: null,
    completedBy: null,
    completion: null
  };
}

/** `…touch`: required on every task update. */
export function touch(uid: string): DocumentData {
  return { updatedBy: uid, updatedAt: serverTimestamp() };
}

// ── events ────────────────────────────────────────────────────────────────────

const PUSH_PENDING: ReadonlySet<EventType> = new Set(['requested', 'completed', 'jar_filled']);

export function eventDoc(
  type: EventType,
  actorId: string,
  task: { id: string; title: string } | null,
  targetId: string | null = null
): DocumentData {
  return {
    type,
    actorId,
    taskId: task?.id ?? null,
    taskTitle: task?.title || null,
    targetId,
    createdAt: serverTimestamp(),
    push: PUSH_PENDING.has(type) ? 'pending' : 'none'
  };
}

export function eventFromSnap(snap: Snap, writeTime?: number): ActivityEvent {
  const d = data(snap, writeTime);
  const push = d.push;
  return {
    id: snap.id,
    type: str(d.type) as EventType,
    actorId: str(d.actorId),
    taskId: strOrNull(d.taskId),
    taskTitle: strOrNull(d.taskTitle),
    targetId: strOrNull(d.targetId),
    createdAt: millisOr0(d.createdAt),
    push: push === 'pending' || push === 'sent' || push === 'skipped' ? push : 'none'
  };
}

// ── photos & treats & invites ─────────────────────────────────────────────────

export function photoFromSnap(snap: Snap, writeTime?: number): Photo {
  const d = data(snap, writeTime);
  return {
    id: snap.id,
    taskId: str(d.taskId),
    dataUrl: str(d.dataUrl),
    thumbDataUrl: str(d.thumbDataUrl),
    width: num(d.width),
    height: num(d.height),
    createdBy: str(d.createdBy),
    createdAt: millisOr0(d.createdAt)
  };
}

export function treatFromSnap(snap: Snap, writeTime?: number): EarnedTreat {
  const d = data(snap, writeTime);
  return {
    id: snap.id,
    treat: str(d.treat),
    target: num(d.target),
    filledAt: millisOr0(d.filledAt),
    redeemedAt: millis(d.redeemedAt)
  };
}

export function inviteFromSnap(snap: Snap, writeTime?: number): Invite {
  const d = data(snap, writeTime);
  return {
    code: snap.id,
    householdId: str(d.householdId),
    householdName: str(d.householdName),
    inviterName: str(d.inviterName),
    memberCount: num(d.memberCount, 1),
    createdBy: str(d.createdBy),
    createdAt: millisOr0(d.createdAt),
    expiresAt: millisOr0(d.expiresAt),
    revoked: bool(d.revoked)
  };
}
