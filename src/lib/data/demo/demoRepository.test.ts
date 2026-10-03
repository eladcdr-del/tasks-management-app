// Demo-only behaviour. The shared semantics are covered by tests/contract (demo.contract.test.ts).
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepoError } from '../repository';
import type {
  ActivityEvent,
  AuthUser,
  EarnedTreat,
  Household,
  Member,
  SyncState,
  Task,
  Unsubscribe
} from '../../domain/types';
import {
  createDemoRepository,
  DEMO_GUESTS,
  type DemoRepository,
  type DemoRepositoryOptions
} from './demoRepository';
import { DANI, DEMO_HOUSEHOLD_ID as HID, MICHAL, SEED_RECEIPT_JPEG } from './seed';
import { emptyState, memoryPersistence, type Persistence } from './store';

const NOW = Date.parse('2026-10-04T09:00:00+03:00');
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let keySeq = 0;
const uniqueKey = () => `homecare.demo.test.${++keySeq}.${Math.random().toString(36).slice(2)}`;
const live: DemoRepository[] = [];

async function make(options: DemoRepositoryOptions = {}): Promise<DemoRepository> {
  const repo = await createDemoRepository({ now: () => NOW, storageKey: uniqueKey(), ...options });
  live.push(repo);
  return repo;
}

afterEach(async () => {
  await Promise.all(live.splice(0).map((r) => r.dispose()));
  vi.restoreAllMocks();
});

/** The current value of a watcher (its first emission). */
function current<V>(subscribe: (cb: (v: V) => void) => Unsubscribe): Promise<V> {
  return new Promise((resolve) => {
    let stop: Unsubscribe | undefined = undefined;
    let done = false;
    stop = subscribe((v) => {
      if (done) return;
      done = true;
      resolve(v);
      queueMicrotask(() => stop?.());
    });
  });
}

const openTasks = (r: DemoRepository) => current<Task[]>((cb) => r.watchOpenTasks(HID, cb));
const members = (r: DemoRepository) => current<Member[]>((cb) => r.watchMembers(HID, cb));
const household = (r: DemoRepository) => current<Household>((cb) => r.watchHousehold(HID, cb));
const authUser = (r: DemoRepository) => current<AuthUser | null>((cb) => r.onAuthChange(cb));

function jpegBlob(): Blob {
  const b64 = SEED_RECEIPT_JPEG.slice(SEED_RECEIPT_JPEG.indexOf(',') + 1);
  return new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/jpeg' });
}

