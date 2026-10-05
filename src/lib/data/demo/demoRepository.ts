// The demo Repository (Blueprint §5 "Demo adapter"): the whole app without Firebase, for
// development, E2E tests, screenshots and the public "try the demo" mode.
//
// Semantics are the contract's (tests/contract/repositoryContract.ts), which the Firebase adapter
// must match. Every rule comes from the domain modules (snoozePatch, ensureAnchor,
// buildNextInstance, applyCompletion/applyReopen/applyRedeem, isFull); nothing is re-implemented.
//
//  - Queued writes (methods returning void or a string) are applied synchronously, so watchers see
//    them before the call returns; a failure (not signed in, not a member, invalid data, missing
//    task) is reported asynchronously through onWriteError, exactly where Firestore would report a
//    rejected write. Promise-returning methods reject instead.
//  - Every task mutation writes its ActivityEvent; push is 'pending' for requested, completed and
//    jar_filled, 'none' otherwise. Mutations with no matching event type (household, member,
//    invite, jar settings, devices, leaving) write none.
//  - Reads are scoped like the security rules: a watcher of a household I am not a member of emits
//    nothing, and a write to it fails with RepoError('permission').
//  - No network: tasks never carry `pending`, and watchSync always reports synced.

import {
  RepoError,
  type CompleteResult,
  type NewMemberProfile,
  type Repository,
  type TakeResult
} from '../repository';
import { sortTasks } from '../../domain/buckets';
import { DEFAULT_CATEGORIES } from '../../domain/categories';
import { isoDateAt, isValidISO, todayISO } from '../../domain/dates';
import { inviteCode, isInviteCode, randomId } from '../../domain/ids';
import { applyCompletion, applyRedeem, applyReopen, isFull } from '../../domain/jar';
import {
  buildNextInstance,
  ensureAnchor,
  recurrenceProblem,
  ruleOf,
  sameRule
} from '../../domain/recurrence';
import { snoozePatch } from '../../domain/snooze';
import type {
  ActivityEvent,
  AuthUser,
  Completion,
  EarnedTreat,
  EncodedPhoto,
  EventType,
  Household,
  Invite,
  InvitePreview,
  ISODate,
  Member,
  Millis,
  Photo,
  SyncState,
  Task,
  TaskDraft,
  TaskPatch,
  Unsubscribe
} from '../../domain/types';
import { ALL_NOTIFY_ON, createSeed, DEMO_USERS, MICHAL } from './seed';
import {
  DEFAULT_STORAGE_KEY,
  DemoStore,
  emptyState,
  idbPersistence,
  isDemoState,
  memoryPersistence,
  type DemoState,
  type HouseholdRecord,
  type Persistence,
  type UserRecord
} from './store';

// ── Public API ────────────────────────────────────────────────────────────────

export interface DemoRepositoryOptions {
  /** Injectable clock (epoch ms). Default Date.now. */
  now?: () => Millis;
  /** Starting point when nothing is persisted (or on `reset`): the seeded household, or nothing. */
  initial?: 'seed' | 'empty';
  /** Ignore persisted state and start from `initial` (`?demo=1&reset=1`). */
  reset?: boolean;
  /** Where the state lives between reloads. Default 'idb' (falls back to none without IndexedDB). */
  persistence?: 'idb' | 'memory' | 'none' | Persistence;
  /** idb-keyval key. Default 'homecare.demo.v1'. */
  storageKey?: string;
  /** Debounce for persistence writes, in ms. Default 200. */
  persistDelayMs?: number;
}

export interface SimulateJoinOptions {
  /** The invite to accept. Default: my household's active invite (created if there is none). */
  code?: string;
  /** Overrides for the joining person's profile. */
  profile?: Partial<NewMemberProfile>;
}

/** The Repository plus demo-only affordances (never on the interface). */
export interface DemoRepository extends Repository {
  readonly kind: 'demo';
  /** Become `uid`: a seeded member ('michal', 'dani') or any uid (a fresh user is created). */
  actAs(uid: string): void;
  /** The signed-in uid, or null when signed out. */
  currentUid(): string | null;
  /** Replace everything with a fresh seed for "now", signed in as מיכל, and persist it. */
  resetDemo(): Promise<void>;
  /** Another person accepts an invite to my household (the "invite flow" demo). Returns their uid. */
  simulateJoin(options?: SimulateJoinOptions): Promise<string>;
  /** Persist pending changes now. */
  flush(): Promise<void>;
  /** Flush, then detach listeners and stop every watcher. */
  dispose(): Promise<void>;
}

