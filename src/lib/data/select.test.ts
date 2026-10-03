// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configLooksComplete,
  createRepository,
  EMULATOR_CONFIG,
  EMULATOR_HOSTS,
  enterDemo,
  exitDemo,
  hasTestSignIn,
  isDemoRepository,
  MODE_STORAGE_KEY,
  resolveMode,
  type FirebaseModule,
  type StorageLike
} from './select';
import type { Repository } from './repository';
import type { DemoRepository } from './demo/demoRepository';

const NOW = Date.parse('2026-10-04T09:00:00+03:00');
const COMPLETE = {
  apiKey: 'AIzaSyX',
  authDomain: 'homecare-1.firebaseapp.com',
  projectId: 'homecare-1',
  storageBucket: '',
  messagingSenderId: '123',
  appId: '1:123:web:abc'
};
const EMPTY = {
  ...COMPLETE,
  apiKey: '',
  authDomain: '',
  projectId: '',
  messagingSenderId: '',
  appId: ''
};

function memStorage(
  initial: Record<string, string> = {}
): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k)
  };
}

const at = (search: string) => ({ search });

describe('configLooksComplete', () => {
  it('needs the five required fields as non-empty strings (storageBucket optional)', () => {
    expect(configLooksComplete(COMPLETE)).toBe(true);
    expect(configLooksComplete({ ...COMPLETE, storageBucket: undefined })).toBe(true);
    expect(configLooksComplete(EMPTY)).toBe(false);
    expect(configLooksComplete({ ...COMPLETE, appId: '  ' })).toBe(false);
    expect(configLooksComplete({ ...COMPLETE, projectId: 42 })).toBe(false);
    expect(configLooksComplete(null)).toBe(false);
    expect(configLooksComplete('x')).toBe(false);
  });
});

describe('resolveMode (Blueprint §5 order)', () => {
  it('no config and nothing stored → setup', () => {
    expect(resolveMode(at(''), memStorage(), EMPTY)).toEqual({ mode: 'setup', reset: false });
  });

  it('?demo=1 → demo, persisted; &reset=1 and &as= are read', () => {
    const s = memStorage();
    expect(resolveMode(at('?demo=1'), s, EMPTY)).toEqual({ mode: 'demo', reset: false });
    expect(s.data.get(MODE_STORAGE_KEY)).toBe('demo');
    expect(resolveMode(at('?demo=1&reset=1&as=dani'), s, COMPLETE)).toEqual({
      mode: 'demo',
      reset: true,
      actAs: 'dani'
    });
  });

  it('a stored demo survives without params (and still honours reset / as)', () => {
    const s = memStorage({ [MODE_STORAGE_KEY]: 'demo' });
    expect(resolveMode(at(''), s, COMPLETE)).toEqual({ mode: 'demo', reset: false });
    expect(resolveMode(at('?reset=1&as=dani'), s, COMPLETE)).toEqual({
      mode: 'demo',
      reset: true,
      actAs: 'dani'
    });
  });

  it('?emulator=1 only where allowed (dev / E2E builds), and never persisted', () => {
    const s = memStorage();
    expect(resolveMode(at('?emulator=1'), s, EMPTY, { allowEmulator: true })).toEqual({
      mode: 'emulator',
      reset: false
    });
    expect(resolveMode(at('?emulator=1'), s, EMPTY, { allowEmulator: false }).mode).toBe('setup');
    expect(resolveMode(at('?emulator=1'), s, COMPLETE, { allowEmulator: false }).mode).toBe(
      'firebase'
    );
    expect(s.data.size).toBe(0);
  });

  it('?demo=1 beats ?emulator=1; ?emulator=1 beats a stored demo', () => {
    expect(
      resolveMode(at('?demo=1&emulator=1'), memStorage(), EMPTY, { allowEmulator: true }).mode
    ).toBe('demo');
    const stored = memStorage({ [MODE_STORAGE_KEY]: 'demo' });
    expect(resolveMode(at('?emulator=1'), stored, EMPTY, { allowEmulator: true }).mode).toBe(
      'emulator'
    );
  });

  it('complete config → firebase', () => {
    expect(resolveMode(at(''), memStorage(), COMPLETE)).toEqual({ mode: 'firebase', reset: false });
  });

  it('?exit-demo=1 clears the stored mode and wins over ?demo=1', () => {
    const s = memStorage({ [MODE_STORAGE_KEY]: 'demo' });
    expect(resolveMode(at('?exit-demo=1&demo=1'), s, EMPTY).mode).toBe('setup');
    expect(s.data.has(MODE_STORAGE_KEY)).toBe(false);
    expect(
      resolveMode(at('?exit-demo=1'), memStorage({ [MODE_STORAGE_KEY]: 'demo' }), COMPLETE).mode
    ).toBe('firebase');
  });

  it('blocked storage (throws, or null) degrades to "nothing stored"', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      }
    };
    expect(resolveMode(at('?demo=1'), throwing, EMPTY).mode).toBe('demo');
    expect(resolveMode(at(''), throwing, EMPTY).mode).toBe('setup');
    expect(resolveMode(at(''), null, COMPLETE).mode).toBe('firebase');
  });
});