describe('demo repository: the seeded household', () => {
  it('starts signed in as מיכל in "הבית שלנו"', async () => {
    const repo = await make();
    expect(repo.kind).toBe('demo');
    expect(repo.currentUid()).toBe(MICHAL);
    expect(await authUser(repo)).toEqual({
      uid: MICHAL,
      displayName: 'מיכל',
      email: 'michal@example.com',
      photoURL: null
    });
    expect(await repo.getMyHouseholdId()).toBe(HID);
    expect((await household(repo)).name).toBe('הבית שלנו');
    expect((await members(repo)).map((m) => m.displayName)).toEqual(['מיכל', 'דני']);
  });

  it('serves the seed through every watcher', async () => {
    const repo = await make();
    const open = await openTasks(repo);
    expect(open).toHaveLength(16);
    expect(open.every((t) => !('pending' in t))).toBe(true);
    const done = await current<[Task[], boolean]>((cb) =>
      repo.watchDoneTasks(HID, 10, (t, m) => cb([t, m]))
    );
    expect(done[0]).toHaveLength(10);
    expect(done[1]).toBe(true);
    expect(done[0][0]!.title).toBe('תיקון הידית בדלת המרפסת'); // completed yesterday
    const treats = await current<EarnedTreat[]>((cb) => repo.watchTreats(HID, cb));
    expect(treats.map((t) => t.treat)).toEqual(['סרט בקולנוע', 'גלידה בנמל']);
    const events = await current<ActivityEvent[]>((cb) => repo.watchRecentEvents(HID, 3, cb));
    expect(events).toHaveLength(3);
    expect(events[0]!.taskId).toBe('seed-bulbs'); // the newest: דני added it last night
    expect(await current<SyncState>((cb) => repo.watchSync(cb))).toEqual({
      status: 'synced',
      pendingWrites: 0
    });
    const photo = await repo.getPhoto(HID, 'seed-photo-battery');
    expect(photo?.taskId).toBe('seed-battery');
  });

  it('previews an invite with the live member count', async () => {
    const repo = await make();
    const inv = await repo.createInvite(HID);
    expect(await repo.previewInvite(inv.code)).toEqual({
      householdName: 'הבית שלנו',
      inviterName: 'מיכל',
      memberCount: 2
    });
  });

  it('runs the whole jar story: three more completions fill it, redeeming starts round 4', async () => {
    const repo = await make();
    const ids = ['seed-dentist', 'seed-bulbs', 'seed-shirt'];
    const results = [];
    for (const id of ids)
      results.push(
        await repo.completeTask(HID, id, { note: '', cost: null, place: '', contact: '' }, [])
      );
    expect(results.map((r) => r.jarFilled)).toEqual([false, false, true]);
    expect((await household(repo)).jar).toMatchObject({ count: 10, round: 3 });
    repo.redeemJar(HID);
    expect((await household(repo)).jar).toMatchObject({
      count: 0,
      round: 4,
      treat: 'ארוחה במסעדה'
    });
    const treats = await current<EarnedTreat[]>((cb) => repo.watchTreats(HID, cb));
    expect(treats[0]).toMatchObject({
      id: '3',
      treat: 'ארוחה במסעדה',
      target: 10,
      redeemedAt: NOW,
      filledAt: NOW
    });
  });

  it('completing the seeded ארנונה creates next month’s instance in the same series', async () => {
    const repo = await make();
    const arnona = (await openTasks(repo)).find((t) => t.seriesId === 'seed-arnona')!;
    const r = await repo.completeTask(
      HID,
      arnona.id,
      { note: 'שולם', cost: 486, place: '', contact: '' },
      []
    );
    expect(r.nextTaskId).toBe('seed-arnona__2026-11-14');
    const next = (await openTasks(repo)).find((t) => t.id === r.nextTaskId)!;
    expect(next).toMatchObject({
      dueDate: '2026-11-14',
      recurrence: { freq: 'monthly', anchor: '2026-08-14' }
    });
  });
});

describe('demo repository: watchers are notified synchronously after writes', () => {
  it('a created task is in the open list before createTask returns to the caller’s next line', async () => {
    const repo = await make();
    const lists: Task[][] = [];
    const stop = repo.watchOpenTasks(HID, (ts) => lists.push(ts));
    await sleep(0);
    const id = repo.createTask(HID, { title: 'לקנות חלב' });
    expect(lists.at(-1)!.some((t) => t.id === id)).toBe(true);
    stop();
  });
});

describe('demo repository: actAs', () => {
  it('switches the signed-in member, which every write then attributes', async () => {
    const repo = await make();
    const users: (string | null)[] = [];
    const stop = repo.onAuthChange((u) => users.push(u?.uid ?? null));
    await sleep(0);
    repo.actAs(DANI);
    expect(users).toEqual([MICHAL, DANI]);
    expect(repo.currentUid()).toBe(DANI);

    const id = repo.createTask(HID, { title: 'לקנות מתנה לאמא', ownerId: MICHAL });
    const t = (await openTasks(repo)).find((x) => x.id === id)!;
    expect(t).toMatchObject({ createdBy: DANI, ownerId: MICHAL, requestedBy: DANI });

    repo.actAs(MICHAL);
    expect(await repo.takeTask(HID, 'seed-plumber')).toEqual({ ok: false, takenBy: DANI });
    stop();
  });

  it('can become a brand-new user, who has no household', async () => {
    const repo = await make();
    repo.actAs('neighbour');
    expect(await authUser(repo)).toMatchObject({ uid: 'neighbour', displayName: 'neighbour' });
    expect(await repo.getMyHouseholdId()).toBeNull();
    await expect(repo.takeTask(HID, 'seed-bulbs')).rejects.toMatchObject({ code: 'permission' });
  });

  it('signInWithGoogle after signOut signs back in as the last user', async () => {
    const repo = await make();
    repo.actAs(DANI);
    await repo.signOut();
    expect(await authUser(repo)).toBeNull();
    await repo.signInWithGoogle();
    expect((await authUser(repo))?.uid).toBe(DANI);
  });
});

