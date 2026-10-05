// The Firebase Repository (Blueprint §5, owner step 2.2): the same semantics as the demo adapter,
// proven by the shared contract suite (tests/contract/repositoryContract.ts) against the emulators
// with firestore.rules enforced. Stored shapes and batches follow docs/firestore-schema.md exactly.
//
// WRITES
//  - Every mutation and its ActivityEvent go in ONE writeBatch (or transaction).
//  - All writes pass through one serial chain, so they reach Firestore in call order even when a
//    write must first read the current document (e.g. snooze needs the due date). Void/string
//    methods return at once; the chain commits the batch (Firestore applies it locally at once and
//    queues it for the server, offline included) and a later server rejection goes to onWriteError.
//  - takeTask / completeTask run a transaction when online (double take → {ok:false, takenBy};
//    double complete → RepoError('conflict')). Before it, pending writes are flushed (a transaction
//    reads the server, not local pending writes). Offline, or when the server cannot be reached in
//    time, they fall back to a writeBatch computed from the local cache. CAVEAT (offline path):
//    last write wins. Two people taking the same task offline both see success; the later commit
//    owns it on the server. Two offline completions of the same task both commit: the jar counts
//    twice and two `completed` events are written (the rules cannot tell; this is the documented
//    trade-off for working without a connection).
//  - Household-level writes (create/join/invite/leave) resolve on the server acknowledgement.
//    updateHousehold / updateMember / registerDevice / unregisterDevice resolve on the ack too, but
//    no later than SOFT_ACK_MS (or at once when offline); a later failure goes to onWriteError.
//
// READS FOR WRITES (readDoc)
//  - A document held by one of this repo's active listeners is fresh in the local cache: read the
//    cache (instant, includes my own queued writes, works offline).
//  - Otherwise, online: getDoc (server state + my queued writes), with a timeout falling back to
//    the cache. Offline: the cache, else RepoError('network').
//  - After a transaction (which bypasses the local cache) its documents are read from the server
//    for a while, until the listeners have caught up.
//
// SYNC: watchSync = navigator online/offline + pending writes, re-evaluated on onSnapshotsInSync.
// Pending = this repo's queued/in-flight writes, or (when more) the documents the task listeners
// still see with hasPendingWrites: Firestore keeps unsent writes across a reload, which this
// instance never made but which still wait to be sent. Offline-safe throughout: nothing here needs
// the network to accept a task write.

import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocFromCache,
  getDocFromServer,
  getDocs,
  getDocsFromCache,
  increment,
  limit as limitTo,
  onSnapshot,
  onSnapshotsInSync,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  waitForPendingWrites,
  where,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type QuerySnapshot,
  type SetOptions,
  type WriteBatch
} from 'firebase/firestore';
import { signOut as firebaseSignOut } from 'firebase/auth';
import {
  RepoError,
  type CompleteResult,
  type NewMemberProfile,
  type Repository,
  type TakeResult
} from '../repository';
import { sortTasks } from '../../domain/buckets';
import { isoDateAt, isValidISO, todayISO } from '../../domain/dates';
import { inviteCode, isInviteCode } from '../../domain/ids';
import {
  applyCompletion,
  backfillAllowed,
  completionStep,
  isFull,
  modeOf,
  reopenStep,
  type JarSettings
} from '../../domain/jar';
import { buildNextInstance, ensureAnchor, ruleOf, sameRule } from '../../domain/recurrence';
import { pendingRequestOf } from '../../domain/requests';
import { snoozePatch } from '../../domain/snooze';
import type {
  ActivityEvent,
  AuthUser,
  Completion,
  EarnedTreat,
  EncodedPhoto,
  Household,
  Invite,
  InvitePreview,
  ISODate,
  Member,
  NotifyPrefs,
  Photo,
  SyncState,
  Task,
  TaskDraft,
  TaskPatch,
  TreatJar,
  Unsubscribe
} from '../../domain/types';
import type { FirebaseExtras, FirebaseRepoOptions, FirebaseWebConfig } from './index';
import { disposeFirebase, initFirebase } from './init';
import {
  consumeRedirectResult,
  signInWithGoogle as googleSignIn,
  signInWithTestCredentialImpl,
  watchAuth
} from './auth';
import {
  eventDoc,
  eventFromSnap,
  householdFromSnap,
  inviteFromSnap,
  jarStartPending,
  memberDoc,
  memberFromSnap,
  newTaskDoc,
  photoFromSnap,
  recurrenceDoc,
  taskFromSnap,
  touch,
  treatFromSnap,
  type MemberWrite,
  type TaskContent
} from './converters';
import { isCancelled, isUnavailable, toRepoError } from './errors';
import {
  assertAddressAs,
  assertColor,
  assertValidCompletion,
  assertValidPhoto,
  assertValidTask,
  cleanDisplayName,
  cleanHouseholdName,
  cleanJar,
  cleanNotify,
  invalid,
  safePhotoURL
} from './validate';

// ── constants ─────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const INVITE_TTL_MS = 7 * DAY_MS;
/** expiresAt is a client-clock value; the rules cap it at server time + 7 d, so leave a margin. */
const INVITE_SKEW_MS = 10 * 60_000;
const MAX_MEMBERS = 6;
const MAX_PHOTOS = 3;
/** A server read for a write gives up (and tries the cache) after this long. */
const READ_TIMEOUT_MS = 5_000;
/** How long a transaction waits for earlier writes to reach the server before going offline-style. */
const FLUSH_TIMEOUT_MS = 4_000;
/** Soft acknowledgement deadline for the "settings" writes (see the header). */
const SOFT_ACK_MS = 8_000;
/** Before switching users (tests) the previous user's writes get this long to reach the server. */
const SWITCH_FLUSH_MS = 10_000;
/** After a transaction, its documents are read from the server for this long. */
const SERVER_READS_AFTER_TX_MS = 10_000;
/** Online, a household snapshot whose new jar.startedAt is not stamped yet waits this long for it. */
const JAR_STAMP_WAIT_MS = 3_000;
/** A write's client time is kept this long after its ack (snapshots raised before it may lag). */
const WRITE_TIME_TTL_MS = 5_000;

const ALL_NOTIFY_ON: NotifyPrefs = {
  requests: true,
  reminders: true,
  partnerDone: true,
  weekly: true
};

const TASK_PATCH_KEYS = [
  'title',
  'notes',
  'categoryId',
  'priority',
  'scheduledFor',
  'weekPlan',
  'dueDate',
  'dueTime',
  'hardDeadline',
  'recurrence'
] as const satisfies readonly (keyof TaskPatch)[];

/**
 * Compared (besides updatedAt === createdAt, i.e. never written since its creation) to decide
 * whether an auto-created next instance is untouched. ownerId is left out: it is written as null
 * when the owner has left the household.
 */
const INSTANCE_CONTENT_KEYS = [
  'title',
  'notes',
  'categoryId',
  'priority',
  'requestedBy',
  'scheduledFor',
  'weekPlan',
  'dueDate',
  'dueTime',
  'hardDeadline',
  'recurrence',
  'seriesId',
  'status',
  'snoozeCount'
] as const satisfies readonly (keyof Task)[];

// ── small helpers ─────────────────────────────────────────────────────────────

/** Both WriteBatch and Transaction. Method syntax keeps the overloads assignable. */
interface Writer {
  set(ref: DocumentReference, data: DocumentData): unknown;
  update(ref: DocumentReference, data: DocumentData): unknown;
  delete(ref: DocumentReference): unknown;
}

/** A WriteBatch that remembers the documents it writes (for pending-timestamp estimates). */
class TrackedBatch implements Writer {
  readonly paths = new Set<string>();
  constructor(readonly batch: WriteBatch) {}
  set(ref: DocumentReference, data: DocumentData, options?: SetOptions): this {
    this.paths.add(ref.path);
    if (options) this.batch.set(ref, data, options);
    else this.batch.set(ref, data);
    return this;
  }
  update(ref: DocumentReference, data: DocumentData): this {
    this.paths.add(ref.path);
    this.batch.update(ref, data);
    return this;
  }
  delete(ref: DocumentReference): this {
    this.paths.add(ref.path);
    this.batch.delete(ref);
    return this;
  }
}

/** A uid usable as a dotted field-path segment (`jar.counts.<uid>`): Firebase uids always are. */
const FIELD_KEY_RE = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * The household update of a completion by `uid` (domain completionStep): the completer's tally
 * +1 and, when the completion fills the jar, `jar.count` +1. Increments, so concurrent completions
 * by different members both land.
 */
function completionJarWrite(jar: TreatJar, uid: string): DocumentData {
  if (!FIELD_KEY_RE.test(uid)) return { 'jar.count': increment(1) }; // the classic write
  return {
    [`jar.counts.${uid}`]: increment(1),
    ...(completionStep(jar, uid).count ? { 'jar.count': increment(1) } : {})
  };
}