describe('createRepository', () => {
  const live: Repository[] = [];
  afterEach(async () => {
    for (const r of live.splice(0)) if (isDemoRepository(r)) await r.dispose();
    window.history.replaceState(null, '', '/');
  });

  it('demo: seeded, acting as `actAs`, and strips reset/as from the URL (keeps demo and the hash)', async () => {
    window.history.replaceState({ idx: 0 }, '', '/app/?demo=1&reset=1&as=dani#/memory');
    const repo = await createRepository(
      { mode: 'demo', reset: true, actAs: 'dani' },
      { demoOptions: { persistence: 'none', now: () => NOW } }
    );
    live.push(repo);
    expect(repo.kind).toBe('demo');
    expect(isDemoRepository(repo) && repo.currentUid()).toBe('dani');
    expect(await repo.getMyHouseholdId()).toBe('demo-home');
    expect(`${location.pathname}${location.search}${location.hash}`).toBe('/app/?demo=1#/memory');
    expect(window.history.state).toEqual({ idx: 0 });
  });

  it('demo: `reset` ignores persisted state; without it the saved demo comes back', async () => {
    const storageKey = `homecare.demo.select.${Math.random()}`;
    const opts = { demoOptions: { now: () => NOW, storageKey, persistDelayMs: 0 } };
    const first = (await createRepository({ mode: 'demo', reset: true }, opts)) as DemoRepository;
    first.actAs('dani');
    await first.flush();
    await first.dispose();
    const again = (await createRepository({ mode: 'demo', reset: false }, opts)) as DemoRepository;
    live.push(again);
    expect(again.currentUid()).toBe('dani');
    const fresh = (await createRepository({ mode: 'demo', reset: true }, opts)) as DemoRepository;
    live.push(fresh);
    expect(fresh.currentUid()).toBe('michal');
  });

  it('firebase: lazy-loads the adapter with the config; emulator: demo project + local hosts', async () => {
    const fakeRepo = {
      kind: 'firebase',
      signInWithTestCredential: vi.fn()
    } as unknown as Repository;
    const createFirebaseRepository = vi.fn(async () => fakeRepo);
    const loadFirebase = vi.fn(
      async () => ({ createFirebaseRepository }) as unknown as FirebaseModule
    );

    expect(
      await createRepository({ mode: 'firebase', reset: false }, { config: COMPLETE, loadFirebase })
    ).toBe(fakeRepo);
    expect(createFirebaseRepository).toHaveBeenLastCalledWith(COMPLETE);

    await createRepository({ mode: 'emulator', reset: false }, { loadFirebase });
    expect(createFirebaseRepository).toHaveBeenLastCalledWith(EMULATOR_CONFIG, {
      emulator: { host: '127.0.0.1', firestorePort: 8080, authPort: 9099 }
    });
    expect(EMULATOR_HOSTS).toEqual({ host: '127.0.0.1', firestorePort: 8080, authPort: 9099 });
    expect(EMULATOR_CONFIG.projectId).toBe('demo-homecare');
    expect(loadFirebase).toHaveBeenCalledTimes(2);
    expect(hasTestSignIn(fakeRepo)).toBe(true);
  });

  it('refuses setup mode and an incomplete firebase config', async () => {
    await expect(createRepository({ mode: 'setup', reset: false })).rejects.toThrow(/setup/);
    const loadFirebase = vi.fn();
    await expect(
      createRepository({ mode: 'firebase', reset: false }, { config: EMPTY, loadFirebase })
    ).rejects.toThrow(/incomplete/);
    expect(loadFirebase).not.toHaveBeenCalled();
  });
});

describe('exitDemo / enterDemo', () => {
  function fakeWindow(href: string, stored: Record<string, string> = {}) {
    const storage = memStorage(stored);
    const calls: string[] = [];
    const win = {
      localStorage: storage,
      location: { href, reload: () => calls.push('reload') },
      history: {
        replaceState: (_s: unknown, _t: string, url: string) => calls.push(`replace ${url}`)
      }
    } as unknown as Window;
    return { win, storage, calls };
  }

  it('exitDemo forgets the mode and reloads at #/ without demo params', () => {
    const { win, storage, calls } = fakeWindow(
      'https://x.test/tasks-management-app/?demo=1&reset=1&as=dani&keep=1#/settings',
      { [MODE_STORAGE_KEY]: 'demo' }
    );
    exitDemo(win);
    expect(storage.data.has(MODE_STORAGE_KEY)).toBe(false);
    expect(calls).toEqual(['replace /tasks-management-app/?keep=1#/', 'reload']);
  });

  it('enterDemo reloads at ?demo=1#/', () => {
    const { win, calls } = fakeWindow('https://x.test/tasks-management-app/#/setup');
    enterDemo(win);
    expect(calls).toEqual(['replace /tasks-management-app/?demo=1#/', 'reload']);
  });
});