describe('demo repository: simulateJoin', () => {
  it('lets a guest accept my household’s invite (created on demand)', async () => {
    const repo = await make();
    const uid = await repo.simulateJoin();
    expect(uid).toBe('guest-1');
    expect(repo.currentUid()).toBe(MICHAL); // I stay signed in as myself
    const h = await household(repo);
    expect(h.memberIds).toEqual([MICHAL, DANI, uid]);
    expect(h.invite).not.toBeNull();
    const m = (await members(repo)).find((x) => x.uid === uid)!;
    expect(m).toMatchObject({
      displayName: DEMO_GUESTS[0]!.displayName,
      role: 'member',
      inviteCode: h.invite!.code
    });
    const events = await current<ActivityEvent[]>((cb) => repo.watchRecentEvents(HID, 1, cb));
    expect(events[0]).toMatchObject({ type: 'member_joined', actorId: uid, push: 'none' });

    expect(await repo.simulateJoin({ profile: { displayName: 'יעל' } })).toBe('guest-2');
    expect((await members(repo)).at(-1)).toMatchObject({
      displayName: 'יעל',
      color: DEMO_GUESTS[1]!.color
    });
  });

  it('reports invite errors and a full household without side effects', async () => {
    const repo = await make();
    const old = await repo.createInvite(HID);
    await repo.createInvite(HID);
    await expect(repo.simulateJoin({ code: old.code })).rejects.toMatchObject({ code: 'revoked' });
    for (let i = 0; i < 4; i++) await repo.simulateJoin();
    expect((await household(repo)).memberCount).toBe(6);
    await expect(repo.simulateJoin()).rejects.toBeInstanceOf(RepoError);
    await expect(repo.simulateJoin()).rejects.toMatchObject({ code: 'full' });
    expect((await household(repo)).memberCount).toBe(6);
  });
});

describe('demo repository: persistence', () => {
  it('survives re-instantiation (a page reload) through IndexedDB', async () => {
    const storageKey = uniqueKey();
    const first = await make({ storageKey });
    const id = first.createTask(HID, { title: 'להזמין טכנאי למזגן' });
    first.actAs(DANI);
    await first.flush();

    const second = await make({ storageKey, now: () => NOW + 86_400_000 });
    expect(second.currentUid()).toBe(DANI);
    const open = await openTasks(second);
    expect(open.find((t) => t.id === id)?.title).toBe('להזמין טכנאי למזגן');
    expect(open).toHaveLength(17);
  });

  it('saves on its own after the debounce delay', async () => {
    const storageKey = uniqueKey();
    const first = await make({ storageKey, persistDelayMs: 5 });
    first.createTask(HID, { title: 'משימה שנשמרת לבד' });
    await sleep(60);
    const second = await make({ storageKey });
    expect((await openTasks(second)).some((t) => t.title === 'משימה שנשמרת לבד')).toBe(true);
  });

  it('`reset` ignores the saved state and reseeds', async () => {
    const storageKey = uniqueKey();
    const first = await make({ storageKey });
    first.createTask(HID, { title: 'תיעלם' });
    await first.flush();
    const second = await make({ storageKey, reset: true });
    expect(await openTasks(second)).toHaveLength(16);
  });

  it('starts fresh when the saved data is unreadable or from another version', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken: Persistence = {
      load: async () => {
        throw new Error('blocked');
      },
      save: async () => {},
      clear: async () => {}
    };
    expect(await openTasks(await make({ persistence: broken }))).toHaveLength(16);
    expect(warn).toHaveBeenCalled();
    const old: Persistence = {
      load: async () => ({ version: 0 }),
      save: async () => {},
      clear: async () => {}
    };
    expect(await openTasks(await make({ persistence: old }))).toHaveLength(16);
  });

  it('works in memory or without persistence', async () => {
    const mem = memoryPersistence();
    const a = await make({ persistence: mem });
    a.createTask(HID, { title: 'בזיכרון' });
    await a.flush();
    expect(mem.saved?.households[HID]?.tasks).toBeDefined();
    const b = await make({ persistence: 'none' });
    b.createTask(HID, { title: 'בלי שמירה' });
    await expect(b.flush()).resolves.toBeUndefined();
  });
});

