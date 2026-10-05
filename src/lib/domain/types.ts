// CONTRACT (Blueprint §3) — frozen in step 1.1. Do not edit; request changes via the orchestrator.
export type ISODate = string;            // 'YYYY-MM-DD', calendar date in Asia/Jerusalem
export type Millis = number;             // epoch ms; adapters convert Firestore Timestamps
export type Unsubscribe = () => void;
export type MemberColor = 'terracotta'|'sage'|'slate'|'plum'|'ochre'|'teal';
export type AddressAs = 'f'|'m'|'n';     // Hebrew verb forms: לוקחת / לוקח / לוקח/ת
export type Priority = 'normal'|'high'|'urgent';
export type CategoryId = 'car'|'shopping'|'home'|'health'|'finance'|'returns'|'family'|'other';
export type RecurrenceFreq = 'daily'|'weekly'|'monthly'|'yearly';
/** interval: every N periods (whole 1..99, missing = 1). weekdays: 0 = Sunday … 6 = Saturday, sorted and unique, weekly only (missing = the anchor's weekday). anchor: the series base date (set on create/first completion; never shifted by snooze). See domain/recurrence.ts. */
export interface Recurrence { freq: RecurrenceFreq; interval?: number; weekdays?: number[]; anchor?: ISODate }
export type Bucket = 'overdue'|'today'|'week'|'later';

export interface NotifyPrefs { requests: boolean; reminders: boolean; partnerDone: boolean; weekly: boolean }
/** The jar's goal: 'together' = `target` tasks in total by anyone; 'each' = every member closes their `share` (domain/jar.ts). */
export type JarMode = 'together'|'each';
/** mode missing = 'together' (jars set up before goal modes). share: 'each' only, 1..20. counts: completions per member uid this round (missing = none recorded yet); in 'each' mode `count` = Σ min(counts, share) and `target` = share × members for the previous app version. */
export interface TreatJar { treat: string; target: number; count: number; round: number; startedAt: Millis; mode?: JarMode; share?: number; counts?: Record<string, number> }
export interface Household {
  id: string; name: string; memberIds: string[]; memberCount: number; maxMembers: number; // 6
  createdBy: string; createdAt: Millis; jar: TreatJar | null;
  invite: { code: string; expiresAt: Millis } | null;   // current active invite (members only see it)
  nextJarRound?: number;                  // written by deleteJar (the deleted jar's round, which earned no treat): a new jar starts at it, so treats/{round} never collide. Missing = 1 (domain/jar.ts freshJarRound)
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
  requestedBy: string | null; requestedAt: Millis | null;   // who asked, and when (kept as history once accepted)
  requestedOf?: string | null;            // the asked member while the request waits for an answer (ownerId null); missing = null (domain/requests.ts)
  createdBy: string; createdAt: Millis; updatedBy: string; updatedAt: Millis;
  scheduledFor: ISODate | null;           // soft plan (היום / השבוע / date)
  weekPlan: boolean;                      // true: scheduledFor is the Saturday ending the planned week ("השבוע" / "בשבוע הבא") and is shown as a week, not a day
  dueDate: ISODate | null; dueTime: string | null /* 'HH:mm' */; hardDeadline: boolean;
  recurrence: Recurrence | null; seriesId: string | null; // anchor = series base date (set on create/first completion; never shifted by snooze)
  status: 'open'|'done';
  snoozeCount: number; lastSnoozedAt: Millis | null;
  completedAt: Millis | null; completedBy: string | null; completion: Completion | null;
  pending?: boolean;                       // client-only: has unsynced local writes
}
export type TaskDraft = Pick<Task,'title'> & Partial<Pick<Task,'notes'|'categoryId'|'priority'|'ownerId'|'scheduledFor'|'weekPlan'|'dueDate'|'dueTime'|'hardDeadline'|'recurrence'>>;
export type TaskPatch = Partial<Pick<Task,'title'|'notes'|'categoryId'|'priority'|'scheduledFor'|'weekPlan'|'dueDate'|'dueTime'|'hardDeadline'|'recurrence'>>;
export type EventType = 'created'|'taken'|'requested'|'released'|'completed'|'reopened'|'snoozed'|'edited'|'deleted'|'jar_filled'|'jar_redeemed'|'member_joined'
  |'accepted'|'declined';                 // the asked member's answer to a request (targetId = the requester)
export interface ActivityEvent {
  id: string; type: EventType; actorId: string; taskId: string | null; taskTitle: string | null;
  targetId: string | null; createdAt: Millis;
  push: 'pending'|'none'|'sent'|'skipped';  // client writes 'pending' for requested|accepted|declined|completed|jar_filled, else 'none'
}
export interface EarnedTreat { id: string /* String(round) */; treat: string; target: number; filledAt: Millis; redeemedAt: Millis | null; mode?: JarMode; share?: number; counts?: Record<string, number> /* the round's jar at redeem: who took part (missing on older treats) */ }
export interface Invite { code: string; householdId: string; householdName: string; inviterName: string; memberCount: number /* snapshot at creation: non-members cannot read the household */; createdBy: string; createdAt: Millis; expiresAt: Millis; revoked: boolean }
export interface InvitePreview { householdName: string; inviterName: string; memberCount: number }
export interface DeviceToken { deviceId: string; householdId: string; token: string; userAgent: string; createdAt: Millis; updatedAt: Millis }
export interface Photo { id: string; taskId: string; dataUrl: string /* jpeg ≤ ~270k chars */; thumbDataUrl: string /* ≤ 20k */; width: number; height: number; createdBy: string; createdAt: Millis }
export interface EncodedPhoto { dataUrl: string /* jpeg data URL ≤ 300k chars */; thumbDataUrl: string /* ≤ 20k chars */; width: number; height: number } // produced by platform/image.ts (client-side canvas); adapters only store it
export interface Category { id: CategoryId; label: string; short: string /* ≤ 8 chars, for card meta rows */; icon: string /* lucide name */; keywords: string[] }
export interface AuthUser { uid: string; displayName: string; email: string; photoURL: string | null }
export type SyncState = { status: 'synced'|'saving'|'offline'; pendingWrites: number };
