// The Repository contract (Blueprint §5 "Write semantics", §11 "Contract"): one adapter-agnostic
// suite that every adapter must pass. It only touches the public `Repository` interface plus the
// factory's helpers below; it never reaches into an adapter's internals. Expected values come from
// the domain modules (snoozePatch, nextTaskId, applyRedeem, ...), which ARE the shared semantics.
//
// Plugging in an adapter:
//
//   runRepositoryContract('firebase', async () => ({
//     repo,                                   // a fresh Repository
//     asUser: (uid) => signInAs(uid),         // resolves once the repo acts as `uid` (new user first time)
//     clock,                                  // optional: the clock the adapter reads for client-side
//                                             // timestamps; without it, time-travel tests are skipped
//     interactiveSignIn: false,               // optional: signInWithGoogle cannot run here (popup)
//     cleanup: () => teardown()               // stop listeners / clear data
//   }), { timeoutMs: 10_000 });
//
// Every test uses fresh, unique uids, so a factory that does not wipe data between tests still works.
// Queued (void) writes are observed through watchers, never by reading internals, so the suite is
// indifferent to latency compensation. Time-dependent expectations are computed from `clock.now()`
// (or the real time) in Asia/Jerusalem, exactly like the adapters do.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RepoError, type NewMemberProfile, type Repository } from '$lib/data/repository';
import { addDays, addMonths, endOfWeek, todayISO } from '$lib/domain/dates';
import { isInviteCode } from '$lib/domain/ids';
import { applyRedeem } from '$lib/domain/jar';
import { nextTaskId } from '$lib/domain/recurrence';
import { snoozePatch } from '$lib/domain/snooze';
import type {
  ActivityEvent,
  AuthUser,
  EarnedTreat,
  EncodedPhoto,
  EventType,
  Household,
  ISODate,
  Member,
  SyncState,
  Task,
  Unsubscribe
} from '$lib/domain/types';

// ── Factory shape ─────────────────────────────────────────────────────────────

/** A controllable clock. The adapter must read it for every client-side timestamp. */
export interface ContractClock {
  now(): number;
  set(ms: number): void;
  advance(ms: number): void;
}

export interface ContractEnv {
  repo: Repository;
  /** Sign in as `uid` (creating the user the first time); resolves once the repo acts as `uid`. */
  asUser(uid: string): Promise<void> | void;
  /** Optional controllable clock. Tests that need to travel in time are skipped without it. */
  clock?: ContractClock;
  /** False where `signInWithGoogle` cannot run (e.g. Node against the Auth emulator). Default true. */
  interactiveSignIn?: boolean;
  cleanup(): Promise<void> | void;
}

export type ContractFactory = () => Promise<ContractEnv>;

