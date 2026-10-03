// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoRepository, type DemoRepository } from '$lib/data/demo/demoRepository';
import { DANI, DEMO_HOUSEHOLD_ID as HID, MICHAL } from '$lib/data/demo/seed';
import type { Task } from '$lib/domain/types';
import { he } from '$lib/i18n/he';
import { groupTasks, pulseCounts } from '$lib/domain/buckets';
import { DELETE_DELAY_MS, DONE_PAGE_SIZE, TasksStore } from './tasks.svelte';
import { UiStore } from './ui.svelte';
import { ClockStore } from './clock.svelte';

const NOW = Date.parse('2026-10-04T09:00:00+03:00');
const MEMBERS = [MICHAL, DANI];
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const microtasks = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

let repo: DemoRepository;
let ui: UiStore;
let store: TasksStore;
let clock: ClockStore;

async function setup(opts: { now?: () => number; memberIds?: readonly string[] } = {}) {
  const now = opts.now ?? (() => NOW);
  repo = await createDemoRepository({ now, persistence: 'none' });
  ui = new UiStore();
  ui.bindRepo(repo);
  const ids = opts.memberIds ?? MEMBERS;
  clock = new ClockStore({ now });
  store = new TasksStore({ ui, clock, memberIds: () => ids });
  store.setUser(MICHAL);
}

afterEach(async () => {
  store.detach();
  await repo.dispose();
  vi.useRealTimers();
});

describe('TasksStore reads (seed, Sunday 2026-10-04 09:00)', () => {
  beforeEach(async () => {
    await setup();
    store.attach({ repo, householdId: HID });
    await flush();
  });

  it('derives groups, pulse and per-member counts with the domain functions', () => {
    expect(store.openLoaded).toBe(true);
    expect(store.today).toBe('2026-10-04');
    expect(store.open).toHaveLength(16);
    expect(store.pulse).toEqual({ attention: 3, today: 4, waiting: 3 });
    const g = store.groups;
    expect([g.attention, g.waiting, g.today, g.week, g.later].map((l) => l.length)).toEqual([
      3, 3, 4, 5, 4
    ]);
    expect(store.countsByMember).toEqual({ [MICHAL]: 7, [DANI]: 6 });
  });

  it('done tasks (newest first), recent events, byId and eventsFor', () => {
    expect(store.doneLoaded).toBe(true);
    expect(store.done).toHaveLength(14);
    expect(store.hasMoreDone).toBe(false);
    const completed = store.done.map((t) => t.completedAt ?? 0);
    expect([...completed].sort((a, b) => b - a)).toEqual(completed);
    const battery = store.done.find((t) => t.title === 'החלפת מצבר');
    expect(battery?.completion?.cost).toBe(650);
    expect(store.byId(battery!.id)).toEqual(battery);
    const open = store.open[0]!;
    expect(store.byId(open.id)).toEqual(open);
    expect(store.byId('nope')).toBeNull();
    expect(store.recentEvents.length).toBeGreaterThan(0);
    const withTask = store.recentEvents.find((e) => e.taskId !== null)!;
    expect(store.eventsFor(withTask.taskId!).every((e) => e.taskId === withTask.taskId)).toBe(true);
  });

  it('treats owners outside memberIds as unowned (a member who left)', async () => {
    store.detach();
    await repo.dispose();
    await setup({ memberIds: [MICHAL] });
    store.attach({ repo, householdId: HID });
    await flush();
    expect(store.countsByMember).toEqual({ [MICHAL]: 7 });
    expect(store.pulse.waiting).toBeGreaterThan(3);
  });
});