/** The household update undoing a completion by `completer` (domain reopenStep), or null. */
function reopenJarWrite(
  jar: TreatJar,
  completer: string | null,
  memberIds: readonly string[]
): DocumentData | null {
  const step = reopenStep(jar, completer, memberIds);
  const data: DocumentData = {};
  if (step.tally && completer !== null && FIELD_KEY_RE.test(completer)) {
    data[`jar.counts.${completer}`] = increment(-1);
  }
  if (step.count) data['jar.count'] = increment(-1);
  return Object.keys(data).length > 0 ? data : null;
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** JSON with sorted object keys (Firestore does not preserve map key order). */
function canonical(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : val
  );
}

function pickDefined<T extends object, K extends keyof T>(
  src: T,
  keys: readonly K[]
): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {};
  for (const k of keys) if (src[k] !== undefined) out[k] = src[k];
  return out;
}

/** The object without its `undefined` values (Firestore rejects them in a write). */
function definedOnly<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

const ownDate = (t: Pick<Task, 'dueDate' | 'scheduledFor'>): ISODate | null =>
  t.dueDate ?? t.scheduledFor;

/**
 * The recurrence after an edit (same composition of ensureAnchor as the demo adapter): an explicit
 * anchor in the patch wins; a change of the instance's own date or of the rule (frequency, interval
 * or days) is a re-plan, so the anchor is re-derived; anything else keeps the series' anchor.
 */
function recurrenceAfterEdit(before: Task, patch: TaskPatch, merged: Task): Task['recurrence'] {
  const rec = merged.recurrence;
  if (rec === null) return null;
  if (patch.recurrence?.anchor !== undefined) return ensureAnchor(merged);
  const replanned = !sameRule(before.recurrence, rec) || ownDate(before) !== ownDate(merged);
  return ensureAnchor({
    ...merged,
    recurrence: replanned ? ruleOf(rec) : before.recurrence
  });
}

function isUntouchedInstance(actual: Task, expected: Task): boolean {
  return (
    actual.updatedAt === actual.createdAt &&
    (actual.ownerId === expected.ownerId || actual.ownerId === null) &&
    INSTANCE_CONTENT_KEYS.every((k) => canonical(actual[k]) === canonical(expected[k]))
  );
}

function memberWrite(
  me: NewMemberProfile,
  role: Member['role'],
  inviteCodeUsed: string | null
): MemberWrite {
  assertColor(me.color);
  assertAddressAs(me.addressAs);
  return {
    displayName: cleanDisplayName(me.displayName),
    photoURL: safePhotoURL(me.photoURL),
    color: me.color,
    addressAs: me.addressAs,
    role,
    notify: { ...ALL_NOTIFY_ON },
    inviteCode: inviteCodeUsed
  };
}

const notFound = (what: string) => new RepoError('not-found', `${what} does not exist`);

// ── the repository ────────────────────────────────────────────────────────────

