// CONTRACT (Blueprint §3) — frozen in step 1.1. Do not edit; request changes via the orchestrator.
export type ISODate = string;            // 'YYYY-MM-DD', calendar date in Asia/Jerusalem
export type Millis = number;             // epoch ms; adapters convert Firestore Timestamps
export type Unsubscribe = () => void;
export type MemberColor = 'terracotta'|'sage'|'slate'|'plum'|'ochre'|'teal';
export type AddressAs = 'f'|'m'|'n';     // Hebrew verb forms: לוקחת / לוקח / לוקח/ת
export type Priority = 'normal'|'high'|'urgent';
export type CategoryId = 'car'|'shopping'|'home'|'health'|'finance'|'returns'|'family'|'other';
export type RecurrenceFreq = 'weekly'|'monthly'|'yearly';
export type Bucket = 'overdue'|'today'|'week'|'later';

export interface NotifyPrefs { requests: boolean; reminders: boolean; partnerDone: boolean; weekly: boolean }
export interface TreatJar { treat: string; target: number; count: number; round: number; startedAt: Millis }
export interface Household {
  id: string; name: string; memberIds: string[]; memberCount: number; maxMembers: number; // 6
  createdBy: string; createdAt: Millis; jar: TreatJar | null;
  invite: { code: string; expiresAt: Millis } | null;   // current active invite (members only see it)
}
export interface Member {
  uid: string; displayName: string; photoURL: string | null; color: MemberColor; addressAs: AddressAs;
  role: 'owner'|'member'; joinedAt: Millis; notify: NotifyPrefs; inviteCode: string | null;
}
export interface Completion { note: string; cost: number | null /* ₪ */; place: string; contact: string; photoIds: string[] /* ≤3 */ }
export interface Task {
  id: string; title: string; notes: string;
  categoryId: CategoryId | null; priority: Priority;
  ownerId: string | null;                 // null = "waiting for someone to take"
  requestedBy: string | null; requestedAt: Millis | null;   // set when someone asked the owner
  createdBy: string; createdAt: Millis; updatedBy: string; updatedAt: Millis;
  scheduledFor: ISODate | null;           // soft plan (היום / השבוע / date)
  weekPlan: boolean;                      // true: scheduledFor is the Saturday ending the planned week ("השבוע" / "בשבוע הבא") and is shown as a week, not a day
  dueDate: ISODate | null; dueTime: string | null /* 'HH:mm' */; hardDeadline: boolean;
  recurrence: { freq: RecurrenceFreq; anchor?: ISODate } | null; seriesId: string | null; // anchor = series base date (set on create/first completion; never shifted by snooze)
  status: 'open'|'done';
  snoozeCount: number; lastSnoozedAt: Millis | null;
  completedAt: Millis | null; completedBy: string | null; completion: Completion | null;
  pending?: boolean;                       // client-only: has unsynced local writes
}
export type TaskDraft = Pick<Task,'title'> & Partial<Pick<Task,'notes'|'categoryId'|'priority'|'ownerId'|'scheduledFor'|'weekPlan'|'dueDate'|'dueTime'|'hardDeadline'|'recurrence'>>;
export type TaskPatch = Partial<Pick<Task,'title'|'notes'|'categoryId'|'priority'|'scheduledFor'|'weekPlan'|'dueDate'|'dueTime'|'hardDeadline'|'recurrence'>>;
export type EventType = 'created'|'taken'|'requested'|'released'|'completed'|'reopened'|'snoozed'|'edited'|'deleted'|'jar_filled'|'jar_redeemed'|'member_joined';
export interface ActivityEvent {
  id: string; type: EventType; actorId: string; taskId: string | null; taskTitle: string | null;
  targetId: string | null; createdAt: Millis;
  push: 'pending'|'none'|'sent'|'skipped';  // client writes 'pending' for requested|completed|jar_filled, else 'none'
}
export interface EarnedTreat { id: string /* String(round) */; treat: string; target: number; filledAt: Millis; redeemedAt: Millis | null }
export interface Invite { code: string; householdId: string; householdName: string; inviterName: string; memberCount: number /* snapshot at creation: non-members cannot read the household */; createdBy: string; createdAt: Millis; expiresAt: Millis; revoked: boolean }
export interface InvitePreview { householdName: string; inviterName: string; memberCount: number }
export interface DeviceToken { deviceId: string; householdId: string; token: string; userAgent: string; createdAt: Millis; updatedAt: Millis }
export interface Photo { id: string; taskId: string; dataUrl: string /* jpeg ≤ ~270k chars */; thumbDataUrl: string /* ≤ 20k */; width: number; height: number; createdBy: string; createdAt: Millis }
export interface EncodedPhoto { dataUrl: string /* jpeg data URL ≤ 300k chars */; thumbDataUrl: string /* ≤ 20k chars */; width: number; height: number } // produced by platform/image.ts (client-side canvas); adapters only store it
export interface Category { id: CategoryId; label: string; short: string /* ≤ 8 chars, for card meta rows */; icon: string /* lucide name */; keywords: string[] }
export interface AuthUser { uid: string; displayName: string; email: string; photoURL: string | null }
export type SyncState = { status: 'synced'|'saving'|'offline'; pendingWrites: number };