/** People who can "join" through simulateJoin, in order. */
export const DEMO_GUESTS: readonly NewMemberProfile[] = [
  { displayName: 'סבתא רותי', photoURL: null, color: 'plum', addressAs: 'f' },
  { displayName: 'אורי', photoURL: null, color: 'ochre', addressAs: 'm' },
  { displayName: 'שירה', photoURL: null, color: 'teal', addressAs: 'f' },
  { displayName: 'עמית', photoURL: null, color: 'sage', addressAs: 'n' }
];

/**
 * Loads the persisted demo (or starts from `initial`) and returns the repository. Async because
 * IndexedDB is; every method of the result is then synchronous where the contract says so.
 */
export async function createDemoRepository(
  options: DemoRepositoryOptions = {}
): Promise<DemoRepository> {
  const now = options.now ?? (() => Date.now());
  const persistence = resolvePersistence(options);
  let state: DemoState | null = null;
  if (persistence && !options.reset) {
    try {
      const saved = await persistence.load();
      if (isDemoState(saved)) state = saved;
    } catch (e) {
      console.warn('[demo] could not read the saved demo; starting fresh', e);
    }
  }
  const fresh = state === null;
  if (state === null)
    state = options.initial === 'empty' ? emptyState() : createSeed(new Date(now()));
  const store = new DemoStore(state, persistence, options.persistDelayMs);
  if (fresh) store.markDirty();
  return buildDemoRepository(store, now);
}

function resolvePersistence(o: DemoRepositoryOptions): Persistence | null {
  const p = o.persistence ?? 'idb';
  if (p === 'none') return null;
  if (p === 'memory') return memoryPersistence();
  if (p === 'idb') return idbPersistence(o.storageKey ?? DEFAULT_STORAGE_KEY);
  return p;
}

// ── Rules shared by several methods ───────────────────────────────────────────

const DAY_MS = 86_400_000;
const INVITE_TTL_MS = 7 * DAY_MS;
const MAX_MEMBERS = 6;
const MAX_PHOTOS = 3;
/** Events kept per household (oldest dropped first); plenty for history screens. */
const MAX_EVENTS = 1000;

const PUSH_PENDING: ReadonlySet<EventType> = new Set(['requested', 'completed', 'jar_filled']);
const PRIORITIES: ReadonlySet<string> = new Set(['normal', 'high', 'urgent']);
const CATEGORY_IDS: ReadonlySet<string> = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

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
const MEMBER_PATCH_KEYS = ['displayName', 'color', 'addressAs', 'notify'] as const;

/**
 * The fields compared to decide whether an auto-created next instance is still "untouched": equal
 * to what buildNextInstance produced, and never written since (updatedAt === createdAt). Comparing
 * content as well keeps this right under a frozen clock (E2E), where a later write can carry the
 * same timestamp.
 */
const INSTANCE_CONTENT_KEYS = [
  'title',
  'notes',
  'categoryId',
  'priority',
  'ownerId',
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

/** Copies only the listed keys that are present and not undefined. */
function pick<T extends object, K extends keyof T>(
  src: T,
  keys: readonly K[]
): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {};
  for (const k of keys) if (src[k] !== undefined) out[k] = src[k];
  return out;
}

/** Mirrors the Firestore rules' task validation; a violation is a rejected write ('permission'). */
function assertValidTask(t: Task): void {
  const fail = (why: string) => {
    throw new RepoError('permission', `invalid task: ${why}`);
  };
  if (typeof t.title !== 'string' || t.title.length < 1 || t.title.length > 200)
    fail('title must be 1-200 characters');
  if (typeof t.notes !== 'string' || t.notes.length > 4000)
    fail('notes are limited to 4000 characters');
  if (!PRIORITIES.has(t.priority)) fail('unknown priority');
  if (t.categoryId !== null && !CATEGORY_IDS.has(t.categoryId)) fail('unknown category');
  if (t.scheduledFor !== null && !isValidISO(t.scheduledFor)) fail('scheduledFor is not a date');
  if (typeof t.weekPlan !== 'boolean') fail('weekPlan must be a boolean');
  if (t.weekPlan && t.scheduledFor === null) fail('a week plan needs a scheduledFor');
  if (t.dueDate !== null && !isValidISO(t.dueDate)) fail('dueDate is not a date');
  if (t.dueTime !== null && !TIME_RE.test(t.dueTime)) fail('dueTime must be HH:mm');
  if (typeof t.hardDeadline !== 'boolean') fail('hardDeadline must be a boolean');
  if (t.recurrence !== null) {
    const problem = recurrenceProblem(t.recurrence);
    if (problem) fail(problem);
  }
}