export async function createFirebaseRepositoryImpl(
  cfg: FirebaseWebConfig,
  opts: FirebaseRepoOptions
): Promise<Repository & FirebaseExtras> {
  const h = initFirebase(cfg, opts);
  const db = h.firestore;
  const auth = h.auth;
  let disposed = false;

  // refs
  const hhRef = (hid: string) => doc(db, 'households', hid);
  const memberRef = (hid: string, uid: string) => doc(db, 'households', hid, 'members', uid);
  const tasksCol = (hid: string) => collection(db, 'households', hid, 'tasks');
  const taskRef = (hid: string, id: string) => doc(db, 'households', hid, 'tasks', id);
  const eventsCol = (hid: string) => collection(db, 'households', hid, 'events');
  const photoRef = (hid: string, id: string) => doc(db, 'households', hid, 'photos', id);
  const treatsCol = (hid: string) => collection(db, 'households', hid, 'treats');
  const inviteRef = (code: string) => doc(db, 'invites', code);
  const userRef = (uid: string) => doc(db, 'users', uid);
  const devicesCol = (uid: string) => collection(db, 'users', uid, 'devices');
  const newEventRef = (hid: string) => doc(eventsCol(hid));
  const newBatch = () => new TrackedBatch(writeBatch(db));

  // ── write errors ───────────────────────────────────────────────────────────

  const errorSubs = new Set<(e: RepoError) => void>();
  /** Errors raised before anyone listened (a failed redirect sign-in at boot). */
  const undelivered: RepoError[] = [];

  function deliverError(err: RepoError, cbs: Iterable<(e: RepoError) => void>): void {
    for (const cb of cbs) {
      try {
        cb(err);
      } catch (x) {
        console.error('[firebase] an onWriteError callback threw', x);
      }
    }
  }

  function reportWriteError(e: unknown, keepUntilHeard = false): void {
    const err = toRepoError(e);
    queueMicrotask(() => {
      if (errorSubs.size > 0) return deliverError(err, [...errorSubs]);
      if (keepUntilHeard) undelivered.push(err);
      else console.warn('[firebase] a queued write failed', err);
    });
  }

  // ── sync state ─────────────────────────────────────────────────────────────

  let queuedWrites = 0; // in the chain, not yet committed (or a transaction running)
  let inflightWrites = 0; // committed locally, waiting for the server
  /** Doc path → listeners showing it with hasPendingWrites (metadata-change listeners only). */
  const pendingDocs = new Map<string, number>();
  const syncSubs = new Set<(s: SyncState) => void>();
  let lastSync = '';
  let syncScheduled = false;
  let stopInSync: Unsubscribe | null = null;

  const online = (): boolean => typeof navigator === 'undefined' || navigator.onLine !== false;

  function syncState(): SyncState {
    // Max, not sum: my own writes show up in the listeners too.
    const pendingWrites = Math.max(queuedWrites + inflightWrites, pendingDocs.size);
    return {
      status: !online() ? 'offline' : pendingWrites > 0 ? 'saving' : 'synced',
      pendingWrites
    };
  }

  function emitSync(): void {
    if (syncScheduled || syncSubs.size === 0) return;
    syncScheduled = true;
    queueMicrotask(() => {
      syncScheduled = false;
      const s = syncState();
      const key = `${s.status}:${s.pendingWrites}`;
      if (key === lastSync) return;
      lastSync = key;
      for (const cb of [...syncSubs]) {
        try {
          cb(s);
        } catch (x) {
          console.error('[firebase] a watchSync callback threw', x);
        }
      }
    });
  }

  const onNetworkChange = () => emitSync();
  const hasWindow = typeof window !== 'undefined' && typeof window.addEventListener === 'function';
  if (hasWindow) {
    window.addEventListener('online', onNetworkChange);
    window.addEventListener('offline', onNetworkChange);
  }

  // ── the write chain ────────────────────────────────────────────────────────

  let chain: Promise<unknown> = Promise.resolve();

  /** Runs `fn` after every earlier write has been prepared and committed locally. */
  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    queuedWrites++;
    emitSync();
    const run = chain.then(() => {
      if (disposed) throw new RepoError('unknown', 'the repository was disposed');
      return fn();
    });
    const done = run.finally(() => {
      queuedWrites--;
      emitSync();
    });
    chain = done.catch(() => undefined);
    return done;
  }

  /** Doc path → client time of this repo's latest write to it (better pending-timestamp estimates). */
  const writeTimes = new Map<string, number>();
  const writeTimeOf = (snap: DocumentSnapshot): number | undefined =>
    snap.metadata.hasPendingWrites ? writeTimes.get(snap.ref.path) : undefined;

  /** Commits (applied locally at once, sent when possible); resolves on the server ack. */
  function commit(b: TrackedBatch): Promise<void> {
    const at = Date.now();
    for (const path of b.paths) writeTimes.set(path, at);
    inflightWrites++;
    emitSync();
    const p = b.batch.commit();
    const settled = () => {
      inflightWrites--;
      emitSync();
      setTimeout(() => {
        for (const path of b.paths) if (writeTimes.get(path) === at) writeTimes.delete(path);
      }, WRITE_TIME_TTL_MS);
    };
    void p.then(settled, settled);
    return p;
  }

  /** Fire-and-forget commit: a rejection goes to `onError` (default: onWriteError). */
  function commitQueued(
    b: TrackedBatch,
    onError: (e: unknown) => void = (e) => reportWriteError(e)
  ): void {
    commit(b).catch(onError);
  }

  /** A void write: prepared in order (reads allowed), committed, failures → onWriteError. */
  function queued(prepare: (uid: string) => Promise<TrackedBatch | null>): void {
    enqueue(async () => {
      const b = await prepare(requireUid());
      if (b) commitQueued(b);
    }).catch((e: unknown) => reportWriteError(e));
  }

  /** Awaits the ack, but at most SOFT_ACK_MS (not at all offline); a late failure → onWriteError. */
  async function settle(ack: Promise<void>): Promise<void> {
    if (!online()) {
      ack.catch((e: unknown) => reportWriteError(e));
      return;
    }
    let late = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    ack.catch((e: unknown) => {
      if (late) reportWriteError(e);
    });
    try {
      await Promise.race([
        ack,
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            late = true;
            resolve();
          }, SOFT_ACK_MS);
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Lets queued writes reach the server (user switch / sign-out). Never throws. */
  async function flushWrites(ms: number): Promise<void> {
    await chain;
    if (!auth.currentUser || !online()) return;
    try {
      await withTimeout(waitForPendingWrites(db), ms, () => new Error('flush timeout'));
    } catch {
      // still pending: they stay queued for this user
    }
  }

  // ── reads for writes ───────────────────────────────────────────────────────

  /** Doc path → number of active listeners currently holding it (so the cache copy is fresh). */
  const live = new Map<string, number>();
  /** Doc path → until when it must be read from the server (written by a transaction). */
  const serverReadsUntil = new Map<string, number>();

  function retain(path: string): void {
    live.set(path, (live.get(path) ?? 0) + 1);
  }
  function release(path: string): void {
    const n = (live.get(path) ?? 0) - 1;
    if (n > 0) live.set(path, n);
    else live.delete(path);
  }

  function markServerReads(refs: (DocumentReference | null)[]): void {
    const until = Date.now() + SERVER_READS_AFTER_TX_MS;
    for (const r of refs) if (r) serverReadsUntil.set(r.path, until);
  }

  async function fromCache(ref: DocumentReference): Promise<DocumentSnapshot | null> {
    try {
      return await getDocFromCache(ref);
    } catch {
      return null; // not in the cache at all
    }
  }

  /** See READS FOR WRITES in the header. */
  async function readDoc(ref: DocumentReference): Promise<DocumentSnapshot> {
    const path = ref.path;
    const fresh = (live.get(path) ?? 0) > 0 && (serverReadsUntil.get(path) ?? 0) <= Date.now();
    if (fresh || !online()) {
      const cached = await fromCache(ref);
      if (cached) return cached;
      if (!online()) throw new RepoError('network', `offline, and ${path} is not cached`);
    }
    try {
      return await withTimeout(
        getDoc(ref),
        READ_TIMEOUT_MS,
        () => new RepoError('network', `reading ${path} timed out`)
      );
    } catch (e) {
      const err = toRepoError(e);
      if (err.code === 'network') {
        const cached = await fromCache(ref);
        if (cached) return cached;
      }
      throw err;
    }
  }

  async function mustReadTask(hid: string, id: string): Promise<Task> {
    const snap = await readDoc(taskRef(hid, id));
    if (!snap.exists()) throw notFound(`task ${id}`);
    return taskFromSnap(snap, writeTimeOf(snap));
  }

  async function mustReadHousehold(hid: string): Promise<Household> {
    const snap = await readDoc(hhRef(hid));
    if (!snap.exists()) throw notFound(`household ${hid}`);
    return householdFromSnap(snap, writeTimeOf(snap));
  }

  /**
   * A transaction bypasses the local cache, so the cached copies of what it wrote are stale until
   * a listener catches up; a new listener would first show them. Read them back from the server
   * (which refreshes the cache); any that cannot be read are read from the server for a while.
   */
  async function refreshFromServer(refs: (DocumentReference | null)[]): Promise<void> {
    await Promise.all(
      refs.map(async (ref) => {
        if (!ref) return;
        try {
          await withTimeout(getDocFromServer(ref), READ_TIMEOUT_MS, () => new Error('timeout'));
        } catch {
          markServerReads([ref]);
        }
      })
    );
  }

  /** The household if it can be read now (offline and uncached → null). */
  async function tryReadHousehold(hid: string): Promise<Household | null> {
    try {
      return await mustReadHousehold(hid);
    } catch (e) {
      if (isUnavailable(e)) return null;
      throw e;
    }
  }

  /** Online and earlier writes have reached the server, so a transaction can run. */
  async function canTransact(): Promise<boolean> {
    if (!online()) return false;
    try {
      await withTimeout(waitForPendingWrites(db), FLUSH_TIMEOUT_MS, () => new Error('flush'));
      return true;
    } catch {
      return false;
    }
  }

  // ── listeners ──────────────────────────────────────────────────────────────

  const listeners = new Set<Unsubscribe>();
  const authSubs = new Set<Unsubscribe>();

  function deliver(fn: () => void): void {
    try {
      fn();
    } catch (x) {
      console.error('[firebase] a watcher callback threw', x);
    }
  }

  function listenerFailed(path: string, e: unknown): void {
    const err = toRepoError(e);
    // Expected after leaving a household or switching accounts: the watcher just goes quiet.
    if (err.code === 'permission') console.info(`[firebase] no access to ${path}; watcher stopped`);
    else console.warn(`[firebase] watcher of ${path} stopped`, e);
  }

  /** `${uid}\u0000${hid}` pairs confirmed as memberships this session (see `register`). */
  const knownMembers = new Set<string>();
  const memberKey = (uid: string, hid: string) => `${uid}\u0000${hid}`;

  /** Is `uid` a member of `hid` as far as this device knows (confirmed, or a cached member doc)? */
  async function vouchFor(hid: string, uid: string): Promise<boolean> {
    if (knownMembers.has(memberKey(uid, hid))) return true;
    const cached = await fromCache(memberRef(hid, uid));
    if (!cached?.exists()) return false;
    knownMembers.add(memberKey(uid, hid));
    return true;
  }

  interface Emission {
    /** Documents in the snapshot (they count as live once shown). */
    paths: string[];
    /** Those with writes not yet on the server (only from includeMetadataChanges listeners). */
    pendingPaths: string[];
    fromCache: boolean;
    emit: () => void;
  }

  /** Paths whose pending state is reported by a listener that also hears when it clears. */
  const pendingOf = (docs: DocumentSnapshot[], includeMetadataChanges: boolean): string[] =>
    includeMetadataChanges
      ? docs.filter((d) => d.metadata.hasPendingWrites).map((d) => d.ref.path)
      : [];

  function countPending(path: string, delta: 1 | -1): void {
    const n = (pendingDocs.get(path) ?? 0) + delta;
    if (n > 0) pendingDocs.set(path, n);
    else pendingDocs.delete(path);
  }

  /**
   * Registers a household-scoped listener.
   *  - Its shown documents count as live (fresh in the cache, see readDoc).
   *  - The local cache is shared by every account on the device, so a snapshot served from the
   *    cache (before the server answers) is shown only when the signed-in user is known to be a
   *    member of `hid`: confirmed by a server snapshot this session, or by their own member doc in
   *    the cache (the offline boot). Otherwise it waits for the server, which answers only members.
   */
  function register(
    hid: string,
    path: string,
    start: (next: (e: Emission) => void, onError: (e: unknown) => void) => Unsubscribe
  ): { unsubscribe: Unsubscribe; isActive: () => boolean } {
    let held = new Set<string>();
    let heldPending = new Set<string>();
    let active = true;
    let parked: Emission | null = null;
    let vouching = false;
    const retrack = (paths: string[], pendingPaths: string[]) => {
      const next = new Set(paths);
      for (const p of next) if (!held.has(p)) retain(p);
      for (const p of held) if (!next.has(p)) release(p);
      held = next;
      const nextPending = new Set(pendingPaths);
      const added = [...nextPending].filter((p) => !heldPending.has(p));
      const cleared = [...heldPending].filter((p) => !nextPending.has(p));
      for (const p of added) countPending(p, 1);
      for (const p of cleared) countPending(p, -1);
      heldPending = nextPending;
      if (added.length > 0 || cleared.length > 0) emitSync();
    };
    const show = (e: Emission) => {
      retrack(e.paths, e.pendingPaths);
      deliver(e.emit);
    };
    const next = (e: Emission) => {
      if (!active) return;
      const uid = auth.currentUser?.uid;
      if (!uid) return; // signed out: nothing is shown
      const key = memberKey(uid, hid);
      if (!e.fromCache) knownMembers.add(key); // the server only answers members
      if (!e.fromCache || knownMembers.has(key)) {
        parked = null;
        show(e);
        return;
      }
      parked = e;
      if (vouching) return;
      vouching = true;
      void vouchFor(hid, uid).then((ok) => {
        vouching = false;
        const p = parked;
        if (!ok || !active || !p || auth.currentUser?.uid !== uid) return;
        parked = null;
        show(p);
      });
    };
    const stop = start(next, (e) => {
      if (!active) return;
      const uid = auth.currentUser?.uid;
      if (uid && toRepoError(e).code === 'permission') knownMembers.delete(memberKey(uid, hid));
      retrack([], []);
      parked = null;
      listenerFailed(path, e);
    });
    const unsubscribe = () => {
      if (!active) return;
      active = false;
      stop();
      retrack([], []);
      listeners.delete(unsubscribe);
    };
    listeners.add(unsubscribe);
    return { unsubscribe, isActive: () => active };
  }

  function listenDoc(
    hid: string,
    ref: DocumentReference,
    includeMetadataChanges: boolean,
    onNext: (snap: DocumentSnapshot, isActive: () => boolean) => void
  ): Unsubscribe {
    const reg = register(hid, ref.path, (next, onError) =>
      onSnapshot(
        ref,
        { includeMetadataChanges },
        {
          next: (snap) =>
            next({
              paths: [snap.ref.path],
              pendingPaths: pendingOf([snap], includeMetadataChanges),
              fromCache: snap.metadata.fromCache,
              emit: () => onNext(snap, reg.isActive)
            }),
          error: onError
        }
      )
    );
    return reg.unsubscribe;
  }

  function listenQuery(
    hid: string,
    path: string,
    q: Query,
    includeMetadataChanges: boolean,
    onNext: (snap: QuerySnapshot) => void
  ): Unsubscribe {
    return register(hid, path, (next, onError) =>
      onSnapshot(
        q,
        { includeMetadataChanges },
        {
          next: (snap) =>
            next({
              paths: snap.docs.map((d) => d.ref.path),
              pendingPaths: pendingOf(snap.docs, includeMetadataChanges),
              fromCache: snap.metadata.fromCache,
              emit: () => onNext(snap)
            }),
          error: onError
        }
      )
    ).unsubscribe;
  }

  // ── auth helpers ───────────────────────────────────────────────────────────

  function requireUid(): string {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new RepoError('permission', 'not signed in');
    return uid;
  }

  // A sign-in that went through signInWithRedirect finishes here, on the next boot. The user then
  // arrives through onAuthChange; a failure is kept for the first onWriteError subscriber.
  void consumeRedirectResult(auth).then((err) => {
    if (err && !isCancelled(err)) reportWriteError(err, true);
  });

  // ── shared write builders ──────────────────────────────────────────────────

  async function liveInvite(code: string): Promise<Invite> {
    if (!isInviteCode(code)) throw notFound('invite');
    const snap = await readDoc(inviteRef(code));
    if (!snap.exists()) throw notFound('invite');
    const inv = inviteFromSnap(snap, writeTimeOf(snap));
    if (inv.revoked) throw new RepoError('revoked', 'the invite was revoked');
    if (inv.expiresAt <= Date.now()) throw new RepoError('expired', 'the invite expired');
    return inv;
  }

  /** Rules return only permission-denied for a join; re-read to say why (schema §3). */
  async function explainJoinFailure(e: unknown, code: string, hid: string): Promise<RepoError> {
    const err = toRepoError(e);
    if (err.code !== 'permission') return err;
    try {
      await liveInvite(code);
    } catch (why) {
      return toRepoError(why);
    }
    try {
      const snap = await getDoc(hhRef(hid));
      if (snap.exists()) return new RepoError('already-member', 'already a member');
    } catch {
      // not readable: not a member, so the household was full
    }
    return new RepoError('full', 'the household is full');
  }

  /** filledAt for treats/{round}: when this round's jar_filled event was written, if known. */
  async function filledAtOf(hid: string, jar: TreatJar): Promise<Timestamp | null> {
    try {
      const q = query(eventsCol(hid), where('type', '==', 'jar_filled'));
      const snap = await withTimeout(
        online() ? getDocs(q) : getDocsFromCache(q),
        READ_TIMEOUT_MS,
        () => new Error('timeout')
      );
      let best: Timestamp | null = null;
      for (const d of snap.docs) {
        if (d.metadata.hasPendingWrites) continue; // only server times are safe to copy
        const at: unknown = d.get('createdAt');
        if (!(at instanceof Timestamp) || at.toMillis() <= jar.startedAt) continue;
        if (!best || at.toMillis() > best.toMillis()) best = at;
      }
      return best;
    } catch {
      return null;
    }
  }

  /**
   * The open tasks of `hid` owned by `uid` or naming `uid` in requestedOf (leaveHousehold). The
   * same `status == 'open'` query as watchOpenTasks (no extra index), filtered here; from the server
   * with my queued writes applied, or from the cache when the server cannot be reached in time.
   */
  async function myOpenTasks(
    hid: string,
    uid: string
  ): Promise<{ ref: DocumentReference; task: Task }[]> {
    const q = query(tasksCol(hid), where('status', '==', 'open'));
    let snap: QuerySnapshot;
    try {
      if (!online()) throw new RepoError('network', 'offline');
      snap = await withTimeout(
        getDocs(q),
        READ_TIMEOUT_MS,
        () => new RepoError('network', 'reading the open tasks timed out')
      );
    } catch (e) {
      if (!isUnavailable(e)) throw toRepoError(e);
      snap = await getDocsFromCache(q);
    }
    return snap.docs
      .filter((d) => d.get('ownerId') === uid || d.get('requestedOf') === uid)
      .map((d) => ({ ref: d.ref, task: taskFromSnap(d) }));
  }

  async function removeDevicesOf(uid: string, hid: string): Promise<void> {
    try {
      const snap = await withTimeout(
        getDocs(query(devicesCol(uid), where('householdId', '==', hid))),
        READ_TIMEOUT_MS,
        () => new Error('timeout')
      );
      if (snap.empty) return;
      const b = newBatch();
      for (const d of snap.docs) b.delete(d.ref);
      await settle(commit(b));
    } catch (e) {
      console.warn('[firebase] could not remove this account’s device registrations', e);
    }
  }

  // ── take / requests (domain/requests.ts) ──────────────────────────────────

  /**
   * takeTask / acceptRequest. A transaction online; offline a batch from the cache (last write
   * wins, see the header). Someone else's task stays theirs; a former member's counts as unowned. A
   * request waiting for MY answer is accepted (requestedBy/At kept as history, an 'accepted' event
   * tells the asker); any other waiting request is cleared by the take.
   */
  async function take(hid: string, id: string): Promise<TakeResult> {
    try {
      return await enqueue(async (): Promise<TakeResult> => {
        const uid = requireUid();
        const tRef = taskRef(hid, id);
        const hRef = hhRef(hid);
        /** null = take it; else the answer. A former member's task counts as unowned. */
        const verdict = (task: Task, memberIds: string[] | null): TakeResult | null => {
          if (task.ownerId === uid) return { ok: true };
          if (task.ownerId !== null && (memberIds === null || memberIds.includes(task.ownerId))) {
            return { ok: false, takenBy: task.ownerId };
          }
          return null;
        };
        /** The household is read when the answer depends on who is still a member. */
        const needsMembers = (task: Task) =>
          (task.ownerId !== null && task.ownerId !== uid) || (task.requestedOf ?? null) !== null;
        const writeTake = (w: Writer, task: Task, memberIds: string[] | null) => {
          const members = memberIds ?? undefined;
          const asker = task.requestedBy;
          const accepting =
            pendingRequestOf(task, members) === uid &&
            asker !== null &&
            (memberIds === null || memberIds.includes(asker));
          const hadRequestOf = (task.requestedOf ?? null) !== null;
          if (accepting && asker !== null) {
            w.update(tRef, { ownerId: uid, requestedOf: null, ...touch(uid) });
            w.set(newEventRef(hid), eventDoc('accepted', uid, task, asker));
            return;
          }
          w.update(tRef, {
            ownerId: uid,
            requestedBy: null,
            requestedAt: null,
            ...(hadRequestOf ? { requestedOf: null } : {}),
            ...touch(uid)
          });
          w.set(newEventRef(hid), eventDoc('taken', uid, task));
        };

        if (await canTransact()) {
          try {
            const result = await runTransaction(db, async (tx): Promise<TakeResult> => {
              const ts = await tx.get(tRef);
              if (!ts.exists()) throw notFound(`task ${id}`);
              const task = taskFromSnap(ts);
              const memberIds = needsMembers(task)
                ? householdFromSnap(await tx.get(hRef)).memberIds
                : null;
              const answer = verdict(task, memberIds);
              if (answer) return answer;
              writeTake(tx, task, memberIds);
              return { ok: true };
            });
            await refreshFromServer([tRef]);
            return result;
          } catch (e) {
            if (!isUnavailable(e)) throw e;
            // The server could not be reached after all: take it offline-style below.
          }
        }

        // Offline: decided from the local cache; LAST WRITE WINS (see the header).
        const task = await mustReadTask(hid, id);
        const memberIds = needsMembers(task)
          ? ((await tryReadHousehold(hid))?.memberIds ?? null)
          : null;
        const answer = verdict(task, memberIds);
        if (answer) return answer;
        const b = newBatch();
        writeTake(b, task, memberIds);
        commitQueued(b);
        return { ok: true };
      });
    } catch (e) {
      throw toRepoError(e);
    }
  }

  /**
   * declineRequest ('asked') / cancelRequest ('asker'): the request is cleared and the task waits
   * for anyone. Nothing waiting (for MY answer, when declining) is a no-op: a late tap after the
   * request moved on. Cancelling needs the asker or the asked member (the rules' check).
   */
  function dropRequest(hid: string, id: string, as: 'asked' | 'asker'): void {
    queued(async (uid) => {
      const task = await mustReadTask(hid, id);
      const memberIds = (await tryReadHousehold(hid))?.memberIds;
      return dropBatch(hid, task, uid, memberIds, as);
    });
  }

  /** The decline / cancel batch for `task`, or null when nothing waits (for my answer). */
  function dropBatch(
    hid: string,
    task: Task,
    uid: string,
    memberIds: string[] | undefined,
    as: 'asked' | 'asker'
  ): TrackedBatch | null {
    const to = pendingRequestOf(task, memberIds);
    if (to === null || (as === 'asked' && to !== uid)) return null;
    const asker = task.requestedBy;
    if (uid !== to && uid !== asker) {
      throw new RepoError('permission', 'only the asked member or the asker can cancel a request');
    }
    const b = newBatch();
    b.update(taskRef(hid, task.id), {
      requestedOf: null,
      requestedBy: null,
      requestedAt: null,
      ...touch(uid)
    });
    // The asker hears a "no" (unless they left); a cancel is quiet.
    if (as === 'asked' && asker !== null && (memberIds?.includes(asker) ?? true)) {
      b.set(newEventRef(hid), eventDoc('declined', uid, task, asker));
    } else {
      b.set(newEventRef(hid), eventDoc('released', uid, task, to));
    }
    return b;
  }

  // ── the Repository ─────────────────────────────────────────────────────────

  const repo: Repository & FirebaseExtras = {
    kind: 'firebase',
    app: h.app,
    firestore: db,
    auth,

    // auth

    onAuthChange(cb: (u: AuthUser | null) => void): Unsubscribe {
      const stop = watchAuth(auth, (u) => deliver(() => cb(u)));
      const unsubscribe = () => {
        authSubs.delete(unsubscribe);
        stop();
      };
      authSubs.add(unsubscribe);
      return unsubscribe;
    },

    // Synchronous up to signInWithPopup (inside the user's tap): no await before it.
    signInWithGoogle: () => googleSignIn(auth),

    async signOut(): Promise<void> {
      await flushWrites(3_000);
      try {
        await firebaseSignOut(auth);
      } catch (e) {
        throw toRepoError(e);
      }
    },

    async signInWithTestCredential(uid: string, displayName: string, email?: string) {
      if (!h.emulator) throw new Error('signInWithTestCredential works only against the emulators');
      // The previous user's queued writes would otherwise wait in their queue until they return.
      await flushWrites(SWITCH_FLUSH_MS);
      try {
        await signInWithTestCredentialImpl(
          auth,
          h.emulator,
          cfg.projectId,
          uid,
          displayName,
          email
        );
      } catch (e) {
        throw toRepoError(e);
      }
    },

    // household

    async getMyHouseholdId(): Promise<string | null> {
      const uid = auth.currentUser?.uid;
      if (!uid) return null;
      try {
        const user = await readDoc(userRef(uid));
        const hid: unknown = user.exists() ? user.get('householdId') : null;
        if (typeof hid !== 'string' || hid === '') return null;
        const member = await readDoc(memberRef(hid, uid));
        if (!member.exists()) return null;
        knownMembers.add(memberKey(uid, hid));
        return hid;
      } catch (e) {
        const err = toRepoError(e);
        if (err.code === 'permission') return null; // the household no longer admits me
        throw err;
      }
    },

    async createHousehold(name: string, me: NewMemberProfile): Promise<string> {
      try {
        const { hid, uid, ack } = await enqueue(async () => {
          const uid = requireUid();
          const cleanName = cleanHouseholdName(name);
          const member = memberWrite(me, 'owner', null);
          const ref = doc(collection(db, 'households'));
          const b = newBatch();
          b.set(ref, {
            name: cleanName,
            memberIds: [uid],
            memberCount: 1,
            maxMembers: MAX_MEMBERS,
            createdBy: uid,
            createdAt: serverTimestamp(),
            jar: null,
            invite: null
          });
          b.set(memberRef(ref.id, uid), memberDoc(member));
          b.set(userRef(uid), { householdId: ref.id, createdAt: serverTimestamp() });
          return { hid: ref.id, uid, ack: commit(b) };
        });
        await ack;
        knownMembers.add(memberKey(uid, hid));
        return hid;
      } catch (e) {
        throw toRepoError(e);
      }
    },

    async previewInvite(code: string): Promise<InvitePreview> {
      try {
        requireUid();
        const inv = await liveInvite(code);
        return {
          householdName: inv.householdName,
          inviterName: inv.inviterName,
          memberCount: inv.memberCount
        };
      } catch (e) {
        throw toRepoError(e);
      }
    },

    async joinHousehold(code: string, me: NewMemberProfile): Promise<string> {
      let hid = '';
      try {
        requireUid();
        const inv = await liveInvite(code);
        hid = inv.householdId;
        const { ack, uid } = await enqueue(async () => {
          const uid = requireUid();
          const member = memberWrite(me, 'member', code);
          const b = newBatch();
          b.update(hhRef(hid), { memberIds: arrayUnion(uid), memberCount: increment(1) });
          b.set(memberRef(hid, uid), memberDoc(member));
          b.set(userRef(uid), { householdId: hid, createdAt: serverTimestamp() });
          b.set(newEventRef(hid), eventDoc('member_joined', uid, null));
          return { ack: commit(b), uid };
        });
        try {
          await ack;
        } catch (e) {
          throw await explainJoinFailure(e, code, hid);
        }
        knownMembers.add(memberKey(uid, hid));
        return hid;
      } catch (e) {
        throw toRepoError(e);
      }
    },

    async createInvite(hid: string): Promise<Invite> {
      try {
        const { ack, invite } = await enqueue(async () => {
          const uid = requireUid();
          const [hs, ms] = await Promise.all([readDoc(hhRef(hid)), readDoc(memberRef(hid, uid))]);
          if (!hs.exists()) throw notFound(`household ${hid}`);
          if (!ms.exists()) throw new RepoError('permission', 'not a member of this household');
          const household = householdFromSnap(hs, writeTimeOf(hs));
          const code = inviteCode();
          const expiresAt = Date.now() + INVITE_TTL_MS - INVITE_SKEW_MS;
          const invite: Invite = {
            code,
            householdId: hid,
            householdName: household.name,
            inviterName: memberFromSnap(ms, writeTimeOf(ms)).displayName,
            memberCount: household.memberCount,
            createdBy: uid,
            // Nominal: exactly 7 days before expiry (the stored createdAt is the server time, up to
            // INVITE_SKEW_MS later; see the report).
            createdAt: expiresAt - INVITE_TTL_MS,
            expiresAt,
            revoked: false
          };
          const expiry = Timestamp.fromMillis(expiresAt);
          const b = newBatch();
          b.set(inviteRef(code), {
            householdId: hid,
            householdName: invite.householdName,
            inviterName: invite.inviterName,
            memberCount: invite.memberCount,
            createdBy: uid,
            createdAt: serverTimestamp(),
            expiresAt: expiry,
            revoked: false
          });
          if (household.invite) b.update(inviteRef(household.invite.code), { revoked: true });
          b.update(hhRef(hid), { invite: { code, expiresAt: expiry } });
          return { ack: commit(b), invite };
        });
        await ack;
        return invite;
      } catch (e) {
        throw toRepoError(e);
      }
    },

    async revokeInvite(hid: string, code: string): Promise<void> {
      try {
        const { ack } = await enqueue(async () => {
          requireUid();
          if (!isInviteCode(code)) throw notFound('invite');
          const household = await mustReadHousehold(hid);
          const b = newBatch();
          b.update(inviteRef(code), { revoked: true });
          if (household.invite?.code === code) b.update(hhRef(hid), { invite: null });
          return { ack: commit(b) };
        });
        await ack;
      } catch (e) {
        throw toRepoError(e);
      }
    },

    async leaveHousehold(hid: string): Promise<void> {
      try {
        const { ack, uid } = await enqueue(async () => {
          const uid = requireUid();
          const household = await mustReadHousehold(hid);
          const last = household.memberIds.every((m) => m === uid) || household.memberCount <= 1;
          const mine = await myOpenTasks(hid, uid);
          const b = newBatch();
          // My open tasks go back to "waiting for someone to take", and requests waiting for my
          // answer are answered "no" the same way. No events: the events rule needs the caller to
          // still be a member after the batch (schema §3).
          for (const { ref, task } of mine) {
            const owned = task.ownerId === uid;
            const askedMe = pendingRequestOf(task) === uid;
            b.update(ref, {
              ...(owned ? { ownerId: null } : {}),
              ...(owned || askedMe ? { requestedBy: null, requestedAt: null } : {}),
              ...((task.requestedOf ?? null) !== null ? { requestedOf: null } : {}),
              ...touch(uid)
            });
          }
          b.delete(memberRef(hid, uid));
          b.update(hhRef(hid), {
            memberIds: arrayRemove(uid),
            memberCount: increment(-1),
            // The last one out must close the door: an open invite would admit a stranger.
            ...(last ? { invite: null } : {})
          });
          // ...and revoke the link itself, so a link already sent says "cancelled", not "full".
          // (The invites rule checks membership before the batch, so this is still allowed.)
          if (last && household.invite) {
            b.update(inviteRef(household.invite.code), { revoked: true });
          }
          b.set(userRef(uid), { householdId: null, createdAt: serverTimestamp() });
          return { ack: commit(b), uid };
        });
        await ack;
        knownMembers.delete(memberKey(uid, hid));
        await removeDevicesOf(uid, hid); // schema: "then unregisterDevice" (every device of mine)
      } catch (e) {
        throw toRepoError(e);
      }
    },

    watchHousehold(hid: string, cb: (h: Household) => void): Unsubscribe {
      // A new jar.startedAt (jar setup / redeem) is a serverTimestamp(); online, the snapshot
      // waits (≤ JAR_STAMP_WAIT_MS) for the server's value, so a round's start never changes
      // after it is shown. Offline it is shown at once with the client-time estimate.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stop = listenDoc(hid, hhRef(hid), false, (snap, isActive) => {
        clearTimeout(timer);
        timer = undefined;
        if (!snap.exists()) return;
        const emit = () => cb(householdFromSnap(snap, writeTimeOf(snap)));
        if (online() && jarStartPending(snap)) {
          timer = setTimeout(() => {
            if (isActive()) deliver(emit);
          }, JAR_STAMP_WAIT_MS);
          return;
        }
        emit();
      });
      return () => {
        clearTimeout(timer);
        stop();
      };
    },

    watchMembers(hid: string, cb: (m: Member[]) => void): Unsubscribe {
      const q = collection(db, 'households', hid, 'members');
      return listenQuery(hid, `households/${hid}/members`, q, false, (snap) => {
        const members = snap.docs.map((d) => memberFromSnap(d, writeTimeOf(d)));
        members.sort(
          (a, b) =>
            a.joinedAt - b.joinedAt ||
            (a.role === b.role ? 0 : a.role === 'owner' ? -1 : 1) ||
            (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0)
        );
        cb(members);
      });
    },

    async updateHousehold(hid: string, patch: { name?: string }): Promise<void> {
      try {
        const { ack } = await enqueue(async () => {
          requireUid();
          if (patch.name === undefined) return { ack: null };
          const b = newBatch();
          b.update(hhRef(hid), { name: cleanHouseholdName(patch.name) });
          return { ack: commit(b) };
        });
        if (ack) await settle(ack);
      } catch (e) {
        throw toRepoError(e);
      }
    },

    async updateMember(
      hid: string,
      patch: Partial<Pick<Member, 'displayName' | 'color' | 'addressAs' | 'notify'>>
    ): Promise<void> {
      try {
        const { ack } = await enqueue(async () => {
          const uid = requireUid();
          const data: DocumentData = {};
          if (patch.displayName !== undefined)
            data.displayName = cleanDisplayName(patch.displayName);
          if (patch.color !== undefined) {
            assertColor(patch.color);
            data.color = patch.color;
          }
          if (patch.addressAs !== undefined) {
            assertAddressAs(patch.addressAs);
            data.addressAs = patch.addressAs;
          }
          if (patch.notify !== undefined) data.notify = cleanNotify(patch.notify);
          if (Object.keys(data).length === 0) return { ack: null };
          const b = newBatch();
          b.update(memberRef(hid, uid), data);
          return { ack: commit(b) };
        });
        if (ack) await settle(ack);
      } catch (e) {
        throw toRepoError(e);
      }
    },

    // tasks: reads

    watchOpenTasks(hid: string, cb: (t: Task[]) => void): Unsubscribe {
      const q = query(tasksCol(hid), where('status', '==', 'open'));
      return listenQuery(hid, `households/${hid}/tasks?open`, q, true, (snap) =>
        cb(sortTasks(snap.docs.map((d) => taskFromSnap(d, writeTimeOf(d)))))
      );
    },

    watchDoneTasks(
      hid: string,
      limit: number,
      cb: (t: Task[], hasMore: boolean) => void
    ): Unsubscribe {
      const n = Math.max(0, Math.floor(limit));
      const q = query(
        tasksCol(hid),
        where('status', '==', 'done'),
        orderBy('completedAt', 'desc'),
        limitTo(n + 1)
      );
      return listenQuery(hid, `households/${hid}/tasks?done`, q, true, (snap) => {
        const tasks = snap.docs.map((d) => taskFromSnap(d, writeTimeOf(d)));
        // A completion still in flight sorts first (newest); its estimate never precedes a time
        // the server already stamped.
        const floor = Math.max(
          0,
          ...tasks.filter((t) => !t.pending).map((t) => t.completedAt ?? 0)
        );
        for (const t of tasks)
          if (t.pending && t.completedAt !== null) t.completedAt = Math.max(t.completedAt, floor);
        cb(tasks.slice(0, n), tasks.length > n);
      });
    },

    watchTask(hid: string, id: string, cb: (t: Task | null) => void): Unsubscribe {
      return listenDoc(hid, taskRef(hid, id), true, (snap) =>
        cb(snap.exists() ? taskFromSnap(snap, writeTimeOf(snap)) : null)
      );
    },

    // tasks: writes

    createTask(hid: string, d: TaskDraft): string {
      let ref: DocumentReference;
      try {
        ref = doc(tasksCol(hid));
      } catch (e) {
        reportWriteError(e);
        return `invalid-${Date.now().toString(36)}`;
      }
      queued(async (uid) => {
        const ownerId = d.ownerId ?? null;
        // Creating a task for ANOTHER member is a request (amendment [3.2]), and a request is a
        // proposal: nobody holds the task until they accept (domain/requests.ts).
        const isRequest = ownerId !== null && ownerId !== uid;
        const dates = {
          scheduledFor: d.scheduledFor ?? null,
          dueDate: d.dueDate ?? null,
          recurrence: d.recurrence ?? null
        };
        const content: TaskContent = {
          title: typeof d.title === 'string' ? d.title.trim() : d.title,
          notes: d.notes ?? '',
          categoryId: d.categoryId ?? null,
          priority: d.priority ?? 'normal',
          ownerId: isRequest ? null : ownerId,
          scheduledFor: dates.scheduledFor,
          // Always written (rules: exact key set); a week plan needs its Saturday in scheduledFor.
          weekPlan: d.weekPlan ?? false,
          dueDate: dates.dueDate,
          dueTime: d.dueTime ?? null,
          hardDeadline: d.hardDeadline ?? false,
          recurrence: ensureAnchor(dates),
          seriesId: null
        };
        assertValidTask(content);
        const task = { id: ref.id, title: content.title };
        const b = newBatch();
        b.set(ref, newTaskDoc(content, uid, isRequest, isRequest ? ownerId : null));
        b.set(newEventRef(hid), eventDoc('created', uid, task));
        if (isRequest) b.set(newEventRef(hid), eventDoc('requested', uid, task, ownerId));
        return b;
      });
      return ref.id;
    },

    updateTask(hid: string, id: string, p: TaskPatch): void {
      queued(async (uid) => {
        const patch = pickDefined(p, TASK_PATCH_KEYS);
        if (typeof patch.title === 'string') patch.title = patch.title.trim();
        const before = await mustReadTask(hid, id);
        const merged: Task = { ...before, ...patch };
        merged.recurrence = recurrenceAfterEdit(before, patch, merged);
        assertValidTask(merged);
        const data: DocumentData = touch(uid);
        for (const k of TASK_PATCH_KEYS) {
          if (k !== 'recurrence' && patch[k] !== undefined) data[k] = merged[k];
        }
        if (
          patch.recurrence !== undefined ||
          canonical(before.recurrence) !== canonical(merged.recurrence)
        ) {
          data.recurrence = recurrenceDoc(merged.recurrence);
        }
        const b = newBatch();
        b.update(taskRef(hid, id), data);
        b.set(newEventRef(hid), eventDoc('edited', uid, merged));
        return b;
      });
    },

    takeTask(hid: string, id: string): Promise<TakeResult> {
      return take(hid, id);
    },

    requestTask(hid: string, id: string, toUid: string): void {
      queued(async (uid) => {
        if (typeof toUid !== 'string' || toUid.length < 1 || toUid.length > 128) {
          invalid('the requested member is not a valid uid');
        }
        const task = await mustReadTask(hid, id);
        const b = newBatch();
        if (toUid === uid) {
          // Asking myself is taking it: no "ביקש/ה ממך" label on my own task.
          b.update(taskRef(hid, id), {
            ownerId: uid,
            requestedBy: null,
            requestedAt: null,
            ...((task.requestedOf ?? null) !== null ? { requestedOf: null } : {}),
            ...touch(uid)
          });
          b.set(newEventRef(hid), eventDoc('taken', uid, task));
        } else {
          // A proposal: nobody holds it until they accept (domain/requests.ts).
          b.update(taskRef(hid, id), {
            ownerId: null,
            requestedOf: toUid,
            requestedBy: uid,
            requestedAt: serverTimestamp(),
            ...touch(uid)
          });
          b.set(newEventRef(hid), eventDoc('requested', uid, task, toUid));
        }
        return b;
      });
    },

    acceptRequest(hid: string, id: string): Promise<TakeResult> {
      return take(hid, id);
    },

    declineRequest(hid: string, id: string): void {
      dropRequest(hid, id, 'asked');
    },

    cancelRequest(hid: string, id: string): void {
      dropRequest(hid, id, 'asker');
    },

    releaseTask(hid: string, id: string): void {
      queued(async (uid) => {
        const task = await mustReadTask(hid, id);
        // Nobody holds a request that waits: "back to the list" withdraws it (asker or asked).
        if (task.ownerId === null && (task.requestedOf ?? null) !== null) {
          const memberIds = (await tryReadHousehold(hid))?.memberIds;
          if (pendingRequestOf(task, memberIds) !== null) {
            return dropBatch(hid, task, uid, memberIds, 'asker');
          }
        }
        const b = newBatch();
        b.update(taskRef(hid, id), {
          ownerId: null,
          requestedBy: null,
          requestedAt: null,
          ...((task.requestedOf ?? null) !== null ? { requestedOf: null } : {}),
          ...touch(uid)
        });
        b.set(newEventRef(hid), eventDoc('released', uid, task));
        return b;
      });
    },

    snoozeTask(hid: string, id: string, until: ISODate): void {
      queued(async (uid) => {
        if (!isValidISO(until)) invalid('snooze date is not a date');
        const task = await mustReadTask(hid, id);
        const now = Date.now();
        // The WHOLE domain patch (scheduledFor, and whatever else it decides: dueDate, weekPlan,
        // hardDeadline, ...); only its two "now"-ish fields take their Firestore encodings.
        const data: DocumentData = {
          ...definedOnly(snoozePatch(task, until, now, todayISO(now))),
          snoozeCount: increment(1), // == patch.snoozeCount, and safe against a concurrent snooze
          lastSnoozedAt: serverTimestamp(), // == patch.lastSnoozedAt, as the rules require
          ...touch(uid)
        };
        const b = newBatch();
        b.update(taskRef(hid, id), data);
        b.set(newEventRef(hid), eventDoc('snoozed', uid, task));
        return b;
      });
    },

    async completeTask(
      hid: string,
      id: string,
      c: Omit<Completion, 'photoIds'>,
      photos: EncodedPhoto[]
    ): Promise<CompleteResult> {
      try {
        return await enqueue(async (): Promise<CompleteResult> => {
          const uid = requireUid();
          const kept = photos.slice(0, MAX_PHOTOS);
          kept.forEach(assertValidPhoto);
          // Ids fixed up front, so a retried transaction writes the same photo documents.
          const photoRefs = kept.map(() => doc(collection(db, 'households', hid, 'photos')));
          const completion: Completion = {
            note: c.note,
            cost: typeof c.cost === 'number' && Number.isFinite(c.cost) ? c.cost : null,
            place: c.place,
            contact: c.contact,
            photoIds: photoRefs.map((r) => r.id)
          };
          assertValidCompletion(completion);
          const tRef = taskRef(hid, id);
          const hRef = hhRef(hid);

          /**
           * The complete-batch of docs/firestore-schema.md §3 (≤ 3 photos, task done, completed
           * event, the jar step if there is a jar, the next instance, jar_filled). `household`
           * null = unknown (offline and uncached): no jar write. `nextDoc` null = do not write it.
           */
          const writeCompletion = (
            w: Writer,
            task: Task,
            household: Household | null,
            next: Task | null,
            writeNext: boolean
          ): boolean => {
            kept.forEach((p, i) =>
              w.set(photoRefs[i]!, {
                taskId: id,
                dataUrl: p.dataUrl,
                thumbDataUrl: p.thumbDataUrl,
                width: p.width,
                height: p.height,
                createdBy: uid,
                createdAt: serverTimestamp()
              })
            );
            w.update(tRef, {
              status: 'done',
              completedAt: serverTimestamp(),
              completedBy: uid,
              completion: { ...completion, photoIds: [...completion.photoIds] },
              ...touch(uid)
            });
            w.set(newEventRef(hid), eventDoc('completed', uid, task));
            const jar = household?.jar ?? null;
            const ids = household?.memberIds ?? [];
            const jarFilled = !isFull(jar, ids) && isFull(applyCompletion(jar, uid), ids);
            if (jar) w.update(hRef, completionJarWrite(jar, uid));
            if (next && writeNext) w.set(taskRef(hid, next.id), nextInstanceDoc(next, household));
            if (jarFilled) w.set(newEventRef(hid), eventDoc('jar_filled', uid, null));
            return jarFilled;
          };
          const nextInstanceDoc = (next: Task, household: Household | null) => {
            // The owner may have left since: the instance then waits for someone to take it.
            const ownerGone =
              next.ownerId !== null &&
              household !== null &&
              !household.memberIds.includes(next.ownerId);
            return newTaskDoc({ ...next, ownerId: ownerGone ? null : next.ownerId }, uid, false);
          };

          if (await canTransact()) {
            try {
              let nextRef: DocumentReference | null = null;
              const result = await runTransaction(db, async (tx): Promise<CompleteResult> => {
                const ts = await tx.get(tRef);
                if (!ts.exists()) throw notFound(`task ${id}`);
                const task = taskFromSnap(ts);
                if (task.status === 'done')
                  throw new RepoError('conflict', 'the task is already done');
                const hs = await tx.get(hRef);
                if (!hs.exists()) throw notFound(`household ${hid}`);
                const household = householdFromSnap(hs);
                const now = Date.now();
                const next = buildNextInstance(task, isoDateAt(now), now, uid);
                nextRef = next ? taskRef(hid, next.id) : null;
                // Deterministic id: an instance that already exists is kept (re-set() would be an
                // update rewriting createdAt, which the rules deny).
                const nextExists = nextRef ? (await tx.get(nextRef)).exists() : false;
                const jarFilled = writeCompletion(tx, task, household, next, !nextExists);
                return { nextTaskId: next?.id ?? null, jarFilled };
              });
              await refreshFromServer([tRef, hRef, nextRef]);
              return result;
            } catch (e) {
              if (!isUnavailable(e)) throw e;
              // The server could not be reached after all: complete offline-style below.
            }
          }

          // Offline: a batch from the local cache; LAST WRITE WINS (see the header).
          const task = await mustReadTask(hid, id);
          if (task.status === 'done') throw new RepoError('conflict', 'the task is already done');
          const household = await tryReadHousehold(hid);
          const now = Date.now();
          const next = buildNextInstance(task, isoDateAt(now), now, uid);
          let nextKnown: 'exists' | 'missing' | 'unknown' = 'unknown';
          if (next) {
            const cached = await fromCache(taskRef(hid, next.id));
            if (cached) nextKnown = cached.exists() ? 'exists' : 'missing';
          }
          const main = newBatch();
          const jarFilled = writeCompletion(main, task, household, next, nextKnown === 'missing');
          commitQueued(main);
          if (next && nextKnown === 'unknown') {
            // Not known locally: written on its own, so that if it already exists on the server
            // (its re-set() is denied) the completion itself still goes through. That denial
            // means "already there" and is not reported.
            const follow = newBatch();
            follow.set(taskRef(hid, next.id), nextInstanceDoc(next, household));
            commitQueued(follow, (e) => {
              const err = toRepoError(e);
              if (err.code !== 'permission') reportWriteError(err);
            });
          }
          return { nextTaskId: next?.id ?? null, jarFilled };
        });
      } catch (e) {
        throw toRepoError(e);
      }
    },

    reopenTask(hid: string, id: string): void {
      queued(async (uid) => {
        const task = await mustReadTask(hid, id);
        if (task.status !== 'done') return null; // nothing to undo
        const completedAt = task.completedAt ?? Date.now();
        const expected = buildNextInstance(
          task,
          isoDateAt(completedAt),
          completedAt,
          task.completedBy ?? uid
        );
        const household = await tryReadHousehold(hid);
        let autoNext: Task | null = null;
        if (expected) {
          try {
            const snap = await readDoc(taskRef(hid, expected.id));
            if (snap.exists()) autoNext = taskFromSnap(snap, writeTimeOf(snap));
          } catch (e) {
            if (!isUnavailable(e)) throw e; // offline and unknown: keep it
          }
        }
        const b = newBatch();
        b.update(taskRef(hid, id), {
          status: 'open',
          completedAt: null,
          completedBy: null,
          completion: null,
          ...touch(uid)
        });
        for (const pid of task.completion?.photoIds ?? []) b.delete(photoRef(hid, pid));
        // Only a completion of the jar's current round comes back out of it (applyReopen); never
        // below 0 (the rules deny it), so an empty step writes nothing.
        const jar = household?.jar ?? null;
        if (household && jar && completedAt >= jar.startedAt) {
          const data = reopenJarWrite(jar, task.completedBy, household.memberIds);
          if (data) b.update(hhRef(hid), data);
        }
        if (expected && autoNext && isUntouchedInstance(autoNext, expected)) {
          b.delete(taskRef(hid, expected.id));
        }
        b.set(newEventRef(hid), eventDoc('reopened', uid, task));
        return b;
      });
    },

    deleteTask(hid: string, id: string): void {
      queued(async (uid) => {
        const snap = await readDoc(taskRef(hid, id));
        if (!snap.exists()) return null; // already gone
        const task = taskFromSnap(snap, writeTimeOf(snap));
        const b = newBatch();
        for (const pid of task.completion?.photoIds ?? []) b.delete(photoRef(hid, pid));
        b.delete(taskRef(hid, id));
        b.set(newEventRef(hid), eventDoc('deleted', uid, task));
        return b;
      });
    },

    async getPhoto(hid: string, photoId: string): Promise<Photo | null> {
      try {
        requireUid();
        const snap = await readDoc(photoRef(hid, photoId));
        return snap.exists() ? photoFromSnap(snap, writeTimeOf(snap)) : null;
      } catch (e) {
        throw toRepoError(e);
      }
    },

    // jar

    setJar(hid: string, j: JarSettings, backfill?: Record<string, number>): void {
      queued(async () => {
        cleanJar(j, 1); // fail fast, before any read
        const household = await mustReadHousehold(hid);
        const { treat, mode, target, share } = cleanJar(j, household.memberCount);
        const jar = household.jar;
        if (backfill && !(jar && backfillAllowed(jar, household.memberIds, backfill))) {
          invalid('the backfill does not match the jar');
        }
        const b = newBatch();
        if (jar) {
          b.update(hhRef(hid), {
            'jar.treat': treat,
            'jar.target': target,
            'jar.mode': mode,
            ...(share !== undefined ? { 'jar.share': share } : {}),
            ...(backfill ? { 'jar.counts': { ...backfill } } : {})
          });
        } else {
          b.update(hhRef(hid), {
            jar: {
              treat,
              target,
              mode,
              ...(share !== undefined ? { share } : {}),
              count: 0,
              counts: {},
              round: 1,
              startedAt: serverTimestamp()
            }
          });
        }
        return b;
      });
    },

    redeemJar(hid: string): void {
      queued(async (uid) => {
        const household = await mustReadHousehold(hid);
        const jar = household.jar;
        if (!jar) throw notFound('jar');
        if (!isFull(jar, household.memberIds)) {
          throw new RepoError('conflict', 'the jar is not full yet');
        }
        const filledAt = await filledAtOf(hid, jar);
        const each = modeOf(jar) === 'each';
        const b = newBatch();
        // Who took part: the round's tallies, exactly as the jar holds them (the rules compare).
        b.set(doc(treatsCol(hid), String(jar.round)), {
          treat: jar.treat,
          target: jar.target,
          filledAt: filledAt ?? serverTimestamp(),
          redeemedAt: serverTimestamp(),
          mode: modeOf(jar),
          ...(each && jar.share !== undefined ? { share: jar.share } : {}),
          counts: { ...jar.counts }
        });
        // = applyRedeem: the round advances, the clock restarts, the tallies start over. Together
        // the surplus carries over; each, everyone starts from 0.
        b.update(hhRef(hid), {
          'jar.count': each ? 0 : increment(-jar.target),
          'jar.counts': {},
          'jar.round': increment(1),
          'jar.startedAt': serverTimestamp()
        });
        b.set(newEventRef(hid), eventDoc('jar_redeemed', uid, null));
        return b;
      });
    },

    watchTreats(hid: string, cb: (t: EarnedTreat[]) => void): Unsubscribe {
      return listenQuery(hid, `households/${hid}/treats`, treatsCol(hid), false, (snap) =>
        cb(
          snap.docs
            .map((d) => treatFromSnap(d, writeTimeOf(d)))
            .sort((a, b) => Number(b.id) - Number(a.id))
        )
      );
    },

    watchRecentEvents(hid: string, limit: number, cb: (e: ActivityEvent[]) => void): Unsubscribe {
      const n = Math.max(0, Math.floor(limit));
      const q = query(eventsCol(hid), orderBy('createdAt', 'desc'), limitTo(Math.max(1, n)));
      return listenQuery(hid, `households/${hid}/events`, q, false, (snap) => {
        const events = snap.docs.map((d) => eventFromSnap(d, writeTimeOf(d)));
        // Events still in flight sort first (newest); their estimate never precedes a time the
        // server already stamped, so createdAt stays non-increasing down the list.
        const floor = Math.max(
          0,
          ...events
            .filter((_, i) => !snap.docs[i]!.metadata.hasPendingWrites)
            .map((e) => e.createdAt)
        );
        events.forEach((e, i) => {
          if (snap.docs[i]!.metadata.hasPendingWrites) e.createdAt = Math.max(e.createdAt, floor);
        });
        cb(events.slice(0, n));
      });
    },

    // devices & sync

    async registerDevice(d): Promise<void> {
      try {
        const { ack } = await enqueue(async () => {
          const uid = requireUid();
          if (typeof d.deviceId !== 'string' || d.deviceId.length < 1 || d.deviceId.length > 64) {
            invalid('deviceId must be 1-64 characters');
          }
          if (typeof d.token !== 'string' || d.token.length < 1 || d.token.length > 4096) {
            invalid('token must be 1-4096 characters');
          }
          const ref = doc(devicesCol(uid), d.deviceId);
          let exists = false;
          try {
            exists = (await readDoc(ref)).exists();
          } catch {
            exists = false; // a full set() is accepted either way
          }
          const fields = {
            householdId: d.householdId,
            token: d.token,
            userAgent: String(d.userAgent ?? '').slice(0, 512),
            updatedAt: serverTimestamp()
          };
          const b = newBatch();
          // createdAt only on the first write (merge keeps it); updatedAt on every write.
          if (exists) b.set(ref, fields, { merge: true });
          else b.set(ref, { ...fields, createdAt: serverTimestamp() });
          return { ack: commit(b) };
        });
        await settle(ack);
      } catch (e) {
        throw toRepoError(e);
      }
    },

    async unregisterDevice(deviceId: string): Promise<void> {
      try {
        const { ack } = await enqueue(async () => {
          const uid = requireUid();
          const b = newBatch();
          b.delete(doc(devicesCol(uid), deviceId));
          return { ack: commit(b) };
        });
        await settle(ack);
      } catch (e) {
        throw toRepoError(e);
      }
    },

    watchSync(cb: (s: SyncState) => void): Unsubscribe {
      syncSubs.add(cb);
      stopInSync ??= onSnapshotsInSync(db, () => emitSync());
      deliver(() => cb(syncState()));
      return () => {
        syncSubs.delete(cb);
        if (syncSubs.size === 0) {
          stopInSync?.();
          stopInSync = null;
        }
      };
    },

    onWriteError(cb: (e: RepoError) => void): Unsubscribe {
      errorSubs.add(cb);
      if (undelivered.length > 0) {
        const pending = undelivered.splice(0);
        queueMicrotask(() => pending.forEach((err) => deliverError(err, [cb])));
      }
      return () => {
        errorSubs.delete(cb);
      };
    },

    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      for (const stop of [...listeners]) stop();
      for (const stop of [...authSubs]) stop();
      stopInSync?.();
      stopInSync = null;
      syncSubs.clear();
      errorSubs.clear();
      if (hasWindow) {
        window.removeEventListener('online', onNetworkChange);
        window.removeEventListener('offline', onNetworkChange);
      }
      await disposeFirebase(h);
    }
  };
  return repo;
}
