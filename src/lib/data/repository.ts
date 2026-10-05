// CONTRACT (Blueprint §5) — frozen in step 1.1. Do not edit; request changes via the orchestrator.
import type {
  ActivityEvent, AddressAs, AuthUser, Completion, DeviceToken, EarnedTreat, Household, Invite,
  InvitePreview, ISODate, Member, MemberColor, Photo, SyncState, Task, TaskDraft, TaskPatch, Unsubscribe, EncodedPhoto
} from '../domain/types';

export class RepoError extends Error { constructor(public code: 'not-found'|'expired'|'revoked'|'full'|'already-member'|'permission'|'popup-blocked'|'network'|'conflict'|'unknown', msg?: string) { super(msg ?? code); } }
export type TakeResult = { ok: true } | { ok: false; takenBy: string };
export interface CompleteResult { nextTaskId: string | null; jarFilled: boolean }
export interface NewMemberProfile { displayName: string; photoURL: string | null; color: MemberColor; addressAs: AddressAs }
export interface Repository {
  readonly kind: 'demo'|'firebase';
  onAuthChange(cb: (u: AuthUser | null) => void): Unsubscribe;
  signInWithGoogle(): Promise<void>;           // popup → redirect fallback; throws RepoError('popup-blocked'|'network')
  signOut(): Promise<void>;
  getMyHouseholdId(): Promise<string | null>;
  createHousehold(name: string, me: NewMemberProfile): Promise<string>;
  previewInvite(code: string): Promise<InvitePreview>;
  joinHousehold(code: string, me: NewMemberProfile): Promise<string>;
  createInvite(hid: string): Promise<Invite>;  // revokes the previous active invite
  revokeInvite(hid: string, code: string): Promise<void>;
  leaveHousehold(hid: string): Promise<void>;
  watchHousehold(hid: string, cb: (h: Household) => void): Unsubscribe;
  watchMembers(hid: string, cb: (m: Member[]) => void): Unsubscribe;
  updateHousehold(hid: string, patch: { name?: string }): Promise<void>;
  updateMember(hid: string, patch: Partial<Pick<Member,'displayName'|'color'|'addressAs'|'notify'>>): Promise<void>;
  watchOpenTasks(hid: string, cb: (t: Task[]) => void): Unsubscribe;
  watchDoneTasks(hid: string, limit: number, cb: (t: Task[], hasMore: boolean) => void): Unsubscribe;
  watchTask(hid: string, id: string, cb: (t: Task | null) => void): Unsubscribe;
  createTask(hid: string, d: TaskDraft): string;                 // sync id; write queued
  updateTask(hid: string, id: string, p: TaskPatch): void;
  takeTask(hid: string, id: string): Promise<TakeResult>;        // tx online; batch offline. Clears any waiting request; by the asked member it is acceptRequest
  requestTask(hid: string, id: string, toUid: string): void;     // a proposal (domain/requests.ts): ownerId=null, requestedOf=to, requestedBy=me, 'requested' event; to myself = take
  acceptRequest(hid: string, id: string): Promise<TakeResult>;   // the asked member: ownerId=me, requestedOf=null (requestedBy/At kept), 'accepted' event → requester. Same tx/answers as takeTask (a request gone meanwhile = a plain take)
  declineRequest(hid: string, id: string): void;                 // the asked member: requestedOf/By/At=null (waits for anyone), 'declined' event → requester. Nothing waiting for me: no-op
  cancelRequest(hid: string, id: string): void;                  // the asker (or the asked member): requestedOf/By/At=null, 'released' event (targetId = the asked member). Nothing waiting: no-op
  releaseTask(hid: string, id: string): void;                    // ownerId=null; on a request that waits it is cancelRequest
  snoozeTask(hid: string, id: string, until: ISODate): void;     // applies domain snoozePatch(task, until, now): moves the effective date (see Blueprint §3), snoozeCount+1
  completeTask(hid: string, id: string, c: Omit<Completion,'photoIds'>, photos: EncodedPhoto[]): Promise<CompleteResult>; // photos already compressed+thumbnailed by platform/image.ts; ≤3 stored
  reopenTask(hid: string, id: string): void;                     // undo: status open, jar −1, delete auto-created next instance if untouched
  deleteTask(hid: string, id: string): void;                     // UI delays call 5s for Undo
  getPhoto(hid: string, photoId: string): Promise<Photo | null>;
  setJar(hid: string, j: { treat: string; target: number }): void;
  redeemJar(hid: string): void;                                  // writes treats/{round}, resets jar
  watchTreats(hid: string, cb: (t: EarnedTreat[]) => void): Unsubscribe;
  watchRecentEvents(hid: string, limit: number, cb: (e: ActivityEvent[]) => void): Unsubscribe;
  registerDevice(d: Omit<DeviceToken,'createdAt'|'updatedAt'>): Promise<void>;
  unregisterDevice(deviceId: string): Promise<void>;
  watchSync(cb: (s: SyncState) => void): Unsubscribe;
  onWriteError(cb: (e: RepoError) => void): Unsubscribe;          // async failures of queued writes
}