describe('TasksStore writes', () => {
  beforeEach(async () => {
    await setup();
    store.attach({ repo, householdId: HID });
    await flush();
  });

  it('create / update write through and the snapshot updates the reads', () => {
    const id = store.create({ title: 'לקנות נורות', scheduledFor: '2026-10-04' });
    expect(id).toEqual(expect.any(String));
    expect(store.byId(id!)?.title).toBe('לקנות נורות');
    expect(store.pulse.today).toBe(5);
    store.update(id!, { title: 'לקנות נורות LED' });
    expect(store.byId(id!)?.title).toBe('לקנות נורות LED');
  });

  it('take / release / request move ownership', async () => {
    const waiting = store.groups.waiting[0]!;
    expect(await store.take(waiting.id)).toEqual({ ok: true });
    expect(store.byId(waiting.id)?.ownerId).toBe(MICHAL);
    expect(store.pulse.waiting).toBe(2);
    store.release(waiting.id);
    expect(store.byId(waiting.id)?.ownerId).toBeNull();
    store.request(waiting.id, DANI);
    expect(store.byId(waiting.id)).toMatchObject({ ownerId: DANI, requestedBy: MICHAL });
  });

  it('take of a task someone else owns reports who has it', async () => {
    const danis = store.open.find((t) => t.ownerId === DANI)!;
    expect(await store.take(danis.id)).toEqual({ ok: false, takenBy: DANI });
  });

  it('snooze, complete (→ done) and reopen', async () => {
    const t = store.groups.today.find((x) => x.ownerId === MICHAL)!;
    store.snooze(t.id, '2026-10-05');
    expect(store.byId(t.id)?.snoozeCount).toBe(t.snoozeCount + 1);
    const result = await store.complete(t.id, { note: 'בוצע', cost: null, place: '', contact: '' });
    expect(result).toMatchObject({ jarFilled: false });
    await flush();
    expect(store.open.some((x) => x.id === t.id)).toBe(false);
    expect(store.done[0]?.id).toBe(t.id);
    store.reopen(t.id);
    await flush();
    expect(store.byId(t.id)?.status).toBe('open');
  });

  it('a failing promise action resolves to null and shows the error', async () => {
    vi.spyOn(repo, 'takeTask').mockRejectedValueOnce(new Error('offline'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await store.take(store.open[0]!.id)).toBeNull();
    expect(ui.current?.message).toBe(he.errors.generic);
    err.mockRestore();
  });

  it('remove hides at once, undoRemove restores, and the delete commits after 5 s', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const [a, b] = store.groups.today as Task[];
    store.remove(a!.id, 'המשימה נמחקה');
    expect(store.open.some((t) => t.id === a!.id)).toBe(false);
    expect(store.byId(a!.id)).toBeNull();
    expect(store.pulse.today).toBe(3);
    expect(ui.current).toMatchObject({ message: 'המשימה נמחקה', action: he.common.undo });
    ui.current!.onAction!();
    expect(store.byId(a!.id)?.id).toBe(a!.id);
    expect(store.undoRemove(a!.id)).toBe(false); // already undone

    const del = vi.spyOn(repo, 'deleteTask');
    store.remove(b!.id);
    vi.advanceTimersByTime(DELETE_DELAY_MS - 1);
    expect(del).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(del).toHaveBeenCalledWith(HID, b!.id);
    expect(store.open.some((t) => t.id === b!.id)).toBe(false);
    expect(store.undoRemove(b!.id)).toBe(false);
  });

  it('pending deletes commit when the page is hidden and on detach', () => {
    const del = vi.spyOn(repo, 'deleteTask');
    const [a, b] = store.open;
    store.remove(a!.id);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(del).toHaveBeenCalledWith(HID, a!.id);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    store.remove(b!.id);
    store.detach();
    expect(del).toHaveBeenCalledWith(HID, b!.id);
  });

  it('actions while detached warn and do nothing', async () => {
    store.detach();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(store.create({ title: 'x' })).toBeNull();
    expect(await store.take('x')).toBeNull();
    store.remove('x');
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

describe('TasksStore subscriptions', () => {
  it('attaching the same scope twice subscribes once; detach clears the data', async () => {
    await setup();
    const open = vi.spyOn(repo, 'watchOpenTasks');
    store.attach({ repo, householdId: HID });
    store.attach({ repo, householdId: HID });
    expect(open).toHaveBeenCalledTimes(1);
    await flush();
    store.detach();
    expect(store.open).toEqual([]);
    expect(store.done).toEqual([]);
    expect(store.openLoaded).toBe(false);
    expect(store.recentEvents).toEqual([]);
  });

  it('loadMoreDone re-subscribes with a larger limit, never keeping two done watchers', async () => {
    await setup();
    const original = repo.watchDoneTasks.bind(repo);
    let active = 0;
    const done = vi.spyOn(repo, 'watchDoneTasks').mockImplementation((hid, limit, cb) => {
      active++;
      const unsub = original(hid, limit, (t) => cb(t, true)); // pretend there is always more
      return () => {
        active--;
        unsub();
      };
    });
    store.attach({ repo, householdId: HID });
    await flush();
    expect(store.hasMoreDone).toBe(true);
    store.loadMoreDone();
    expect(done).toHaveBeenLastCalledWith(HID, DONE_PAGE_SIZE * 2, expect.any(Function));
    expect(active).toBe(1);
    expect(store.done).toHaveLength(14); // rows stay while the next page loads
    store.detach();
    expect(active).toBe(0);
    store.loadMoreDone(); // detached: no-op
    expect(done).toHaveBeenCalledTimes(2);
  });

  it('watchTask: loading → task → live updates; dispose and detach stop it', async () => {
    await setup();
    store.attach({ repo, householdId: HID });
    await flush();
    const id = store.open[0]!.id;
    const w = store.watchTask(id);
    expect(w.loading).toBe(true);
    await microtasks();
    expect(w.task?.id).toBe(id);
    store.update(id, { title: 'כותרת חדשה' });
    expect(w.task?.title).toBe('כותרת חדשה');
    w.dispose();
    store.update(id, { title: 'שוב' });
    expect(w.task?.title).toBe('כותרת חדשה');

    const w2 = store.watchTask('missing');
    await microtasks();
    expect(w2.task).toBeNull();
    const w3 = store.watchTask(id);
    store.detach();
    await microtasks();
    expect(w3.task).toBeUndefined(); // disposed before its first emission
    expect(store.watchTask(id).task).toBeNull(); // detached: nothing to watch
  });
});

describe('TasksStore today', () => {
  it('follows clock.today, and the derived views recompute when the date changes', async () => {
    vi.useFakeTimers({
      now: Date.parse('2026-10-04T23:59:00+03:00'),
      toFake: ['setTimeout', 'clearTimeout', 'Date']
    });
    await setup({ now: () => Date.now() });
    clock.start();
    store.attach({ repo, householdId: HID });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.today).toBe('2026-10-04');
    expect(store.groups).toEqual(groupTasks(store.open, '2026-10-04', MEMBERS));
    vi.advanceTimersByTime(60_000);
    expect(store.today).toBe('2026-10-05');
    expect(clock.today).toBe('2026-10-05');
    expect(store.groups).toEqual(groupTasks(store.open, '2026-10-05', MEMBERS));
    expect(store.pulse).toEqual(pulseCounts(store.open, '2026-10-05', MEMBERS));
    expect(store.pulse).not.toEqual(pulseCounts(store.open, '2026-10-04', MEMBERS));
    clock.dispose();
  });
});
