import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DemoStore,
  emptyState,
  idbPersistence,
  isDemoState,
  memoryPersistence,
  type DemoState,
  type Persistence
} from './store';

const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function countingPersistence(): Persistence & { saves: DemoState[] } {
  const saves: DemoState[] = [];
  return {
    saves,
    load: async () => undefined,
    save: async (s) => {
      saves.push(structuredClone(s));
    },
    clear: async () => {}
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('DemoStore.watch', () => {
  it('emits the first value on a microtask, then synchronously after each mutation', async () => {
    const store = new DemoStore(emptyState(), null);
    const seen: (string | null)[] = [];
    store.watch(
      () => store.state.authUid,
      (v) => seen.push(v)
    );
    expect(seen).toEqual([]); // not synchronous on subscribe
    await tick();
    expect(seen).toEqual([null]);
    store.mutate((s) => {
      s.authUid = 'michal';
    });
    expect(seen).toEqual([null, 'michal']); // synchronous after the mutation
  });

  it('emits only when the derived value changes', async () => {
    const store = new DemoStore(emptyState(), null);
    const seen: unknown[] = [];
    store.watch(
      () => ({ uid: store.state.authUid }),
      (v) => seen.push(v)
    );
    await tick();
    store.mutate((s) => {
      s.lastUid = 'x'; // does not affect the watched value
    });
    store.notify();
    await tick();
    expect(seen).toEqual([{ uid: null }]);
  });

  it('hands out deep copies, so consumers cannot mutate the store', async () => {
    const store = new DemoStore(emptyState(), null);
    store.mutate((s) => {
      s.invites.abc = {
        code: 'abc',
        householdId: 'h',
        householdName: 'בית',
        inviterName: 'מיכל',
        createdBy: 'm',
        createdAt: 1,
        expiresAt: 2,
        revoked: false
      };
    });
    let got: { revoked: boolean } | undefined;
    store.watch(
      () => store.state.invites.abc,
      (v) => (got = v)
    );
    await tick();
    got!.revoked = true;
    expect(store.state.invites.abc!.revoked).toBe(false);
  });

  it('emits nothing while the value is undefined, and again once it is visible', async () => {
    const store = new DemoStore(emptyState(), null);
    const seen: unknown[] = [];
    store.watch(
      () => store.state.users.u?.householdId ?? undefined,
      (v) => seen.push(v)
    );
    await tick();
    expect(seen).toEqual([]);
    store.mutate((s) => {
      s.users.u = {
        profile: { uid: 'u', displayName: 'u', email: '', photoURL: null },
        householdId: 'h1',
        devices: {}
      };
    });
    store.mutate((s) => {
      delete s.users.u;
    });
    store.mutate((s) => {
      s.users.u = {
        profile: { uid: 'u', displayName: 'u', email: '', photoURL: null },
        householdId: 'h1',
        devices: {}
      };
    });
    expect(seen).toEqual(['h1', 'h1']); // re-emitted after access was lost and regained
  });

  it('stops after unsubscribe', async () => {
    const store = new DemoStore(emptyState(), null);
    const seen: unknown[] = [];
    const stop = store.watch(
      () => store.state.authUid,
      (v) => seen.push(v)
    );
    stop();
    await tick();
    store.mutate((s) => {
      s.authUid = 'a';
    });
    await tick();
    expect(seen).toEqual([]);
  });

  it('settles every watcher on the newest state when a callback mutates re-entrantly', async () => {
    const store = new DemoStore(emptyState(), null);
    const a: unknown[] = [];
    const b: unknown[] = [];
    store.watch(
      () => store.state.authUid,
      (v) => {
        a.push(v);
        if (v === 'first') store.mutate((s) => void (s.authUid = 'second'));
      }
    );
    store.watch(
      () => store.state.authUid,
      (v) => b.push(v)
    );
    await tick();
    store.mutate((s) => void (s.authUid = 'first'));
    await tick();
    expect(a.at(-1)).toBe('second');
    expect(b.at(-1)).toBe('second');
    expect(b).not.toContain('first'); // never handed a stale value after the newer one
  });

  it('isolates a throwing callback from the others', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = new DemoStore(emptyState(), null);
    const seen: unknown[] = [];
    store.watch(
      () => store.state.authUid,
      () => {
        throw new Error('boom');
      }
    );
    store.watch(
      () => store.state.authUid,
      (v) => seen.push(v)
    );
    await tick();
    expect(seen).toEqual([null]);
    expect(error).toHaveBeenCalled();
  });

  it('does not notify or persist when the mutation throws', async () => {
    const p = countingPersistence();
    const store = new DemoStore(emptyState(), p, 1);
    const seen: unknown[] = [];
    store.watch(
      () => store.state.authUid,
      (v) => seen.push(v)
    );
    await tick();
    expect(() =>
      store.mutate(() => {
        throw new Error('invalid');
      })
    ).toThrow('invalid');
    await sleep(10);
    expect(seen).toEqual([null]);
    expect(p.saves).toEqual([]);
  });
});

describe('DemoStore persistence', () => {
  it('debounces a burst of writes into one save', async () => {
    const p = countingPersistence();
    const store = new DemoStore(emptyState(), p, 15);
    for (const uid of ['a', 'b', 'c', 'd']) store.mutate((s) => void (s.authUid = uid));
    expect(p.saves).toHaveLength(0);
    await sleep(40);
    expect(p.saves).toHaveLength(1);
    expect(p.saves[0]!.authUid).toBe('d');
  });

  it('flush writes immediately; dispose flushes and stops watchers', async () => {
    const p = countingPersistence();
    const store = new DemoStore(emptyState(), p, 10_000);
    const seen: unknown[] = [];
    store.watch(
      () => store.state.authUid,
      (v) => seen.push(v)
    );
    store.mutate((s) => void (s.authUid = 'a'));
    await store.flush();
    expect(p.saves.map((s) => s.authUid)).toEqual(['a']);
    await store.flush(); // nothing new: no second save
    expect(p.saves).toHaveLength(1);
    store.mutate((s) => void (s.authUid = 'b'));
    await store.dispose();
    expect(p.saves.map((s) => s.authUid)).toEqual(['a', 'b']);
    const before = seen.length;
    store.mutate((s) => void (s.authUid = 'c'));
    expect(seen).toHaveLength(before);
  });

  it('survives a failing save', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = new DemoStore(emptyState(), {
      load: async () => undefined,
      save: async () => {
        throw new Error('quota');
      },
      clear: async () => {}
    });
    store.markDirty();
    await expect(store.flush()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('replace swaps the state and notifies', async () => {
    const store = new DemoStore(emptyState(), null);
    const seen: unknown[] = [];
    store.watch(
      () => store.state.authUid,
      (v) => seen.push(v)
    );
    await tick();
    store.replace({ ...emptyState(), authUid: 'dani' });
    expect(seen).toEqual([null, 'dani']);
  });

  it('memoryPersistence round-trips deep copies', async () => {
    const p = memoryPersistence();
    const s = emptyState();
    await p.save(s);
    s.authUid = 'changed';
    expect(((await p.load()) as DemoState).authUid).toBeNull();
    await p.clear();
    expect(await p.load()).toBeUndefined();
  });

  it('idbPersistence stores under its key in IndexedDB', async () => {
    const p = idbPersistence('homecare.demo.store-test')!;
    expect(p).not.toBeNull();
    await p.save({ ...emptyState(), authUid: 'michal' });
    expect(((await p.load()) as DemoState).authUid).toBe('michal');
    expect(await idbPersistence('homecare.demo.other-key')!.load()).toBeUndefined();
    await p.clear();
    expect(await p.load()).toBeUndefined();
  });

  it('idbPersistence is null without IndexedDB', () => {
    vi.stubGlobal('indexedDB', undefined);
    expect(idbPersistence()).toBeNull();
  });
});

describe('isDemoState', () => {
  it('accepts a state and rejects other shapes or versions', () => {
    expect(isDemoState(emptyState())).toBe(true);
    expect(isDemoState(null)).toBe(false);
    expect(isDemoState([])).toBe(false);
    expect(isDemoState({ ...emptyState(), version: 0 })).toBe(false);
    expect(isDemoState({ ...emptyState(), users: [] })).toBe(false);
    expect(isDemoState({ ...emptyState(), authUid: 7 })).toBe(false);
  });
});