export interface ContractOptions {
  /** How long to wait for an expected emission or state, in ms. Default 3000. */
  timeoutMs?: number;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DAY = 86_400_000;

/** A valid 1×1 JPEG (286 bytes), used as a completion photo. */
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAT/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKABpl//2Q==';

const TINY_JPEG_DATA_URL = `data:image/jpeg;base64,${TINY_JPEG_BASE64}`;

/** What platform/image.ts hands over: the adapter only stores it. The 1×1 JPEG doubles as thumbnail. */
function jpegPhoto(): EncodedPhoto {
  return { dataUrl: TINY_JPEG_DATA_URL, thumbDataUrl: TINY_JPEG_DATA_URL, width: 1, height: 1 };
}

const PROFILES = {
  michal: { displayName: 'מיכל', photoURL: null, color: 'terracotta', addressAs: 'f' },
  dani: { displayName: 'דני', photoURL: null, color: 'slate', addressAs: 'm' },
  noa: { displayName: 'נועה', photoURL: null, color: 'sage', addressAs: 'f' },
  yoav: { displayName: 'יואב', photoURL: null, color: 'ochre', addressAs: 'm' },
  ruti: { displayName: 'רותי', photoURL: null, color: 'plum', addressAs: 'f' },
  shira: { displayName: 'שירה', photoURL: null, color: 'teal', addressAs: 'n' }
} satisfies Record<string, NewMemberProfile>;

const NO_DOCS = { note: '', cost: null, place: '', contact: '' };
const ALL_NOTIFY = { requests: true, reminders: true, partnerDone: true, weekly: true };
const PUSH_PENDING: ReadonlySet<EventType> = new Set([
  'requested',
  'accepted',
  'declined',
  'completed',
  'jar_filled'
]);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ── The suite ─────────────────────────────────────────────────────────────────

export function runRepositoryContract(
  name: string,
  factory: ContractFactory,
  options: ContractOptions = {}
): void {
  const T = options.timeoutMs ?? 3000;

  describe(`Repository contract: ${name}`, () => {
    let env!: ContractEnv;
    let repo!: Repository;
    const runId = Math.random().toString(36).slice(2, 8);
    let seq = 0;

    beforeEach(async () => {
      env = await factory();
      repo = env.repo;
    });
    afterEach(async () => {
      await env.cleanup();
    });

    // ── helpers ──────────────────────────────────────────────────────────────

    /** A fresh uid, unique across tests and runs. */
    const user = (label: string) => `${label}-${runId}-${++seq}`;
    const now = () => env.clock?.now() ?? Date.now();
    const today = (): ISODate => todayISO(now());
    /** Moves time forward: the clock when there is one, otherwise a short real wait. */
    const tick = async (ms = 60_000) => {
      if (env.clock) env.clock.advance(ms);
      else await sleep(5);
    };

    /** Resolves with the first emission that satisfies `pred`, then unsubscribes. */
    function until<V>(
      subscribe: (cb: (v: V) => void) => Unsubscribe,
      pred: (v: V) => boolean,
      label: string
    ): Promise<V> {
      return new Promise<V>((resolve, reject) => {
        let finished = false;
        let unsub: Unsubscribe | undefined;
        let last: { v: V } | undefined;
        const finish = () => {
          finished = true;
          clearTimeout(timer);
          unsub?.();
        };
        const timer = setTimeout(() => {
          if (finished) return;
          finish();
          const seen = last ? JSON.stringify(last.v) : '(no emission)';
          reject(new Error(`Timed out after ${T}ms waiting for ${label}. Last: ${seen}`));
        }, T);
        unsub = subscribe((v) => {
          if (finished) return;
          last = { v };
          let ok: boolean;
          try {
            ok = pred(v);
          } catch (e) {
            finish();
            reject(e as Error);
            return;
          }
          if (ok) {
            finish();
            resolve(v);
          }
        });
        if (finished) unsub(); // emitted synchronously, before `unsub` was assigned
      });
    }

    /** Collects every emission until stopped. */
    function record<V>(subscribe: (cb: (v: V) => void) => Unsubscribe) {
      const values: V[] = [];
      const stop = subscribe((v) => values.push(v));
      return { values, stop };
    }

    async function waitFor(check: () => boolean, label: string): Promise<void> {
      const deadline = Date.now() + T;
      while (!check()) {
        if (Date.now() > deadline) throw new Error(`Timed out after ${T}ms waiting for ${label}`);
        await sleep(5);
      }
    }

    const any = () => true;
    const taskOf = (
      hid: string,
      id: string,
      pred: (t: Task | null) => boolean = (t) => t !== null
    ) => until<Task | null>((cb) => repo.watchTask(hid, id, cb), pred, `task ${id}`);
    const existing = async (hid: string, id: string, pred: (t: Task) => boolean = any) =>
      (await taskOf(hid, id, (t) => t !== null && pred(t))) as Task;
    const openOf = (hid: string, pred: (ts: Task[]) => boolean = any) =>
      until<Task[]>((cb) => repo.watchOpenTasks(hid, cb), pred, 'open tasks');
    const doneOf = (
      hid: string,
      limit: number,
      pred: (v: { tasks: Task[]; hasMore: boolean }) => boolean = any
    ) =>
      until<{ tasks: Task[]; hasMore: boolean }>(
        (cb) => repo.watchDoneTasks(hid, limit, (tasks, hasMore) => cb({ tasks, hasMore })),
        pred,
        `done tasks (limit ${limit})`
      );
    const householdOf = (hid: string, pred: (h: Household) => boolean = any) =>
      until<Household>((cb) => repo.watchHousehold(hid, cb), pred, `household ${hid}`);
    const membersOf = (hid: string, pred: (m: Member[]) => boolean = any) =>
      until<Member[]>((cb) => repo.watchMembers(hid, cb), pred, `members of ${hid}`);
    const eventsOf = (hid: string, pred: (e: ActivityEvent[]) => boolean = any, limit = 100) =>
      until<ActivityEvent[]>(
        (cb) => repo.watchRecentEvents(hid, limit, cb),
        pred,
        `events of ${hid}`
      );
    const treatsOf = (hid: string, pred: (t: EarnedTreat[]) => boolean = any) =>
      until<EarnedTreat[]>((cb) => repo.watchTreats(hid, cb), pred, `treats of ${hid}`);
    const jarOf = (hid: string, pred: (j: NonNullable<Household['jar']>) => boolean = any) =>
      householdOf(hid, (h) => h.jar !== null && pred(h.jar)).then((h) => h.jar!);

    const hasEvent =
      (type: EventType, taskId: string | null, extra: (e: ActivityEvent) => boolean = any) =>
      (es: ActivityEvent[]) =>
        es.some((e) => e.type === type && e.taskId === taskId && extra(e));
    const findEvent = (es: ActivityEvent[], type: EventType, taskId: string | null) =>
      es.find((e) => e.type === type && e.taskId === taskId)!;

    /** Every event field, plus the push rule: 'pending' for requested/completed/jar_filled, else 'none'. */
    function expectEventShape(e: ActivityEvent, type: EventType, actorId: string) {
      expect(e.type).toBe(type);
      expect(e.actorId).toBe(actorId);
      expect(typeof e.id).toBe('string');
      expect(e.id.length).toBeGreaterThan(0);
      expect(typeof e.createdAt).toBe('number');
      expect(e.push).toBe(PUSH_PENDING.has(type) ? 'pending' : 'none');
    }

    async function expectRepoError(p: Promise<unknown>, code: RepoError['code']) {
      const err = await p.then(
        () => {
          throw new Error(`expected RepoError('${code}'), but the call resolved`);
        },
        (e: unknown) => e
      );
      expect(err).toBeInstanceOf(RepoError);
      expect((err as RepoError).code).toBe(code);
    }

    /** Collects write errors reported through onWriteError while `fn` runs and afterwards. */
    function captureWriteErrors() {
      const errors: RepoError[] = [];
      const stop = repo.onWriteError((e) => errors.push(e));
      return { errors, stop };
    }

    /** A signed-in user with their own household. */
    async function solo(label = 'michal', profile: NewMemberProfile = PROFILES.michal) {
      const A = user(label);
      await env.asUser(A);
      const hid = await repo.createHousehold('הבית של מיכל', profile);
      return { hid, A };
    }

    /** A household with two members (A owner, B joined by invite); signed in as A afterwards. */
    async function pair() {
      const { hid, A } = await solo();
      const invite = await repo.createInvite(hid);
      const B = user('dani');
      await env.asUser(B);
      await repo.joinHousehold(invite.code, PROFILES.dani);
      await env.asUser(A);
      return { hid, A, B, invite };
    }

    /** `pair()` plus a third member C (נועה); signed in as A afterwards. */
    async function trio() {
      const { hid, A, B } = await pair();
      const invite = await repo.createInvite(hid);
      const C = user('noa');
      await env.asUser(C);
      await repo.joinHousehold(invite.code, PROFILES.noa);
      await env.asUser(A);
      return { hid, A, B, C };
    }

    /** Creates a task and waits until it is visible. */
    async function newTask(hid: string, draft: Parameters<Repository['createTask']>[1]) {
      const id = repo.createTask(hid, draft);
      await existing(hid, id);
      return id;
    }

    /** Waits for a later write to land, proving an earlier write (if any) has been applied. */
    async function sentinel(hid: string) {
      const id = repo.createTask(hid, { title: `sentinel ${++seq}` });
      await existing(hid, id);
    }

    // ── auth ─────────────────────────────────────────────────────────────────

    describe('auth', () => {
      it('identifies its kind', () => {
        expect(['demo', 'firebase']).toContain(repo.kind);
      });

      it('onAuthChange reports the signed-in user and null after signOut', async () => {
        const A = user('michal');
        await env.asUser(A);
        const u = (await until<AuthUser | null>(
          (cb) => repo.onAuthChange(cb),
          (u) => u?.uid === A,
          'auth A'
        ))!;
        expect(typeof u.displayName).toBe('string');
        expect(typeof u.email).toBe('string');
        expect(u.photoURL === null || typeof u.photoURL === 'string').toBe(true);

        await repo.signOut();
        await until<AuthUser | null>(
          (cb) => repo.onAuthChange(cb),
          (u) => u === null,
          'signed out'
        );
        expect(await repo.getMyHouseholdId()).toBeNull();
      });

      it('signInWithGoogle signs a user in', async (ctx) => {
        if (env.interactiveSignIn === false) ctx.skip();
        await repo.signOut();
        await until<AuthUser | null>(
          (cb) => repo.onAuthChange(cb),
          (u) => u === null,
          'signed out'
        );
        await repo.signInWithGoogle();
        const u = await until<AuthUser | null>(
          (cb) => repo.onAuthChange(cb),
          (u) => u !== null,
          'signed in'
        );
        expect(typeof u!.uid).toBe('string');
      });

      it('switching users is reported to an active onAuthChange subscriber', async () => {
        const A = user('michal');
        const B = user('dani');
        await env.asUser(A);
        const rec = record<AuthUser | null>((cb) => repo.onAuthChange(cb));
        await waitFor(() => rec.values.some((u) => u?.uid === A), 'auth A');
        await env.asUser(B);
        await waitFor(() => rec.values.some((u) => u?.uid === B), 'auth B');
        rec.stop();
      });
    });

    // ── household ────────────────────────────────────────────────────────────

    describe('household', () => {
      it('a new user has no household', async () => {
        await env.asUser(user('fresh'));
        expect(await repo.getMyHouseholdId()).toBeNull();
      });

      it('createHousehold makes me its owner and only member', async () => {
        const { hid, A } = await solo();
        expect(typeof hid).toBe('string');
        expect(await repo.getMyHouseholdId()).toBe(hid);

        const h = await householdOf(hid);
        expect(h).toMatchObject({
          id: hid,
          name: 'הבית של מיכל',
          memberIds: [A],
          memberCount: 1,
          maxMembers: 6,
          createdBy: A,
          jar: null,
          invite: null
        });
        expect(typeof h.createdAt).toBe('number');

        const [m, ...rest] = await membersOf(hid, (ms) => ms.length === 1);
        expect(rest).toEqual([]);
        expect(m).toMatchObject({
          uid: A,
          ...PROFILES.michal,
          role: 'owner',
          notify: ALL_NOTIFY,
          inviteCode: null
        });
        expect(typeof m!.joinedAt).toBe('number');
      });

      it('updateHousehold renames the household', async () => {
        const { hid } = await solo();
        await repo.updateHousehold(hid, { name: 'הבית בכפר סבא' });
        const h = await householdOf(hid, (h) => h.name === 'הבית בכפר סבא');
        expect(h.memberCount).toBe(1);
      });

      it('updateMember changes only my own member profile', async () => {
        const { hid, A, B } = await pair();
        await env.asUser(B);
        const notify = { requests: false, reminders: true, partnerDone: false, weekly: false };
        await repo.updateMember(hid, {
          displayName: 'דניאל',
          color: 'teal',
          addressAs: 'n',
          notify
        });
        const ms = await membersOf(hid, (ms) =>
          ms.some((m) => m.uid === B && m.displayName === 'דניאל')
        );
        expect(ms.find((m) => m.uid === B)).toMatchObject({
          color: 'teal',
          addressAs: 'n',
          notify,
          role: 'member'
        });
        expect(ms.find((m) => m.uid === A)).toMatchObject({
          ...PROFILES.michal,
          notify: ALL_NOTIFY
        });
      });

      it('watchMembers lists members in join order, owner first', async () => {
        const { hid, A, B } = await pair();
        const ms = await membersOf(hid, (ms) => ms.length === 2);
        expect(ms.map((m) => m.uid)).toEqual([A, B]);
        expect(ms.map((m) => m.role)).toEqual(['owner', 'member']);
      });
    });

    // ── invites ──────────────────────────────────────────────────────────────

    describe('invites', () => {
      it('createInvite returns a 7-day invite and publishes it on the household', async () => {
        const { hid, A } = await solo();
        const inv = await repo.createInvite(hid);
        expect(isInviteCode(inv.code)).toBe(true);
        expect(inv).toMatchObject({
          householdId: hid,
          householdName: 'הבית של מיכל',
          inviterName: 'מיכל',
          memberCount: 1,
          createdBy: A,
          revoked: false
        });
        expect(inv.expiresAt - inv.createdAt).toBe(7 * DAY);
        const h = await householdOf(hid, (h) => h.invite?.code === inv.code);
        expect(h.invite).toEqual({ code: inv.code, expiresAt: inv.expiresAt });
      });

      it('createInvite revokes the previous active invite', async () => {
        const { hid } = await solo();
        const first = await repo.createInvite(hid);
        const second = await repo.createInvite(hid);
        expect(second.code).not.toBe(first.code);
        await householdOf(hid, (h) => h.invite?.code === second.code);
        await env.asUser(user('guest'));
        await expectRepoError(repo.previewInvite(first.code), 'revoked');
        await expect(repo.previewInvite(second.code)).resolves.toMatchObject({
          householdName: 'הבית של מיכל'
        });
      });

      it('revokeInvite clears the household invite and kills the code', async () => {
        const { hid } = await solo();
        const inv = await repo.createInvite(hid);
        await repo.revokeInvite(hid, inv.code);
        await householdOf(hid, (h) => h.invite === null);
        await env.asUser(user('guest'));
        await expectRepoError(repo.previewInvite(inv.code), 'revoked');
        await expectRepoError(repo.joinHousehold(inv.code, PROFILES.dani), 'revoked');
      });

      it('previewInvite describes the household to a non-member', async () => {
        const { hid } = await solo();
        const inv = await repo.createInvite(hid);
        await env.asUser(user('dani'));
        const preview = await repo.previewInvite(inv.code);
        expect(preview).toEqual({
          householdName: 'הבית של מיכל',
          inviterName: 'מיכל',
          memberCount: 1
        });
      });

      it('an invite carries the member count at creation, and the preview reports it', async () => {
        const { hid } = await pair();
        const inv = await repo.createInvite(hid);
        expect(inv.memberCount).toBe(2);
        await env.asUser(user('guest'));
        expect((await repo.previewInvite(inv.code)).memberCount).toBe(2);
      });

      it('previewInvite of an unknown or malformed code is not-found', async () => {
        await env.asUser(user('guest'));
        await expectRepoError(repo.previewInvite('NoSuchInviteCode00000000'), 'not-found');
        await expectRepoError(repo.previewInvite('short'), 'not-found');
      });
    });

    // ── joining ──────────────────────────────────────────────────────────────

    describe('joinHousehold', () => {
      it('adds me as a member and writes a member_joined event', async () => {
        const { hid, A } = await solo();
        const inv = await repo.createInvite(hid);
        const B = user('dani');
        await env.asUser(B);
        expect(await repo.joinHousehold(inv.code, PROFILES.dani)).toBe(hid);
        expect(await repo.getMyHouseholdId()).toBe(hid);

        const h = await householdOf(hid, (h) => h.memberCount === 2);
        expect(h.memberIds).toEqual([A, B]);
        const ms = await membersOf(hid, (ms) => ms.length === 2);
        expect(ms.find((m) => m.uid === B)).toMatchObject({
          ...PROFILES.dani,
          role: 'member',
          inviteCode: inv.code,
          notify: ALL_NOTIFY
        });
        const es = await eventsOf(
          hid,
          hasEvent('member_joined', null, (e) => e.actorId === B)
        );
        const e = es.find((e) => e.type === 'member_joined')!;
        expectEventShape(e, 'member_joined', B);
        expect(e).toMatchObject({ taskId: null, taskTitle: null, targetId: null });

        await env.asUser(A);
        await membersOf(hid, (ms) => ms.length === 2);
      });

      it('rejects an unknown code with not-found', async () => {
        await env.asUser(user('dani'));
        await expectRepoError(
          repo.joinHousehold('NoSuchInviteCode00000000', PROFILES.dani),
          'not-found'
        );
      });

      it('rejects an expired invite with expired', async (ctx) => {
        const clock = env.clock;
        if (!clock) return ctx.skip();
        const { hid } = await solo();
        const base = clock.now();
        clock.set(base - 8 * DAY); // created 8 days ago, so it expired yesterday
        const inv = await repo.createInvite(hid);
        clock.set(base);
        await env.asUser(user('dani'));
        await expectRepoError(repo.previewInvite(inv.code), 'expired');
        await expectRepoError(repo.joinHousehold(inv.code, PROFILES.dani), 'expired');
      });

      it('rejects a revoked invite with revoked', async () => {
        const { hid } = await solo();
        const old = await repo.createInvite(hid);
        await repo.createInvite(hid); // revokes `old`
        await env.asUser(user('dani'));
        await expectRepoError(repo.joinHousehold(old.code, PROFILES.dani), 'revoked');
      });

      it('rejects a member joining again with already-member', async () => {
        const { hid, A, B, invite } = await pair();
        await env.asUser(B);
        await expectRepoError(repo.joinHousehold(invite.code, PROFILES.dani), 'already-member');
        await env.asUser(A);
        await expectRepoError(repo.joinHousehold(invite.code, PROFILES.michal), 'already-member');
        const h = await householdOf(hid);
        expect(h.memberCount).toBe(2);
      });

      it('rejects a 7th member with full', async () => {
        const { hid } = await solo();
        const inv = await repo.createInvite(hid);
        const joiners = [PROFILES.dani, PROFILES.noa, PROFILES.yoav, PROFILES.ruti, PROFILES.shira];
        for (const p of joiners) {
          await env.asUser(user('member'));
          await repo.joinHousehold(inv.code, p);
        }
        const h = await householdOf(hid, (h) => h.memberCount === 6);
        expect(h.memberIds).toHaveLength(6);
        await env.asUser(user('seventh'));
        await expectRepoError(repo.joinHousehold(inv.code, PROFILES.dani), 'full');
        expect(await repo.getMyHouseholdId()).toBeNull();
      });
    });

    // ── leaving ──────────────────────────────────────────────────────────────

    describe('leaveHousehold', () => {
      it('removes me from the household and clears my household pointer', async () => {
        const { hid, A, B } = await pair();
        await env.asUser(B);
        await repo.leaveHousehold(hid);
        expect(await repo.getMyHouseholdId()).toBeNull();

        await env.asUser(A);
        const h = await householdOf(hid, (h) => h.memberCount === 1);
        expect(h.memberIds).toEqual([A]);
        await membersOf(hid, (ms) => ms.length === 1 && ms[0]!.uid === A);
      });

      it("leaving releases my open tasks and answers requests to me; finished and others' tasks stay", async () => {
        const { hid, A, B } = await pair();
        const requested = await newTask(hid, { title: 'לתקן את הברז', ownerId: B }); // A asks B
        await existing(hid, requested, (t) => t.requestedOf === B);
        const accepted = await newTask(hid, { title: 'להחליף נורה', ownerId: B }); // A asks B…
        await existing(hid, accepted, (t) => t.requestedOf === B);
        await env.asUser(B);
        expect(await repo.acceptRequest(hid, accepted)).toEqual({ ok: true }); // …B accepts
        const mine = await newTask(hid, { title: 'לקנות נורות', ownerId: B });
        const finished = await newTask(hid, { title: 'לשלם חשמל', ownerId: B });
        await repo.completeTask(hid, finished, NO_DOCS, []);
        await env.asUser(A);
        const theirs = await newTask(hid, { title: 'לסדר מרפסת', ownerId: A });
        await env.asUser(B);
        await tick();
        await repo.leaveHousehold(hid);
        expect(await repo.getMyHouseholdId()).toBeNull();

        await env.asUser(A);
        for (const id of [requested, accepted, mine]) {
          const t = await existing(
            hid,
            id,
            (t) => t.ownerId === null && t.requestedBy === null && t.updatedBy === B
          );
          expect(t).toMatchObject({
            requestedOf: null,
            requestedBy: null,
            requestedAt: null,
            updatedBy: B,
            status: 'open'
          });
          expect(t.updatedAt).toBeGreaterThan(t.createdAt);
        }
        expect(await existing(hid, finished)).toMatchObject({ status: 'done', ownerId: B });
        expect(await existing(hid, theirs)).toMatchObject({ ownerId: A, updatedBy: A });
        // No events ride along: the leaver is no longer a member once the leave commits.
        const es = await eventsOf(hid, hasEvent('completed', finished));
        expect(es.some((e) => e.type === 'released')).toBe(false);

        // Released tasks are "waiting", so a remaining member can take them.
        expect(await repo.takeTask(hid, requested)).toEqual({ ok: true });
        await existing(hid, requested, (t) => t.ownerId === A);
      });
    });

    // ── tasks: create & update ───────────────────────────────────────────────

    describe('createTask', () => {
      it('returns the id synchronously; watchers see the task with defaults and a created event', async () => {
        const { hid, A } = await solo();
        const open = record<Task[]>((cb) => repo.watchOpenTasks(hid, cb));
        const id = repo.createTask(hid, { title: 'לקנות חלב' });
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);

        const t = await existing(hid, id);
        expect(t).toMatchObject({
          id,
          title: 'לקנות חלב',
          notes: '',
          categoryId: null,
          priority: 'normal',
          ownerId: null,
          requestedBy: null,
          requestedAt: null,
          requestedOf: null,
          createdBy: A,
          updatedBy: A,
          scheduledFor: null,
          dueDate: null,
          dueTime: null,
          hardDeadline: false,
          recurrence: null,
          seriesId: null,
          status: 'open',
          snoozeCount: 0,
          lastSnoozedAt: null,
          completedAt: null,
          completedBy: null,
          completion: null
        });
        expect(typeof t.createdAt).toBe('number');
        expect(typeof t.updatedAt).toBe('number');
        await waitFor(
          () => open.values.some((ts) => ts.some((x) => x.id === id)),
          'open list has the task'
        );
        open.stop();

        const es = await eventsOf(hid, hasEvent('created', id));
        const e = findEvent(es, 'created', id);
        expectEventShape(e, 'created', A);
        expect(e).toMatchObject({ taskTitle: 'לקנות חלב', targetId: null });
        expect(es.some((x) => x.type === 'requested' && x.taskId === id)).toBe(false);
      });

      it('stores every draft field; a recurring draft is anchored at its date', async () => {
        const { hid, A } = await solo();
        const due = addDays(today(), 5);
        const plan = addDays(today(), 2);
        const id = await newTask(hid, {
          title: 'לשלם ארנונה',
          notes: 'באתר העירייה',
          categoryId: 'finance',
          priority: 'high',
          ownerId: A,
          scheduledFor: plan,
          dueDate: due,
          dueTime: '18:30',
          hardDeadline: true,
          recurrence: { freq: 'monthly' }
        });
        expect(await existing(hid, id)).toMatchObject({
          notes: 'באתר העירייה',
          categoryId: 'finance',
          priority: 'high',
          ownerId: A,
          requestedBy: null,
          scheduledFor: plan,
          dueDate: due,
          dueTime: '18:30',
          hardDeadline: true,
          recurrence: { freq: 'monthly', anchor: due },
          seriesId: null
        });
      });

      it('a week-plan draft stores weekPlan with its Saturday', async () => {
        const { hid } = await solo();
        const saturday = endOfWeek(today());
        const id = await newTask(hid, {
          title: 'לתקן את הברז',
          scheduledFor: saturday,
          weekPlan: true
        });
        expect(await existing(hid, id)).toMatchObject({ scheduledFor: saturday, weekPlan: true });
      });

      it('an undated recurring draft stays unanchored until its first completion', async () => {
        const { hid } = await solo();
        const id = await newTask(hid, { title: 'להשקות עציצים', recurrence: { freq: 'weekly' } });
        expect((await existing(hid, id)).recurrence).toEqual({ freq: 'weekly' });
      });

      it('a draft for ANOTHER member is a request waiting for them (nobody holds it yet)', async () => {
        const { hid, A, B } = await pair();
        const id = await newTask(hid, { title: 'לאסוף חבילה מהדואר', ownerId: B });
        const t = await existing(hid, id);
        expect(t).toMatchObject({ ownerId: null, requestedOf: B, requestedBy: A, createdBy: A });
        expect(typeof t.requestedAt).toBe('number');

        const es = await eventsOf(
          hid,
          (es) => hasEvent('requested', id)(es) && hasEvent('created', id)(es)
        );
        const e = findEvent(es, 'requested', id);
        expectEventShape(e, 'requested', A);
        expect(e).toMatchObject({ targetId: B, taskTitle: 'לאסוף חבילה מהדואר', push: 'pending' });
      });

      it('a draft owned by me is not a request', async () => {
        const { hid, A } = await pair();
        const id = await newTask(hid, { title: 'לקבוע תור לרופא', ownerId: A });
        expect(await existing(hid, id)).toMatchObject({
          ownerId: A,
          requestedBy: null,
          requestedAt: null,
          requestedOf: null
        });
        const es = await eventsOf(hid, hasEvent('created', id));
        expect(es.some((e) => e.type === 'requested' && e.taskId === id)).toBe(false);
      });

      it('an invalid draft (blank title) is rejected through onWriteError and never persists', async () => {
        const { hid } = await solo();
        const cap = captureWriteErrors();
        const id = repo.createTask(hid, { title: '   ' });
        expect(typeof id).toBe('string');
        await waitFor(() => cap.errors.length > 0, 'write error');
        expect(cap.errors[0]).toBeInstanceOf(RepoError);
        await taskOf(hid, id, (t) => t === null);
        cap.stop();
      });
    });

    describe('updateTask', () => {
      it('patches fields, stamps updatedBy and writes an edited event', async () => {
        const { hid, A, B } = await pair();
        const id = await newTask(hid, { title: 'לתקן מדף' });
        await env.asUser(B);
        await tick();
        const due = addDays(today(), 4);
        repo.updateTask(hid, id, {
          title: 'לתקן את המדף בסלון',
          notes: 'צריך ברגים',
          priority: 'high',
          categoryId: 'home',
          dueDate: due,
          dueTime: '10:00',
          hardDeadline: true
        });
        const t = await existing(hid, id, (t) => t.title === 'לתקן את המדף בסלון');
        expect(t).toMatchObject({
          notes: 'צריך ברגים',
          priority: 'high',
          categoryId: 'home',
          dueDate: due,
          dueTime: '10:00',
          hardDeadline: true,
          createdBy: A,
          updatedBy: B
        });
        expect(t.updatedAt).toBeGreaterThan(t.createdAt);
        const es = await eventsOf(hid, hasEvent('edited', id));
        const e = findEvent(es, 'edited', id);
        expectEventShape(e, 'edited', B);
        expect(e.taskTitle).toBe('לתקן את המדף בסלון');
      });

      it('updateTask can set a week plan (weekPlan round-trips, with its Saturday)', async () => {
        const { hid } = await solo();
        const id = await newTask(hid, { title: 'לתקן את הברז' });
        expect((await existing(hid, id)).weekPlan).toBe(false);

        const saturday = endOfWeek(today());
        repo.updateTask(hid, id, { scheduledFor: saturday, weekPlan: true });
        expect(await existing(hid, id, (t) => t.weekPlan)).toMatchObject({
          scheduledFor: saturday,
          weekPlan: true
        });

        const day = addDays(today(), 1);
        repo.updateTask(hid, id, { scheduledFor: day, weekPlan: false });
        expect(await existing(hid, id, (t) => !t.weekPlan)).toMatchObject({
          scheduledFor: day,
          weekPlan: false
        });

        // A patch that leaves weekPlan out leaves it as it was.
        repo.updateTask(hid, id, { scheduledFor: saturday, weekPlan: true });
        await existing(hid, id, (t) => t.weekPlan);
        repo.updateTask(hid, id, { title: 'לתקן את הברז במטבח' });
        expect(await existing(hid, id, (t) => t.title === 'לתקן את הברז במטבח')).toMatchObject({
          scheduledFor: saturday,
          weekPlan: true
        });
      });

      it('a week plan needs a date: weekPlan true without scheduledFor is rejected through onWriteError', async () => {
        const { hid } = await solo();
        const id = await newTask(hid, { title: 'לסדר ארון' });
        const cap = captureWriteErrors();
        repo.updateTask(hid, id, { weekPlan: true });
        const bad = repo.createTask(hid, { title: 'משימה בלי תאריך', weekPlan: true });
        await waitFor(() => cap.errors.length >= 2, 'both rejected writes to be reported');
        cap.stop();
        expect(cap.errors.every((e) => e.code === 'permission')).toBe(true);
        await taskOf(hid, bad, (t) => t === null);
        expect((await existing(hid, id)).weekPlan).toBe(false);
      });

      it('keeps the recurrence anchor unless the date or frequency changes', async () => {
        const { hid } = await solo();
        const due = addDays(today(), 3);
        const id = await newTask(hid, {
          title: 'לשלם ארנונה',
          dueDate: due,
          recurrence: { freq: 'monthly' }
        });
        await existing(hid, id, (t) => t.recurrence?.anchor === due);

        repo.updateTask(hid, id, { notes: 'בהוראת קבע', recurrence: { freq: 'monthly' } });
        expect((await existing(hid, id, (t) => t.notes === 'בהוראת קבע')).recurrence).toEqual({
          freq: 'monthly',
          anchor: due
        });

        const moved = addDays(due, 5);
        repo.updateTask(hid, id, { dueDate: moved });
        expect((await existing(hid, id, (t) => t.dueDate === moved)).recurrence).toEqual({
          freq: 'monthly',
          anchor: moved
        });

        repo.updateTask(hid, id, { recurrence: { freq: 'weekly' } });
        expect(
          (await existing(hid, id, (t) => t.recurrence?.freq === 'weekly')).recurrence
        ).toEqual({
          freq: 'weekly',
          anchor: moved
        });

        repo.updateTask(hid, id, { recurrence: null });
        await existing(hid, id, (t) => t.recurrence === null);
      });
    });

    // ── ownership ────────────────────────────────────────────────────────────

    describe('take / request / release', () => {
      it('takeTask on an unowned task makes it mine and writes a taken event', async () => {
        const { hid, B } = await pair();
        const id = await newTask(hid, { title: 'להוציא את הזבל' });
        await env.asUser(B);
        expect(await repo.takeTask(hid, id)).toEqual({ ok: true });
        const t = await existing(hid, id, (t) => t.ownerId === B);
        expect(t).toMatchObject({ requestedBy: null, requestedAt: null, updatedBy: B });
        const es = await eventsOf(hid, hasEvent('taken', id));
        expectEventShape(findEvent(es, 'taken', id), 'taken', B);
      });

      it('takeTask on my own task is ok', async () => {
        const { hid, A } = await solo();
        const id = await newTask(hid, { title: 'לקנות מתנה', ownerId: A });
        expect(await repo.takeTask(hid, id)).toEqual({ ok: true });
      });

      it('takeTask on a task someone else took returns {ok:false, takenBy}', async () => {
        const { hid, A, B } = await pair();
        const id = await newTask(hid, { title: 'לקחת את הרכב למוסך' });
        await env.asUser(B);
        expect(await repo.takeTask(hid, id)).toEqual({ ok: true });
        await env.asUser(A);
        expect(await repo.takeTask(hid, id)).toEqual({ ok: false, takenBy: B });
        expect((await existing(hid, id)).ownerId).toBe(B);
      });

      it('takeTask on a missing task rejects with not-found', async () => {
        const { hid } = await solo();
        await expectRepoError(repo.takeTask(hid, 'no-such-task'), 'not-found');
      });

      it('requestTask is a proposal: nobody holds it, requestedOf=target, a pending requested event', async () => {
        const { hid, A, B } = await pair();
        const id = await newTask(hid, { title: 'להתקשר לחברת הביטוח' });
        await tick();
        repo.requestTask(hid, id, B);
        const t = await existing(hid, id, (t) => t.requestedOf === B);
        expect(t).toMatchObject({ ownerId: null, requestedBy: A, updatedBy: A });
        expect(typeof t.requestedAt).toBe('number');
        const es = await eventsOf(hid, hasEvent('requested', id));
        const e = findEvent(es, 'requested', id);
        expectEventShape(e, 'requested', A);
        expect(e).toMatchObject({ targetId: B, taskTitle: 'להתקשר לחברת הביטוח' });
      });

      it('requestTask on a task someone holds hands it over only once they accept', async () => {
        const { hid, A, B } = await pair();
        const id = await newTask(hid, { title: 'להחליף פילטר למזגן', ownerId: A });
        repo.requestTask(hid, id, B);
        expect(await existing(hid, id, (t) => t.requestedOf === B)).toMatchObject({
          ownerId: null,
          requestedBy: A
        });
      });

      it('requestTask to myself is a take (no request)', async () => {
        const { hid, A } = await pair();
        const id = await newTask(hid, { title: 'לשלם חשבון חשמל' });
        repo.requestTask(hid, id, A);
        const t = await existing(hid, id, (t) => t.ownerId === A);
        expect(t).toMatchObject({ requestedBy: null, requestedAt: null, requestedOf: null });
        await eventsOf(hid, hasEvent('taken', id));
      });

      it('requestTask to a non-member is rejected through onWriteError', async () => {
        const { hid } = await solo();
        const id = await newTask(hid, { title: 'לנקות את המחסן' });
        const cap = captureWriteErrors();
        repo.requestTask(hid, id, user('stranger'));
        await waitFor(() => cap.errors.length > 0, 'write error');
        expect(cap.errors[0]).toBeInstanceOf(RepoError);
        cap.stop();
        expect((await existing(hid, id)).ownerId).toBeNull();
      });

      it('releaseTask clears the owner and the request, with a released event', async () => {
        const { hid, A, B } = await pair();
        const id = await newTask(hid, { title: 'לסדר את הארון', ownerId: B });
        await existing(hid, id, (t) => t.requestedOf === B);
        await env.asUser(B);
        expect(await repo.acceptRequest(hid, id)).toEqual({ ok: true });
        await existing(hid, id, (t) => t.ownerId === B && t.requestedBy === A);
        repo.releaseTask(hid, id);
        const t = await existing(hid, id, (t) => t.ownerId === null);
        expect(t).toMatchObject({
          requestedBy: null,
          requestedAt: null,
          requestedOf: null,
          updatedBy: B
        });
        const es = await eventsOf(hid, hasEvent('released', id));
        expectEventShape(findEvent(es, 'released', id), 'released', B);
      });
    });

    // ── requests: a proposal until the asked member answers ─────────────────

    describe('requests', () => {
      /** A asks B (pair) and waits until the request is visible; signed in as A. */
      async function asked(hid: string, B: string, title = 'לאסוף את הכביסה מהמכבסה') {
        const id = await newTask(hid, { title });
        repo.requestTask(hid, id, B);
        // Settled (server-stamped requestedAt), so it can be compared after the answer.
        return (await existing(hid, id, (t) => t.requestedOf === B && t.pending !== true)).id;
      }

      it('acceptRequest by the asked member: theirs, the request kept as history, the asker told', async () => {
        const { hid, A, B } = await pair();
        const id = await asked(hid, B);
        const before = await existing(hid, id);
        await env.asUser(B);
        await tick();
        expect(await repo.acceptRequest(hid, id)).toEqual({ ok: true });
        const t = await existing(hid, id, (t) => t.ownerId === B);
        expect(t).toMatchObject({
          requestedOf: null,
          requestedBy: A,
          requestedAt: before.requestedAt,
          updatedBy: B
        });
        const es = await eventsOf(hid, hasEvent('accepted', id));
        const e = findEvent(es, 'accepted', id);
        expectEventShape(e, 'accepted', B);
        expect(e).toMatchObject({ targetId: A, push: 'pending', taskTitle: before.title });
        expect(es.some((x) => x.type === 'taken' && x.taskId === id)).toBe(false);
      });

      it('takeTask by the asked member is the same accept', async () => {
        const { hid, A, B } = await pair();
        const id = await asked(hid, B);
        await env.asUser(B);
        expect(await repo.takeTask(hid, id)).toEqual({ ok: true });
        expect(await existing(hid, id, (t) => t.ownerId === B)).toMatchObject({
          requestedOf: null,
          requestedBy: A
        });
        await eventsOf(
          hid,
          hasEvent('accepted', id, (e) => e.targetId === A)
        );
      });

      it('anyone may still take a waiting request; the request is then cleared', async () => {
        const { hid, A, B, C } = await trio();
        const id = await asked(hid, B);
        await env.asUser(C);
        expect(await repo.takeTask(hid, id)).toEqual({ ok: true });
        expect(await existing(hid, id, (t) => t.ownerId === C)).toMatchObject({
          requestedOf: null,
          requestedBy: null,
          requestedAt: null
        });
        await eventsOf(hid, hasEvent('taken', id));
        // B's late "yes" is answered like a late take.
        await env.asUser(B);
        expect(await repo.acceptRequest(hid, id)).toEqual({ ok: false, takenBy: C });
        // The asker may take it too.
        const other = await (async () => {
          await env.asUser(A);
          return asked(hid, B, 'להזמין גז');
        })();
        expect(await repo.takeTask(hid, other)).toEqual({ ok: true });
        expect(await existing(hid, other, (t) => t.ownerId === A)).toMatchObject({
          requestedOf: null,
          requestedBy: null
        });
      });

      it('acceptRequest after the request was cancelled is a plain take', async () => {
        const { hid, B } = await pair();
        const id = await asked(hid, B);
        repo.cancelRequest(hid, id);
        await existing(hid, id, (t) => t.requestedOf === null);
        await env.asUser(B);
        expect(await repo.acceptRequest(hid, id)).toEqual({ ok: true });
        expect(await existing(hid, id, (t) => t.ownerId === B)).toMatchObject({
          requestedBy: null
        });
        await eventsOf(
          hid,
          hasEvent('taken', id, (e) => e.actorId === B)
        );
      });

      it('declineRequest by the asked member: back to waiting for anyone, the asker told gently', async () => {
        const { hid, A, B } = await pair();
        const id = await asked(hid, B);
        await env.asUser(B);
        await tick();
        repo.declineRequest(hid, id);
        const t = await existing(hid, id, (t) => t.requestedOf === null);
        expect(t).toMatchObject({
          ownerId: null,
          requestedBy: null,
          requestedAt: null,
          updatedBy: B
        });
        const es = await eventsOf(hid, hasEvent('declined', id));
        const e = findEvent(es, 'declined', id);
        expectEventShape(e, 'declined', B);
        expect(e).toMatchObject({ targetId: A, push: 'pending' });
      });

      it('cancelRequest by the asker: back to waiting, a released event naming the asked member, no push', async () => {
        const { hid, A, B } = await pair();
        const id = await asked(hid, B);
        await tick();
        repo.cancelRequest(hid, id);
        const t = await existing(hid, id, (t) => t.requestedOf === null);
        expect(t).toMatchObject({
          ownerId: null,
          requestedBy: null,
          requestedAt: null,
          updatedBy: A
        });
        const es = await eventsOf(hid, hasEvent('released', id));
        const e = findEvent(es, 'released', id);
        expectEventShape(e, 'released', A);
        expect(e).toMatchObject({ targetId: B, push: 'none' });
      });

      it('only the asked member declines, and only they or the asker cancel', async () => {
        const { hid, A, B, C } = await trio();
        const id = await asked(hid, B);
        // Nothing waits for A's or C's answer: their decline is a no-op.
        for (const who of [A, C]) {
          await env.asUser(who);
          const cap = captureWriteErrors();
          repo.declineRequest(hid, id);
          await sentinel(hid);
          cap.stop();
          expect(cap.errors).toEqual([]);
        }
        // C neither asked nor was asked: cancelling is refused.
        const cap = captureWriteErrors();
        repo.cancelRequest(hid, id);
        await waitFor(() => cap.errors.length > 0, 'write error');
        expect(cap.errors[0]).toBeInstanceOf(RepoError);
        expect(cap.errors[0]!.code).toBe('permission');
        cap.stop();
        await sentinel(hid);
        expect(await existing(hid, id)).toMatchObject({ requestedOf: B, requestedBy: A });
        const es = await eventsOf(hid);
        expect(es.some((e) => e.taskId === id && ['declined', 'released'].includes(e.type))).toBe(
          false
        );
        // The asked member may withdraw it as well.
        await env.asUser(B);
        repo.cancelRequest(hid, id);
        await existing(hid, id, (t) => t.requestedOf === null && t.requestedBy === null);
      });

      it('declining or cancelling when nothing waits changes nothing', async () => {
        const { hid, B } = await pair();
        const id = await newTask(hid, { title: 'לתלות תמונה' });
        await env.asUser(B);
        const cap = captureWriteErrors();
        repo.declineRequest(hid, id);
        repo.cancelRequest(hid, id);
        await sentinel(hid);
        cap.stop();
        expect(cap.errors).toEqual([]);
        expect(await existing(hid, id)).toMatchObject({ ownerId: null, requestedBy: null });
        const es = await eventsOf(hid);
        expect(es.filter((e) => e.taskId === id).map((e) => e.type)).toEqual(['created']);
      });

      it('releaseTask on a waiting request withdraws it, and only for the asker or the asked', async () => {
        const { hid, A, B, C } = await trio();
        const id = await asked(hid, B);
        await env.asUser(C);
        const cap = captureWriteErrors();
        repo.releaseTask(hid, id);
        await waitFor(() => cap.errors.length > 0, 'write error');
        expect(cap.errors[0]!.code).toBe('permission');
        cap.stop();
        await env.asUser(A);
        repo.releaseTask(hid, id);
        expect(await existing(hid, id, (t) => t.requestedOf === null)).toMatchObject({
          ownerId: null,
          requestedBy: null
        });
        await eventsOf(
          hid,
          hasEvent('released', id, (e) => e.targetId === B && e.actorId === A)
        );
      });

      it('asking someone else replaces a waiting request', async () => {
        const { hid, A, B, C } = await trio();
        const id = await asked(hid, B);
        repo.requestTask(hid, id, C);
        expect(await existing(hid, id, (t) => t.requestedOf === C)).toMatchObject({
          ownerId: null,
          requestedBy: A
        });
        await env.asUser(B);
        repo.declineRequest(hid, id); // no longer waiting for B: nothing to decline
        await sentinel(hid);
        expect((await existing(hid, id)).requestedOf).toBe(C);
      });
    });

    // ── snooze ───────────────────────────────────────────────────────────────

    describe('snoozeTask', () => {
      async function snoozeAndCompare(hid: string, id: string, until: ISODate) {
        const before = await existing(hid, id);
        repo.snoozeTask(hid, id, until);
        const after = await existing(hid, id, (t) => t.snoozeCount === before.snoozeCount + 1);
        const expected = snoozePatch(before, until, after.lastSnoozedAt!, today());
        expect(after.scheduledFor).toBe(expected.scheduledFor);
        expect(after.dueDate).toBe(expected.dueDate ?? before.dueDate);
        expect(after.snoozeCount).toBe(expected.snoozeCount);
        expect(typeof after.lastSnoozedAt).toBe('number');
        return { before, after };
      }

      it('moves a soft due date with the plan and counts the snooze', async () => {
        const { hid, A } = await solo();
        const id = await newTask(hid, { title: 'לקבוע טכנאי', dueDate: addDays(today(), 1) });
        const until = addDays(today(), 7);
        const { after } = await snoozeAndCompare(hid, id, until);
        expect(after).toMatchObject({
          scheduledFor: until,
          dueDate: until,
          snoozeCount: 1,
          updatedBy: A
        });
        const es = await eventsOf(hid, hasEvent('snoozed', id));
        expectEventShape(findEvent(es, 'snoozed', id), 'snoozed', A);
      });

      it('keeps a hard deadline that is still ahead', async () => {
        const { hid } = await solo();
        const due = addDays(today(), 5);
        const id = await newTask(hid, { title: 'להחליף חולצה', dueDate: due, hardDeadline: true });
        const until = addDays(today(), 2);
        const { after } = await snoozeAndCompare(hid, id, until);
        expect(after).toMatchObject({ scheduledFor: until, dueDate: due, hardDeadline: true });
      });

      it('moves a hard deadline that was already missed', async () => {
        const { hid } = await solo();
        const id = await newTask(hid, {
          title: 'להגיש טופס',
          dueDate: addDays(today(), -1),
          hardDeadline: true
        });
        const until = addDays(today(), 1);
        const { after } = await snoozeAndCompare(hid, id, until);
        expect(after.dueDate).toBe(until);
      });

      it('accumulates snoozeCount and never touches the recurrence anchor', async () => {
        const { hid } = await solo();
        const due = addDays(today(), 1);
        const id = await newTask(hid, {
          title: 'להשקות',
          dueDate: due,
          recurrence: { freq: 'weekly' }
        });
        await snoozeAndCompare(hid, id, addDays(today(), 2));
        const { after } = await snoozeAndCompare(hid, id, addDays(today(), 3));
        expect(after.snoozeCount).toBe(2);
        expect(after.recurrence).toEqual({ freq: 'weekly', anchor: due });
      });
    });

    // ── delete ───────────────────────────────────────────────────────────────

    describe('deleteTask', () => {
      it('removes the task and writes a deleted event that keeps the title', async () => {
        const { hid, A } = await solo();
        const id = await newTask(hid, { title: 'לבטל מנוי לחדר כושר' });
        repo.deleteTask(hid, id);
        await taskOf(hid, id, (t) => t === null);
        await openOf(hid, (ts) => !ts.some((t) => t.id === id));
        const es = await eventsOf(hid, hasEvent('deleted', id));
        const e = findEvent(es, 'deleted', id);
        expectEventShape(e, 'deleted', A);
        expect(e.taskTitle).toBe('לבטל מנוי לחדר כושר');
      });

      it('deleting a completed task removes its photos', async () => {
        const { hid } = await solo();
        const id = await newTask(hid, { title: 'קבלה על תיקון' });
        await repo.completeTask(hid, id, NO_DOCS, [jpegPhoto()]);
        const t = await existing(hid, id, (t) => t.status === 'done');
        const [photoId] = t.completion!.photoIds;
        expect(await repo.getPhoto(hid, photoId!)).not.toBeNull();
        repo.deleteTask(hid, id);
        await taskOf(hid, id, (t) => t === null);
        expect(await repo.getPhoto(hid, photoId!)).toBeNull();
      });
    });

    // ── completion ───────────────────────────────────────────────────────────

    describe('completeTask', () => {
      it('marks the task done with its documentation and writes a pending completed event', async () => {
        const { hid, A, B } = await pair();
        const id = await newTask(hid, { title: 'החלפת מצבר', categoryId: 'car', ownerId: A });
        await env.asUser(B);
        const docs = {
          note: 'אחריות לשנתיים',
          cost: 650,
          place: 'מוסך השרון, כפר סבא',
          contact: 'יוסי · 050-1234567'
        };
        expect(await repo.completeTask(hid, id, docs, [])).toEqual({
          nextTaskId: null,
          jarFilled: false
        });

        const t = await existing(hid, id, (t) => t.status === 'done');
        expect(t).toMatchObject({
          completedBy: B,
          ownerId: A,
          completion: { ...docs, photoIds: [] }
        });
        expect(typeof t.completedAt).toBe('number');
        await openOf(hid, (ts) => !ts.some((x) => x.id === id));
        await doneOf(hid, 10, (v) => v.tasks.some((x) => x.id === id));

        const es = await eventsOf(hid, hasEvent('completed', id));
        const e = findEvent(es, 'completed', id);
        expectEventShape(e, 'completed', B);
        expect(e).toMatchObject({ taskTitle: 'החלפת מצבר', push: 'pending' });
      });

      it('increments the jar by one', async () => {
        const { hid } = await solo();
        repo.setJar(hid, { treat: 'ארוחה במסעדה', target: 10 });
        await jarOf(hid);
        const id = await newTask(hid, { title: 'לשטוף את הרכב' });
        await repo.completeTask(hid, id, NO_DOCS, []);
        expect((await jarOf(hid, (j) => j.count === 1)).count).toBe(1);
      });

      it('rejects with not-found for a missing task, and conflict when it is already done', async () => {
        const { hid } = await solo();
        await expectRepoError(repo.completeTask(hid, 'no-such-task', NO_DOCS, []), 'not-found');
        const id = await newTask(hid, { title: 'לתלות כביסה' });
        await repo.completeTask(hid, id, NO_DOCS, []);
        await expectRepoError(repo.completeTask(hid, id, NO_DOCS, []), 'conflict');
      });

      it('creates the next recurring instance exactly once, with a deterministic id and the anchor', async () => {
        const { hid, A } = await solo();
        repo.setJar(hid, { treat: 'סרט', target: 10 });
        await jarOf(hid);
        const due = addDays(today(), 3);
        const id = await newTask(hid, {
          title: 'לשלם ארנונה',
          categoryId: 'finance',
          priority: 'urgent',
          ownerId: A,
          dueDate: due,
          recurrence: { freq: 'monthly' }
        });
        const next1 = addMonths(due, 1);
        const r1 = await repo.completeTask(hid, id, NO_DOCS, []);
        expect(r1).toEqual({ nextTaskId: nextTaskId(id, next1), jarFilled: false });

        const n1 = await existing(hid, r1.nextTaskId!);
        expect(n1).toMatchObject({
          title: 'לשלם ארנונה',
          categoryId: 'finance',
          priority: 'normal', // an urgent instance does not recur as urgent
          ownerId: A,
          status: 'open',
          dueDate: next1,
          scheduledFor: null,
          recurrence: { freq: 'monthly', anchor: due },
          seriesId: id,
          snoozeCount: 0,
          requestedBy: null,
          completion: null
        });

        // A second completion of the same instance must not double-count or duplicate.
        await expectRepoError(repo.completeTask(hid, id, NO_DOCS, []), 'conflict');
        const open = await openOf(hid, (ts) => ts.some((t) => t.id === n1.id));
        expect(open.filter((t) => t.seriesId === id || t.id === id)).toHaveLength(1);
        expect((await jarOf(hid)).count).toBe(1);
        const es = await eventsOf(hid, hasEvent('completed', id));
        expect(es.filter((e) => e.type === 'completed' && e.taskId === id)).toHaveLength(1);

        // The next instance continues the same series from the same anchor.
        const r2 = await repo.completeTask(hid, n1.id, NO_DOCS, []);
        const next2 = addMonths(due, 2);
        expect(r2.nextTaskId).toBe(nextTaskId(id, next2));
        expect(await existing(hid, r2.nextTaskId!)).toMatchObject({
          dueDate: next2,
          seriesId: id,
          recurrence: { freq: 'monthly', anchor: due }
        });
      });

      it('jarFilled is true exactly when the jar reaches its target, with a pending jar_filled event', async () => {
        const { hid, A } = await solo();
        repo.setJar(hid, { treat: 'גלידה בנמל', target: 3 });
        await jarOf(hid);
        const ids: string[] = [];
        for (const title of ['א', 'ב', 'ג', 'ד'])
          ids.push(await newTask(hid, { title: `משימה ${title}` }));
        const results: boolean[] = [];
        for (const id of ids)
          results.push((await repo.completeTask(hid, id, NO_DOCS, [])).jarFilled);
        expect(results).toEqual([false, false, true, false]);
        expect((await jarOf(hid, (j) => j.count === 4)).count).toBe(4);

        const es = await eventsOf(hid, (es) => es.some((e) => e.type === 'jar_filled'));
        const filled = es.filter((e) => e.type === 'jar_filled');
        expect(filled).toHaveLength(1);
        expectEventShape(filled[0]!, 'jar_filled', A);
        expect(filled[0]).toMatchObject({ taskId: null, push: 'pending' });
      });

      it('stores up to 3 photos, retrievable with getPhoto', async () => {
        const { hid, A } = await solo();
        const id = await newTask(hid, { title: 'קבלה על מזגן' });
        const photos = [jpegPhoto(), jpegPhoto(), jpegPhoto(), jpegPhoto()];
        await repo.completeTask(hid, id, { ...NO_DOCS, note: 'הקבלה בתמונה' }, photos);
        const t = await existing(hid, id, (t) => t.status === 'done');
        const ids = t.completion!.photoIds;
        expect(ids).toHaveLength(3);
        expect(new Set(ids).size).toBe(3);
        for (const pid of ids) {
          const p = await repo.getPhoto(hid, pid);
          expect(p).toMatchObject({ id: pid, taskId: id, createdBy: A });
          expect(p!.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
          expect(p!.thumbDataUrl).toMatch(/^data:image\//);
          expect(typeof p!.width).toBe('number');
          expect(typeof p!.height).toBe('number');
          expect(typeof p!.createdAt).toBe('number');
        }
        expect(await repo.getPhoto(hid, 'no-such-photo')).toBeNull();
      });
    });

    // ── reopen ───────────────────────────────────────────────────────────────

    describe('reopenTask', () => {
      it('undoes a completion: open again, jar −1, photos removed, reopened event', async () => {
        const { hid, A } = await solo();
        repo.setJar(hid, { treat: 'ארוחה', target: 10 });
        await jarOf(hid);
        const id = await newTask(hid, { title: 'לתקן את הידית' });
        await repo.completeTask(hid, id, { ...NO_DOCS, cost: 60 }, [jpegPhoto()]);
        const done = await existing(hid, id, (t) => t.status === 'done');
        await jarOf(hid, (j) => j.count === 1);

        repo.reopenTask(hid, id);
        const t = await existing(hid, id, (t) => t.status === 'open');
        expect(t).toMatchObject({ completedAt: null, completedBy: null, completion: null });
        expect((await jarOf(hid, (j) => j.count === 0)).count).toBe(0);
        expect(await repo.getPhoto(hid, done.completion!.photoIds[0]!)).toBeNull();
        await doneOf(hid, 10, (v) => !v.tasks.some((x) => x.id === id));
        const es = await eventsOf(hid, hasEvent('reopened', id));
        expectEventShape(findEvent(es, 'reopened', id), 'reopened', A);
      });

      it('deletes the auto-created next instance when it is untouched', async () => {
        const { hid } = await solo();
        const id = await newTask(hid, {
          title: 'לשלם ועד בית',
          dueDate: today(),
          recurrence: { freq: 'monthly' }
        });
        const { nextTaskId: next } = await repo.completeTask(hid, id, NO_DOCS, []);
        await existing(hid, next!);
        repo.reopenTask(hid, id);
        await existing(hid, id, (t) => t.status === 'open');
        await taskOf(hid, next!, (t) => t === null);
        const open = await openOf(hid);
        expect(open.filter((t) => t.id === id || t.seriesId === id)).toHaveLength(1);
      });

      it('keeps the next instance once someone edited or snoozed it', async () => {
        const { hid } = await solo();
        const edited = await newTask(hid, {
          title: 'לשלם ועד בית',
          dueDate: today(),
          recurrence: { freq: 'monthly' }
        });
        const snoozed = await newTask(hid, {
          title: 'להשקות',
          dueDate: today(),
          recurrence: { freq: 'weekly' }
        });
        const r1 = await repo.completeTask(hid, edited, NO_DOCS, []);
        const r2 = await repo.completeTask(hid, snoozed, NO_DOCS, []);
        repo.updateTask(hid, r1.nextTaskId!, { notes: 'שונה' });
        await existing(hid, r1.nextTaskId!, (t) => t.notes === 'שונה');
        repo.snoozeTask(hid, r2.nextTaskId!, addDays(today(), 10));
        await existing(hid, r2.nextTaskId!, (t) => t.snoozeCount === 1);

        repo.reopenTask(hid, edited);
        repo.reopenTask(hid, snoozed);
        await existing(hid, edited, (t) => t.status === 'open');
        await existing(hid, snoozed, (t) => t.status === 'open');
        await sentinel(hid);
        expect(await existing(hid, r1.nextTaskId!)).toMatchObject({ notes: 'שונה' });
        expect(await existing(hid, r2.nextTaskId!)).toMatchObject({ snoozeCount: 1 });
      });

      it('is a no-op on a task that is not done, and never takes the jar below 0', async () => {
        const { hid } = await solo();
        const id = await newTask(hid, { title: 'לקנות לחם' });
        await repo.completeTask(hid, id, NO_DOCS, []); // no jar yet
        repo.setJar(hid, { treat: 'פיצה', target: 5 }); // count 0
        await jarOf(hid);
        repo.reopenTask(hid, id);
        await existing(hid, id, (t) => t.status === 'open');
        await sentinel(hid);
        expect((await jarOf(hid)).count).toBe(0);

        const other = await newTask(hid, { title: 'לקנות ביצים' });
        repo.reopenTask(hid, other); // not done: nothing to undo
        await sentinel(hid);
        const es = await eventsOf(hid);
        expect(es.some((e) => e.type === 'reopened' && e.taskId === other)).toBe(false);
        expect((await existing(hid, other)).status).toBe('open');
      });
    });

    // ── jar & treats ─────────────────────────────────────────────────────────

    describe('jar and treats', () => {
      it('setJar starts a jar at 0 in round 1; changing it keeps count and round', async () => {
        const { hid } = await solo();
        repo.setJar(hid, { treat: 'ארוחה במסעדה', target: 10 });
        const jar = await jarOf(hid);
        expect(jar).toMatchObject({ treat: 'ארוחה במסעדה', target: 10, count: 0, round: 1 });
        expect(typeof jar.startedAt).toBe('number');

        for (const title of ['א', 'ב']) {
          await repo.completeTask(hid, await newTask(hid, { title }), NO_DOCS, []);
        }
        await jarOf(hid, (j) => j.count === 2);
        repo.setJar(hid, { treat: 'סרט בקולנוע', target: 5 });
        expect(await jarOf(hid, (j) => j.treat === 'סרט בקולנוע')).toEqual({
          ...jar,
          treat: 'סרט בקולנוע',
          target: 5,
          count: 2
        });
      });

      it('setJar outside the allowed range is rejected through onWriteError', async () => {
        const { hid } = await solo();
        const cap = captureWriteErrors();
        repo.setJar(hid, { treat: 'גלידה', target: 2 });
        await waitFor(() => cap.errors.length > 0, 'write error');
        expect(cap.errors[0]).toBeInstanceOf(RepoError);
        cap.stop();
        await sentinel(hid);
        expect((await householdOf(hid)).jar).toBeNull();
      });

      it('redeemJar writes treats/{round}, resets per applyRedeem and writes jar_redeemed', async () => {
        const { hid, A } = await solo();
        repo.setJar(hid, { treat: 'ארוחה במסעדה', target: 3 });
        await jarOf(hid);
        for (const title of ['א', 'ב', 'ג', 'ד']) {
          await repo.completeTask(hid, await newTask(hid, { title }), NO_DOCS, []);
        }
        const full = await jarOf(hid, (j) => j.count === 4);
        await tick();
        repo.redeemJar(hid);
        const jar = await jarOf(hid, (j) => j.round === 2);
        const expected = applyRedeem(full, jar.startedAt)!;
        expect(jar).toEqual(expected);
        expect(jar.count).toBe(1); // the surplus carries over
        expect(jar.startedAt).toBeGreaterThanOrEqual(full.startedAt);

        const [treat, ...rest] = await treatsOf(hid, (ts) => ts.length === 1);
        expect(rest).toEqual([]);
        expect(treat).toMatchObject({ id: '1', treat: 'ארוחה במסעדה', target: 3 });
        expect(typeof treat!.filledAt).toBe('number');
        expect(typeof treat!.redeemedAt).toBe('number');
        expect(treat!.filledAt).toBeLessThanOrEqual(treat!.redeemedAt!);

        const es = await eventsOf(hid, (es) => es.some((e) => e.type === 'jar_redeemed'));
        const e = es.find((e) => e.type === 'jar_redeemed')!;
        expectEventShape(e, 'jar_redeemed', A);
        expect(e.taskId).toBeNull();
      });

      it('redeemJar on a jar that is not full changes nothing', async () => {
        const { hid } = await solo();
        repo.setJar(hid, { treat: 'גלידה', target: 5 });
        await jarOf(hid);
        await repo.completeTask(hid, await newTask(hid, { title: 'א' }), NO_DOCS, []);
        await jarOf(hid, (j) => j.count === 1);
        const cap = captureWriteErrors();
        repo.redeemJar(hid);
        await sentinel(hid);
        cap.stop();
        expect(await jarOf(hid)).toMatchObject({ count: 1, round: 1 });
        expect(await treatsOf(hid)).toEqual([]);
      });

      it('watchTreats lists earned treats newest round first', async () => {
        const { hid } = await solo();
        for (const treat of ['גלידה בנמל', 'סרט בקולנוע']) {
          repo.setJar(hid, { treat, target: 3 });
          await jarOf(hid, (j) => j.treat === treat);
          for (const title of ['א', 'ב', 'ג']) {
            await repo.completeTask(hid, await newTask(hid, { title }), NO_DOCS, []);
          }
          await jarOf(hid, (j) => j.count === 3);
          repo.redeemJar(hid);
          await jarOf(hid, (j) => j.count === 0);
        }
        const ts = await treatsOf(hid, (ts) => ts.length === 2);
        expect(ts.map((t) => [t.id, t.treat])).toEqual([
          ['2', 'סרט בקולנוע'],
          ['1', 'גלידה בנמל']
        ]);
      });
    });

    // ── watchers ─────────────────────────────────────────────────────────────

    describe('watchers', () => {
      it('watchOpenTasks, watchDoneTasks and watchTask update live', async () => {
        const { hid } = await solo();
        const open = record<Task[]>((cb) => repo.watchOpenTasks(hid, cb));
        const done = record<{ tasks: Task[]; hasMore: boolean }>((cb) =>
          repo.watchDoneTasks(hid, 5, (tasks, hasMore) => cb({ tasks, hasMore }))
        );
        await waitFor(() => open.values.length > 0 && done.values.length > 0, 'initial emissions');
        expect(open.values.at(-1)).toEqual([]);
        expect(done.values.at(-1)).toEqual({ tasks: [], hasMore: false });

        const id = repo.createTask(hid, { title: 'לקנות פרחים' });
        const single = record<Task | null>((cb) => repo.watchTask(hid, id, cb));
        await waitFor(() => open.values.at(-1)!.some((t) => t.id === id), 'open has task');
        await waitFor(() => single.values.at(-1)?.status === 'open', 'task open');

        await repo.completeTask(hid, id, NO_DOCS, []);
        await waitFor(() => !open.values.at(-1)!.some((t) => t.id === id), 'open lost task');
        await waitFor(() => done.values.at(-1)!.tasks.some((t) => t.id === id), 'done has task');
        await waitFor(() => single.values.at(-1)?.status === 'done', 'task done');

        repo.deleteTask(hid, id);
        await waitFor(() => single.values.at(-1) === null, 'task deleted');
        open.stop();
        done.stop();
        single.stop();
      });

      it('watchDoneTasks honours the limit, sorts by completedAt desc and reports hasMore', async () => {
        const { hid } = await solo();
        const ids: string[] = [];
        for (const title of ['ראשונה', 'שנייה', 'שלישית']) {
          const id = await newTask(hid, { title });
          await repo.completeTask(hid, id, NO_DOCS, []);
          ids.push(id);
          await tick();
        }
        const two = await doneOf(hid, 2, (v) => v.tasks.length === 2 && v.hasMore);
        expect(two.tasks.map((t) => t.id)).toEqual([ids[2], ids[1]]);
        const all = await doneOf(hid, 5, (v) => v.tasks.length === 3);
        expect(all.hasMore).toBe(false);
        expect(all.tasks.map((t) => t.id)).toEqual([ids[2], ids[1], ids[0]]);
        const exact = await doneOf(hid, 3, (v) => v.tasks.length === 3);
        expect(exact.hasMore).toBe(false);
      });

      it('watchRecentEvents is newest first and honours the limit', async () => {
        const { hid } = await solo();
        for (const title of ['א', 'ב', 'ג', 'ד']) {
          await newTask(hid, { title });
          await tick();
        }
        const es = await eventsOf(hid, (es) => es.length === 3 && es[0]!.taskTitle === 'ד', 3);
        expect(es.map((e) => e.taskTitle)).toEqual(['ד', 'ג', 'ב']);
        for (let i = 1; i < es.length; i++)
          expect(es[i - 1]!.createdAt).toBeGreaterThanOrEqual(es[i]!.createdAt);
      });

      it('events never leak across households', async () => {
        const { hid: h1, A } = await solo();
        const t1 = await newTask(h1, { title: 'משימה של בית 1' });
        const C = user('carol');
        await env.asUser(C);
        const h2 = await repo.createHousehold('בית 2', PROFILES.noa);
        const t2 = await newTask(h2, { title: 'משימה של בית 2' });

        const foreign = record<ActivityEvent[]>((cb) => repo.watchRecentEvents(h1, 50, cb));
        const own = await eventsOf(h2, hasEvent('created', t2));
        expect(own.every((e) => e.taskId !== t1)).toBe(true);
        await sentinel(h2);
        foreign.stop();
        expect(foreign.values.every((es) => es.length === 0)).toBe(true);

        await env.asUser(A);
        const mine = await eventsOf(h1, hasEvent('created', t1));
        expect(mine.every((e) => e.taskId !== t2)).toBe(true);
      });

      it('unsubscribing stops every kind of callback', async () => {
        const { hid } = await solo();
        const id = await newTask(hid, { title: 'בדיקה' });
        const recs = [
          record((cb) => repo.watchHousehold(hid, cb)),
          record((cb) => repo.watchMembers(hid, cb)),
          record((cb) => repo.watchOpenTasks(hid, cb)),
          record((cb) => repo.watchDoneTasks(hid, 10, (t, m) => cb([t, m]))),
          record((cb) => repo.watchTask(hid, id, cb)),
          record((cb) => repo.watchRecentEvents(hid, 10, cb)),
          record((cb) => repo.watchTreats(hid, cb))
        ];
        await waitFor(() => recs.every((r) => r.values.length > 0), 'initial emissions');
        for (const r of recs) r.stop();
        const counts = recs.map((r) => r.values.length);

        repo.setJar(hid, { treat: 'גלידה', target: 3 });
        await repo.updateHousehold(hid, { name: 'שם חדש' });
        await repo.updateMember(hid, { displayName: 'מיכלי' });
        repo.updateTask(hid, id, { title: 'בדיקה 2' });
        await repo.completeTask(hid, id, NO_DOCS, []);
        await householdOf(hid, (h) => h.name === 'שם חדש' && h.jar?.count === 1);
        await sleep(20);
        expect(recs.map((r) => r.values.length)).toEqual(counts);
      });
    });

    // ── devices, sync, errors, permissions ───────────────────────────────────

    describe('devices, sync and errors', () => {
      it('registerDevice and unregisterDevice resolve (and are idempotent)', async () => {
        const { hid } = await solo();
        const deviceId = `device-${runId}-${++seq}`;
        await expect(
          repo.registerDevice({ deviceId, householdId: hid, token: 't1', userAgent: 'vitest' })
        ).resolves.toBeUndefined();
        await expect(
          repo.registerDevice({ deviceId, householdId: hid, token: 't2', userAgent: 'vitest' })
        ).resolves.toBeUndefined();
        await expect(repo.unregisterDevice(deviceId)).resolves.toBeUndefined();
        await expect(repo.unregisterDevice(deviceId)).resolves.toBeUndefined();
      });

      it('watchSync emits a sync state', async () => {
        await solo();
        const s = await until<SyncState>((cb) => repo.watchSync(cb), any, 'sync state');
        expect(['synced', 'saving', 'offline']).toContain(s.status);
        expect(s.pendingWrites).toBeGreaterThanOrEqual(0);
      });

      it('onWriteError is subscribable and unsubscribable', async () => {
        await solo();
        const stop = repo.onWriteError(() => {});
        expect(typeof stop).toBe('function');
        stop();
      });

      it("a non-member's queued write is reported through onWriteError and changes nothing", async () => {
        const { hid, A } = await solo();
        const id = await newTask(hid, { title: 'רק לחברי הבית' });
        await env.asUser(user('stranger'));
        const cap = captureWriteErrors();
        repo.updateTask(hid, id, { title: 'נפרץ' });
        await waitFor(() => cap.errors.length > 0, 'write error');
        expect(cap.errors[0]).toBeInstanceOf(RepoError);
        expect(cap.errors[0]!.code).toBe('permission');
        cap.stop();
        await expectRepoError(repo.takeTask(hid, id), 'permission');
        await env.asUser(A);
        expect((await existing(hid, id)).title).toBe('רק לחברי הבית');
      });

      it('a non-member sees nothing of the household', async () => {
        const { hid } = await solo();
        const id = await newTask(hid, { title: 'פרטי' });
        await env.asUser(user('stranger'));
        const recs = [
          record<unknown>((cb) => repo.watchHousehold(hid, cb)),
          record<unknown>((cb) => repo.watchTask(hid, id, cb)),
          record<Task[]>((cb) => repo.watchOpenTasks(hid, cb))
        ];
        const own = await repo.createHousehold('בית אחר', PROFILES.noa);
        await sentinel(own);
        for (const r of recs) r.stop();
        expect(recs[0]!.values).toEqual([]);
        expect(recs[1]!.values.every((v) => v === null)).toBe(true);
        expect((recs[2]!.values as Task[][]).every((ts) => ts.length === 0)).toBe(true);
      });
    });
  });
}
