// Mirrors of the app's frozen domain types (src/lib/domain/types.ts, Blueprint §3), copied because
// the notifier is its own package and must not import from src/. Field names are identical.
// Firestore stores every `*At` as a Timestamp; load.ts converts them to epoch millis, so `Millis`
// here means the same thing it means in the app. Only the fields the notifier reads are required
// to be meaningful; the rest are carried along unchanged.

export type ISODate = string; // 'YYYY-MM-DD', calendar date in Asia/Jerusalem
export type Millis = number; // epoch ms
export type MemberColor = 'terracotta' | 'sage' | 'slate' | 'plum' | 'ochre' | 'teal';
export type AddressAs = 'f' | 'm' | 'n'; // female / male / neutral Hebrew verb forms
export type Priority = 'normal' | 'high' | 'urgent';
export type CategoryId =
  'car' | 'shopping' | 'home' | 'health' | 'finance' | 'returns' | 'family' | 'other';
export type RecurrenceFreq = 'weekly' | 'monthly' | 'yearly';

export interface NotifyPrefs {
  requests: boolean;
  reminders: boolean;
  partnerDone: boolean;
  weekly: boolean;
}

export interface TreatJar {
  treat: string;
  target: number;
  count: number;
  round: number;
  startedAt: Millis;
}

export interface Household {
  id: string;
  name: string;
  memberIds: string[];
  memberCount: number;
  maxMembers: number;
  createdBy: string;
  createdAt: Millis;
  jar: TreatJar | null;
  invite: { code: string; expiresAt: Millis } | null;
}

export interface Member {
  uid: string;
  displayName: string;
  photoURL: string | null;
  color: MemberColor;
  addressAs: AddressAs;
  role: 'owner' | 'member';
  joinedAt: Millis;
  notify: NotifyPrefs;
  inviteCode: string | null;
}

export interface Completion {
  note: string;
  cost: number | null;
  place: string;
  contact: string;
  photoIds: string[];
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  categoryId: CategoryId | null;
  priority: Priority;
  ownerId: string | null; // null = waiting for someone to take it
  requestedBy: string | null;
  requestedAt: Millis | null;
  createdBy: string;
  createdAt: Millis;
  updatedBy: string;
  updatedAt: Millis;
  scheduledFor: ISODate | null;
  dueDate: ISODate | null;
  dueTime: string | null; // 'HH:mm'
  hardDeadline: boolean;
  recurrence: { freq: RecurrenceFreq; anchor?: ISODate } | null;
  seriesId: string | null;
  status: 'open' | 'done';
  snoozeCount: number;
  lastSnoozedAt: Millis | null;
  completedAt: Millis | null;
  completedBy: string | null;
  completion: Completion | null;
}

export type EventType =
  | 'created'
  | 'taken'
  | 'requested'
  | 'released'
  | 'completed'
  | 'reopened'
  | 'snoozed'
  | 'edited'
  | 'deleted'
  | 'jar_filled'
  | 'jar_redeemed'
  | 'member_joined';

export interface ActivityEvent {
  id: string;
  type: EventType;
  actorId: string;
  taskId: string | null;
  taskTitle: string | null;
  targetId: string | null;
  createdAt: Millis;
  /** The client writes 'pending' for requested | completed | jar_filled, else 'none'. */
  push: 'pending' | 'none' | 'sent' | 'skipped';
}

/** users/{uid}/devices/{deviceId} */
export interface DeviceToken {
  deviceId: string;
  householdId: string;
  token: string;
  userAgent: string;
  createdAt: Millis;
  updatedAt: Millis;
}