describe('demo repository: resetDemo', () => {
  it('reseeds everything, signs in as מיכל and persists the fresh seed', async () => {
    const storageKey = uniqueKey();
    const repo = await make({ storageKey });
    repo.createTask(HID, { title: 'משהו חדש' });
    await repo.completeTask(
      HID,
      'seed-bulbs',
      { note: '', cost: null, place: '', contact: '' },
      []
    );
    repo.actAs(DANI);
    const lists: Task[][] = [];
    const stop = repo.watchOpenTasks(HID, (ts) => lists.push(ts));
    await sleep(0);
    expect(lists.at(-1)).toHaveLength(16);

    await repo.resetDemo();
    expect(repo.currentUid()).toBe(MICHAL);
    expect(lists.at(-1)).toHaveLength(16);
    expect(lists.at(-1)!.some((t) => t.title === 'משהו חדש')).toBe(false);
    expect(lists.at(-1)!.some((t) => t.id === 'seed-bulbs')).toBe(true);
    expect((await household(repo)).jar?.count).toBe(7);
    stop();

    const reloaded = await make({ storageKey });
    expect(reloaded.currentUid()).toBe(MICHAL);
    expect(await openTasks(reloaded)).toHaveLength(16);
  });
});

describe('demo repository: other options', () => {
  it("initial 'empty' starts signed out with no data", async () => {
    const repo = await make({ initial: 'empty', persistence: 'none' });
    expect(await authUser(repo)).toBeNull();
    expect(await repo.getMyHouseholdId()).toBeNull();
    await repo.signInWithGoogle();
    expect((await authUser(repo))?.uid).toBe(MICHAL);
    expect(await repo.getMyHouseholdId()).toBeNull();
  });

  it('stores completion photos exactly, with their pixel size', async () => {
    const repo = await make();
    await repo.completeTask(HID, 'seed-bulbs', { note: '', cost: null, place: '', contact: '' }, [
      jpegBlob()
    ]);
    const t = (await current<Task | null>((cb) => repo.watchTask(HID, 'seed-bulbs', cb)))!;
    const photo = await repo.getPhoto(HID, t.completion!.photoIds[0]!);
    expect(photo).toMatchObject({
      dataUrl: SEED_RECEIPT_JPEG,
      width: 120,
      height: 160,
      createdBy: MICHAL,
      createdAt: NOW
    });
  });

  it('accepts a custom photo encoder (e.g. one that makes real thumbnails)', async () => {
    const encodePhoto = vi.fn(async () => ({
      dataUrl: 'data:image/jpeg;base64,AA==',
      thumbDataUrl: 'data:image/jpeg;base64,AQ==',
      width: 4,
      height: 3
    }));
    const repo = await make({ encodePhoto });
    await repo.completeTask(HID, 'seed-bulbs', { note: '', cost: null, place: '', contact: '' }, [
      jpegBlob()
    ]);
    const t = (await current<Task | null>((cb) => repo.watchTask(HID, 'seed-bulbs', cb)))!;
    expect(await repo.getPhoto(HID, t.completion!.photoIds[0]!)).toMatchObject({
      thumbDataUrl: 'data:image/jpeg;base64,AQ==',
      width: 4
    });
    expect(encodePhoto).toHaveBeenCalledTimes(1);
  });

  it('logs a failed queued write when nobody listens to onWriteError', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const repo = await make({ persistence: 'none' });
    repo.updateTask(HID, 'no-such-task', { title: 'x' });
    await sleep(0);
    expect(warn).toHaveBeenCalledWith(
      '[demo] a queued write failed',
      expect.objectContaining({ code: 'not-found' })
    );
  });

  it('keeps registered devices per user', async () => {
    const mem = memoryPersistence();
    const repo = await make({ persistence: mem });
    await repo.registerDevice({
      deviceId: 'd1',
      householdId: HID,
      token: 't1',
      userAgent: 'Pixel 7'
    });
    await repo.registerDevice({
      deviceId: 'd1',
      householdId: HID,
      token: 't2',
      userAgent: 'Pixel 7'
    });
    await repo.flush();
    expect(mem.saved?.users[MICHAL]?.devices.d1).toMatchObject({
      token: 't2',
      createdAt: NOW,
      updatedAt: NOW
    });
    await repo.unregisterDevice('d1');
    await repo.flush();
    expect(mem.saved?.users[MICHAL]?.devices.d1).toBeUndefined();
  });

  it('rejects promise-returning writes when signed out', async () => {
    const repo = await make({
      persistence: { ...memoryPersistence(), load: async () => emptyState() }
    });
    await expect(repo.createHousehold('בית', DEMO_GUESTS[0]!)).rejects.toMatchObject({
      code: 'permission'
    });
    await expect(
      repo.registerDevice({ deviceId: 'd', householdId: 'h', token: 't', userAgent: 'u' })
    ).rejects.toMatchObject({ code: 'permission' });
  });
});