const ownDate = (t: Pick<Task, 'dueDate' | 'scheduledFor'>): ISODate | null =>
  t.dueDate ?? t.scheduledFor;

/**
 * The recurrence after an edit (recurrence.ts, ensureAnchor): an explicit anchor in the patch wins;
 * a change of the instance's own date or of the rule (frequency, interval or days) is a re-plan, so
 * the old anchor is dropped and re-derived; anything else keeps the series' anchor.
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
    INSTANCE_CONTENT_KEYS.every((k) => JSON.stringify(actual[k]) === JSON.stringify(expected[k]))
  );
}

function newMember(
  uid: string,
  p: NewMemberProfile,
  role: Member['role'],
  joinedAt: Millis,
  code: string | null
): Member {
  return {
    uid,
    displayName: p.displayName.trim(),
    photoURL: p.photoURL,
    color: p.color,
    addressAs: p.addressAs,
    role,
    joinedAt,
    notify: { ...ALL_NOTIFY_ON },
    inviteCode: code
  };
}

// ── The repository ────────────────────────────────────────────────────────────

function buildDemoRepository(store: DemoStore, now: () => Millis): DemoRepository {
  const writeErrorListeners = new Set<(e: RepoError) => void>();
  const s = () => store.state;

  // ── plumbing ───────────────────────────────────────────────────────────────

  function reportWriteError(e: unknown): void {
    const err =
      e instanceof RepoError
        ? e
        : new RepoError('unknown', e instanceof Error ? e.message : String(e));
    queueMicrotask(() => {
      if (writeErrorListeners.size === 0) {
        console.warn('[demo] a queued write failed', err);
        return;
      }
      for (const cb of [...writeErrorListeners]) {
        try {
          cb(err);
        } catch (x) {
          console.error('[demo] an onWriteError callback threw', x);
        }
      }
    });
  }

  /** A queued write: applied at once; a failure (thrown before any change) goes to onWriteError. */
  function queued(fn: (st: DemoState, uid: string) => void): void {
    try {
      store.mutate((st) => fn(st, requireUser(st)));
    } catch (e) {
      reportWriteError(e);
    }
  }

  function requireUser(st: DemoState): string {
    if (st.authUid === null) throw new RepoError('permission', 'not signed in');
    return st.authUid;
  }

  function ensureUser(st: DemoState, uid: string): UserRecord {
    let u = st.users[uid];
    if (!u) {
      const known = DEMO_USERS[uid];
      const profile: AuthUser = known
        ? { ...known }
        : { uid, displayName: uid, email: `${uid}@example.com`, photoURL: null };
      u = { profile, householdId: null, devices: {} };
      st.users[uid] = u;
    }
    return u;
  }

  /** My household record; a household that does not exist reads like one I may not see. */
  function memberHousehold(st: DemoState, hid: string, uid: string): HouseholdRecord {
    const rec = st.households[hid];
    if (!rec || !rec.household.memberIds.includes(uid)) {
      throw new RepoError('permission', 'not a member of this household');
    }
    return rec;
  }

  function getTask(rec: HouseholdRecord, id: string): Task {
    const t = rec.tasks[id];
    if (!t) throw new RepoError('not-found', `no task ${id}`);
    return t;
  }

  function pushEvent(
    rec: HouseholdRecord,
    type: EventType,
    actorId: string,
    task: Task | null,
    at: Millis,
    targetId: string | null = null
  ): void {
    rec.events.push({
      id: randomId(20),
      type,
      actorId,
      taskId: task?.id ?? null,
      taskTitle: task?.title ?? null,
      targetId,
      createdAt: at,
      push: PUSH_PENDING.has(type) ? 'pending' : 'none'
    });
    if (rec.events.length > MAX_EVENTS) rec.events.splice(0, rec.events.length - MAX_EVENTS);
  }

  function touch(task: Task, uid: string, at: Millis): void {
    task.updatedBy = uid;
    task.updatedAt = at;
  }

  /** The household as the signed-in user may see it, or undefined (watchers then emit nothing). */
  function visible(hid: string): HouseholdRecord | undefined {
    const st = s();
    const rec = st.households[hid];
    return st.authUid !== null && rec?.household.memberIds.includes(st.authUid) ? rec : undefined;
  }

  /** Validates an invite code for preview / join. */
  function liveInvite(st: DemoState, code: string): Invite {
    const inv = isInviteCode(code) ? st.invites[code] : undefined;
    if (!inv) throw new RepoError('not-found', 'no such invite');
    if (inv.revoked) throw new RepoError('revoked', 'the invite was revoked');
    if (inv.expiresAt <= now()) throw new RepoError('expired', 'the invite expired');
    return inv;
  }

  function joinAs(st: DemoState, uid: string, code: string, profile: NewMemberProfile): string {
    const inv = liveInvite(st, code);
    const rec = st.households[inv.householdId];
    if (!rec) throw new RepoError('not-found', 'the household no longer exists');
    const h = rec.household;
    if (h.memberIds.includes(uid)) throw new RepoError('already-member', 'already a member');
    if (h.memberCount >= h.maxMembers) throw new RepoError('full', 'the household is full');
    const t = now();
    rec.members[uid] = newMember(uid, profile, 'member', t, code);
    h.memberIds = [...h.memberIds, uid];
    h.memberCount = h.memberIds.length;
    ensureUser(st, uid).householdId = h.id;
    pushEvent(rec, 'member_joined', uid, null, t);
    return h.id;
  }

  function createInviteFor(st: DemoState, hid: string, uid: string): Invite {
    const rec = memberHousehold(st, hid, uid);
    const t = now();
    const previous = rec.household.invite;
    const code = inviteCode();
    const invite: Invite = {
      code,
      householdId: hid,
      householdName: rec.household.name,
      inviterName: rec.members[uid]?.displayName ?? '',
      memberCount: rec.household.memberCount,
      createdBy: uid,
      createdAt: t,
      expiresAt: t + INVITE_TTL_MS,
      revoked: false
    };
    const old = previous ? st.invites[previous.code] : undefined;
    if (old) old.revoked = true;
    st.invites[code] = invite;
    rec.household.invite = { code, expiresAt: invite.expiresAt };
    return { ...invite };
  }

  // ── window integration: save before the page goes away ─────────────────────

  const onPageHide = () => void store.flush();
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') void store.flush();
  };
  const hasWindow = typeof window !== 'undefined' && typeof window.addEventListener === 'function';
  if (hasWindow) {
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
  }

  // ── the Repository ─────────────────────────────────────────────────────────

  const repo: DemoRepository = {
    kind: 'demo',

    // auth

    onAuthChange(cb: (u: AuthUser | null) => void): Unsubscribe {
      return store.watch<AuthUser | null>(() => {
        const st = s();
        return st.authUid === null ? null : (st.users[st.authUid]?.profile ?? null);
      }, cb);
    },

    async signInWithGoogle(): Promise<void> {
      store.mutate((st) => {
        const uid = st.lastUid ?? MICHAL;
        ensureUser(st, uid);
        st.authUid = uid;
        st.lastUid = uid;
      });
    },

    async signOut(): Promise<void> {
      store.mutate((st) => {
        st.authUid = null;
      });
    },

    // household

    async getMyHouseholdId(): Promise<string | null> {
      const st = s();
      if (st.authUid === null) return null;
      const hid = st.users[st.authUid]?.householdId ?? null;
      return hid !== null && st.households[hid]?.household.memberIds.includes(st.authUid)
        ? hid
        : null;
    },

    async createHousehold(name: string, me: NewMemberProfile): Promise<string> {
      return store.mutate((st) => {
        const uid = requireUser(st);
        const trimmed = name.trim();
        if (trimmed.length < 1 || trimmed.length > 100) {
          throw new RepoError('permission', 'household name must be 1-100 characters');
        }
        const hid = randomId(20);
        const t = now();
        st.households[hid] = {
          household: {
            id: hid,
            name: trimmed,
            memberIds: [uid],
            memberCount: 1,
            maxMembers: MAX_MEMBERS,
            createdBy: uid,
            createdAt: t,
            jar: null,
            invite: null
          },
          members: { [uid]: newMember(uid, me, 'owner', t, null) },
          tasks: {},
          events: [],
          photos: {},
          treats: {}
        };
        ensureUser(st, uid).householdId = hid;
        return hid;
      });
    },

    async previewInvite(code: string): Promise<InvitePreview> {
      const st = s();
      requireUser(st);
      const inv = liveInvite(st, code);
      return {
        householdName: inv.householdName,
        inviterName: inv.inviterName,
        memberCount: inv.memberCount
      };
    },

    async joinHousehold(code: string, me: NewMemberProfile): Promise<string> {
      return store.mutate((st) => joinAs(st, requireUser(st), code, me));
    },

    async createInvite(hid: string): Promise<Invite> {
      return store.mutate((st) => createInviteFor(st, hid, requireUser(st)));
    },

    async revokeInvite(hid: string, code: string): Promise<void> {
      store.mutate((st) => {
        const rec = memberHousehold(st, hid, requireUser(st));
        const inv = st.invites[code];
        if (!inv || inv.householdId !== hid) throw new RepoError('not-found', 'no such invite');
        inv.revoked = true;
        if (rec.household.invite?.code === code) rec.household.invite = null;
      });
    },

    async leaveHousehold(hid: string): Promise<void> {
      store.mutate((st) => {
        const uid = requireUser(st);
        const rec = memberHousehold(st, hid, uid);
        const h = rec.household;
        // My open tasks go back to "waiting for someone to take". No events: the leaver is no
        // longer a member once the batch commits, so the rules would reject them.
        const t = now();
        for (const task of Object.values(rec.tasks)) {
          if (task.status !== 'open' || task.ownerId !== uid) continue;
          task.ownerId = null;
          task.requestedBy = null;
          task.requestedAt = null;
          touch(task, uid, t);
        }
        delete rec.members[uid];
        h.memberIds = h.memberIds.filter((m) => m !== uid);
        h.memberCount = h.memberIds.length;
        const user = st.users[uid];
        if (user?.householdId === hid) user.householdId = null;
      });
    },

    watchHousehold(hid: string, cb: (h: Household) => void): Unsubscribe {
      return store.watch(() => visible(hid)?.household, cb);
    },

    watchMembers(hid: string, cb: (m: Member[]) => void): Unsubscribe {
      return store.watch(() => {
        const rec = visible(hid);
        if (!rec) return undefined;
        const order = rec.household.memberIds;
        return Object.values(rec.members).sort(
          (a, b) => a.joinedAt - b.joinedAt || order.indexOf(a.uid) - order.indexOf(b.uid)
        );
      }, cb);
    },

    async updateHousehold(hid: string, patch: { name?: string }): Promise<void> {
      store.mutate((st) => {
        const rec = memberHousehold(st, hid, requireUser(st));
        if (patch.name === undefined) return;
        const name = patch.name.trim();
        if (name.length < 1 || name.length > 100) {
          throw new RepoError('permission', 'household name must be 1-100 characters');
        }
        rec.household.name = name;
      });
    },

    async updateMember(
      hid: string,
      patch: Partial<Pick<Member, 'displayName' | 'color' | 'addressAs' | 'notify'>>
    ): Promise<void> {
      store.mutate((st) => {
        const uid = requireUser(st);
        const rec = memberHousehold(st, hid, uid);
        const member = rec.members[uid];
        if (!member) throw new RepoError('not-found', 'no member profile');
        const p = pick(patch, MEMBER_PATCH_KEYS);
        if (p.displayName !== undefined) p.displayName = p.displayName.trim();
        if (p.notify !== undefined) p.notify = { ...p.notify };
        Object.assign(member, p);
      });
    },

    // tasks: reads

    watchOpenTasks(hid: string, cb: (t: Task[]) => void): Unsubscribe {
      return store.watch(() => {
        const rec = visible(hid);
        return rec && sortTasks(Object.values(rec.tasks).filter((t) => t.status === 'open'));
      }, cb);
    },

    watchDoneTasks(
      hid: string,
      limit: number,
      cb: (t: Task[], hasMore: boolean) => void
    ): Unsubscribe {
      const n = Math.max(0, Math.floor(limit));
      return store.watch(
        () => {
          const rec = visible(hid);
          if (!rec) return undefined;
          const done = Object.values(rec.tasks)
            .filter((t) => t.status === 'done')
            .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0) || (a.id < b.id ? -1 : 1));
          return { tasks: done.slice(0, n), hasMore: done.length > n };
        },
        (v) => cb(v.tasks, v.hasMore)
      );
    },

    watchTask(hid: string, id: string, cb: (t: Task | null) => void): Unsubscribe {
      return store.watch(() => {
        const rec = visible(hid);
        return rec && (rec.tasks[id] ?? null);
      }, cb);
    },

    // tasks: writes

    createTask(hid: string, d: TaskDraft): string {
      const id = randomId(20);
      queued((st, uid) => {
        const rec = memberHousehold(st, hid, uid);
        const ownerId = d.ownerId ?? null;
        if (ownerId !== null && !rec.household.memberIds.includes(ownerId)) {
          throw new RepoError('permission', 'the owner is not a member of this household');
        }
        // Amendment [3.2]: creating a task for ANOTHER member is a request.
        const isRequest = ownerId !== null && ownerId !== uid;
        const t = now();
        const dates = {
          scheduledFor: d.scheduledFor ?? null,
          weekPlan: d.weekPlan ?? false,
          dueDate: d.dueDate ?? null,
          recurrence: d.recurrence ?? null
        };
        const task: Task = {
          id,
          title: typeof d.title === 'string' ? d.title.trim() : d.title,
          notes: d.notes ?? '',
          categoryId: d.categoryId ?? null,
          priority: d.priority ?? 'normal',
          ownerId,
          requestedBy: isRequest ? uid : null,
          requestedAt: isRequest ? t : null,
          createdBy: uid,
          createdAt: t,
          updatedBy: uid,
          updatedAt: t,
          scheduledFor: dates.scheduledFor,
          weekPlan: dates.weekPlan,
          dueDate: dates.dueDate,
          dueTime: d.dueTime ?? null,
          hardDeadline: d.hardDeadline ?? false,
          recurrence: ensureAnchor(dates),
          seriesId: null,
          status: 'open',
          snoozeCount: 0,
          lastSnoozedAt: null,
          completedAt: null,
          completedBy: null,
          completion: null
        };
        assertValidTask(task);
        rec.tasks[id] = task;
        pushEvent(rec, 'created', uid, task, t);
        if (isRequest) pushEvent(rec, 'requested', uid, task, t, ownerId);
      });
      return id;
    },

    updateTask(hid: string, id: string, p: TaskPatch): void {
      queued((st, uid) => {
        const rec = memberHousehold(st, hid, uid);
        const task = getTask(rec, id);
        const patch = pick(p, TASK_PATCH_KEYS);
        if (typeof patch.title === 'string') patch.title = patch.title.trim();
        const merged: Task = { ...task, ...patch };
        merged.recurrence = recurrenceAfterEdit(task, patch, merged);
        assertValidTask(merged);
        const t = now();
        Object.assign(task, merged);
        touch(task, uid, t);
        pushEvent(rec, 'edited', uid, task, t);
      });
    },

    async takeTask(hid: string, id: string): Promise<TakeResult> {
      return store.mutate((st): TakeResult => {
        const uid = requireUser(st);
        const rec = memberHousehold(st, hid, uid);
        const task = getTask(rec, id);
        const owner = task.ownerId;
        if (owner === uid) return { ok: true };
        // Someone else's task stays theirs; a former member's counts as unowned ("waiting").
        if (owner !== null && rec.household.memberIds.includes(owner))
          return { ok: false, takenBy: owner };
        const t = now();
        task.ownerId = uid;
        task.requestedBy = null;
        task.requestedAt = null;
        touch(task, uid, t);
        pushEvent(rec, 'taken', uid, task, t);
        return { ok: true };
      });
    },

    requestTask(hid: string, id: string, toUid: string): void {
      queued((st, uid) => {
        const rec = memberHousehold(st, hid, uid);
        const task = getTask(rec, id);
        if (!rec.household.memberIds.includes(toUid)) {
          throw new RepoError('permission', 'can only ask a member of this household');
        }
        const t = now();
        task.ownerId = toUid;
        touch(task, uid, t);
        if (toUid === uid) {
          // Asking myself is taking it: no "ביקש/ה ממך" label on my own task.
          task.requestedBy = null;
          task.requestedAt = null;
          pushEvent(rec, 'taken', uid, task, t);
        } else {
          task.requestedBy = uid;
          task.requestedAt = t;
          pushEvent(rec, 'requested', uid, task, t, toUid);
        }
      });
    },

    releaseTask(hid: string, id: string): void {
      queued((st, uid) => {
        const rec = memberHousehold(st, hid, uid);
        const task = getTask(rec, id);
        const t = now();
        task.ownerId = null;
        task.requestedBy = null;
        task.requestedAt = null;
        touch(task, uid, t);
        pushEvent(rec, 'released', uid, task, t);
      });
    },

    snoozeTask(hid: string, id: string, until: ISODate): void {
      queued((st, uid) => {
        const rec = memberHousehold(st, hid, uid);
        const task = getTask(rec, id);
        if (!isValidISO(until)) throw new RepoError('permission', 'snooze date is not a date');
        const t = now();
        Object.assign(task, snoozePatch(task, until, t, todayISO(t)));
        touch(task, uid, t);
        pushEvent(rec, 'snoozed', uid, task, t);
      });
    },

    async completeTask(
      hid: string,
      id: string,
      c: Omit<Completion, 'photoIds'>,
      photos: EncodedPhoto[]
    ): Promise<CompleteResult> {
      return store.mutate((st): CompleteResult => {
        const uid = requireUser(st);
        const rec = memberHousehold(st, hid, uid);
        const task = getTask(rec, id);
        if (task.status === 'done') throw new RepoError('conflict', 'the task is already done');

        const t = now();
        const docs: Photo[] = photos.slice(0, MAX_PHOTOS).map((e) => ({
          id: randomId(20),
          taskId: id,
          dataUrl: e.dataUrl,
          thumbDataUrl: e.thumbDataUrl,
          width: e.width,
          height: e.height,
          createdBy: uid,
          createdAt: t
        }));
        const next = buildNextInstance(task, isoDateAt(t), t, uid); // from the task as it was
        const jarBefore = rec.household.jar;
        const jarAfter = applyCompletion(jarBefore);
        const jarFilled = !isFull(jarBefore) && isFull(jarAfter);

        for (const p of docs) rec.photos[p.id] = p;
        task.status = 'done';
        task.completedAt = t;
        task.completedBy = uid;
        task.completion = {
          note: c.note,
          cost: typeof c.cost === 'number' && Number.isFinite(c.cost) ? c.cost : null,
          place: c.place,
          contact: c.contact,
          photoIds: docs.map((p) => p.id)
        };
        touch(task, uid, t);
        // Deterministic id: an instance that already exists (completed, reopened and completed
        // again) is kept as it is, so the series never gets a duplicate.
        if (next && !rec.tasks[next.id]) rec.tasks[next.id] = next;
        rec.household.jar = jarAfter;
        pushEvent(rec, 'completed', uid, task, t);
        if (jarFilled) pushEvent(rec, 'jar_filled', uid, null, t);
        return { nextTaskId: next?.id ?? null, jarFilled };
      });
    },

    reopenTask(hid: string, id: string): void {
      queued((st, uid) => {
        const rec = memberHousehold(st, hid, uid);
        const task = getTask(rec, id);
        if (task.status !== 'done') return; // nothing to undo
        const completedAt = task.completedAt ?? now();
        const expected = buildNextInstance(
          task,
          isoDateAt(completedAt),
          completedAt,
          task.completedBy ?? uid
        );
        const photoIds = task.completion?.photoIds ?? [];
        const t = now();

        task.status = 'open';
        task.completedAt = null;
        task.completedBy = null;
        task.completion = null;
        touch(task, uid, t);
        for (const pid of photoIds) delete rec.photos[pid];
        const auto = expected ? rec.tasks[expected.id] : undefined;
        if (expected && auto && isUntouchedInstance(auto, expected)) delete rec.tasks[expected.id];
        rec.household.jar = applyReopen(rec.household.jar);
        pushEvent(rec, 'reopened', uid, task, t);
      });
    },

    deleteTask(hid: string, id: string): void {
      queued((st, uid) => {
        const rec = memberHousehold(st, hid, uid);
        const task = rec.tasks[id];
        if (!task) return; // already gone (like deleting a missing document)
        for (const pid of task.completion?.photoIds ?? []) delete rec.photos[pid];
        delete rec.tasks[id];
        pushEvent(rec, 'deleted', uid, task, now());
      });
    },

    async getPhoto(hid: string, photoId: string): Promise<Photo | null> {
      const st = s();
      const photo = memberHousehold(st, hid, requireUser(st)).photos[photoId];
      return photo ? { ...photo } : null;
    },

    // jar

    setJar(hid: string, j: { treat: string; target: number }): void {
      queued((st, uid) => {
        const rec = memberHousehold(st, hid, uid);
        const treat = typeof j.treat === 'string' ? j.treat.trim() : '';
        if (treat.length < 1 || treat.length > 60)
          throw new RepoError('permission', 'treat must be 1-60 characters');
        if (!Number.isInteger(j.target) || j.target < 3 || j.target > 50) {
          throw new RepoError('permission', 'target must be a whole number from 3 to 50');
        }
        const jar = rec.household.jar;
        rec.household.jar = jar
          ? { ...jar, treat, target: j.target }
          : { treat, target: j.target, count: 0, round: 1, startedAt: now() };
      });
    },

    redeemJar(hid: string): void {
      queued((st, uid) => {
        const rec = memberHousehold(st, hid, uid);
        const jar = rec.household.jar;
        if (!jar) throw new RepoError('not-found', 'there is no jar');
        if (!isFull(jar)) throw new RepoError('conflict', 'the jar is not full yet');
        const t = now();
        let filledAt = t;
        for (let i = rec.events.length - 1; i >= 0; i--) {
          const e = rec.events[i]!;
          if (e.createdAt < jar.startedAt) break;
          if (e.type === 'jar_filled') {
            filledAt = e.createdAt;
            break;
          }
        }
        const id = String(jar.round);
        const treat: EarnedTreat = {
          id,
          treat: jar.treat,
          target: jar.target,
          filledAt,
          redeemedAt: t
        };
        rec.treats[id] = treat;
        rec.household.jar = applyRedeem(jar, t);
        pushEvent(rec, 'jar_redeemed', uid, null, t);
      });
    },

    watchTreats(hid: string, cb: (t: EarnedTreat[]) => void): Unsubscribe {
      return store.watch(() => {
        const rec = visible(hid);
        return rec && Object.values(rec.treats).sort((a, b) => Number(b.id) - Number(a.id));
      }, cb);
    },

    watchRecentEvents(hid: string, limit: number, cb: (e: ActivityEvent[]) => void): Unsubscribe {
      const n = Math.max(0, Math.floor(limit));
      return store.watch(() => {
        const rec = visible(hid);
        if (!rec) return undefined;
        return rec.events
          .map((e, i) => ({ e, i }))
          .sort((a, b) => b.e.createdAt - a.e.createdAt || b.i - a.i)
          .slice(0, n)
          .map(({ e }) => e);
      }, cb);
    },

    // devices & sync

    async registerDevice(d): Promise<void> {
      store.mutate((st) => {
        const user = ensureUser(st, requireUser(st));
        const t = now();
        const prev = user.devices[d.deviceId];
        user.devices[d.deviceId] = {
          deviceId: d.deviceId,
          householdId: d.householdId,
          token: d.token,
          userAgent: d.userAgent,
          createdAt: prev?.createdAt ?? t,
          updatedAt: t
        };
      });
    },

    async unregisterDevice(deviceId: string): Promise<void> {
      store.mutate((st) => {
        const user = ensureUser(st, requireUser(st));
        delete user.devices[deviceId];
      });
    },

    watchSync(cb: (s: SyncState) => void): Unsubscribe {
      return store.watch<SyncState>(() => ({ status: 'synced', pendingWrites: 0 }), cb);
    },

    onWriteError(cb: (e: RepoError) => void): Unsubscribe {
      writeErrorListeners.add(cb);
      return () => {
        writeErrorListeners.delete(cb);
      };
    },

    // demo extras

    actAs(uid: string): void {
      store.mutate((st) => {
        ensureUser(st, uid);
        st.authUid = uid;
        st.lastUid = uid;
      });
    },

    currentUid(): string | null {
      return s().authUid;
    },

    async resetDemo(): Promise<void> {
      store.replace(createSeed(new Date(now())));
      await store.flush();
    },

    async simulateJoin(options: SimulateJoinOptions = {}): Promise<string> {
      return store.mutate((st) => {
        const me = requireUser(st);
        const isFullHousehold = (rec: HouseholdRecord) =>
          rec.household.memberCount >= rec.household.maxMembers;
        // Everything is checked before the first change, so a failed join leaves no trace.
        let code = options.code;
        if (code === undefined) {
          const hid = st.users[me]?.householdId;
          if (!hid) throw new RepoError('not-found', 'join a household first');
          const rec = memberHousehold(st, hid, me);
          if (isFullHousehold(rec)) throw new RepoError('full', 'the household is full');
          const active = rec.household.invite;
          code =
            active && active.expiresAt > now() ? active.code : createInviteFor(st, hid, me).code;
        } else {
          const target = st.households[liveInvite(st, code).householdId];
          if (!target) throw new RepoError('not-found', 'the household no longer exists');
          if (isFullHousehold(target)) throw new RepoError('full', 'the household is full');
        }
        let n = 1;
        while (st.users[`guest-${n}`]) n++;
        const uid = `guest-${n}`;
        const profile = { ...DEMO_GUESTS[(n - 1) % DEMO_GUESTS.length]!, ...options.profile };
        st.users[uid] = {
          profile: {
            uid,
            displayName: profile.displayName,
            email: `${uid}@example.com`,
            photoURL: profile.photoURL
          },
          householdId: null,
          devices: {}
        };
        joinAs(st, uid, code, profile);
        return uid;
      });
    },

    flush: () => store.flush(),

    async dispose(): Promise<void> {
      if (hasWindow) {
        window.removeEventListener('pagehide', onPageHide);
        document.removeEventListener('visibilitychange', onVisibility);
      }
      writeErrorListeners.clear();
      await store.dispose();
    }
  };
  return repo;
}
