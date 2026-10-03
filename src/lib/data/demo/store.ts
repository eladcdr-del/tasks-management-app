// The demo adapter's in-memory model and its persistence (Blueprint §5 "Demo adapter").
//
// One plain, JSON-safe object (DemoState) holds every "document" the Firebase schema has (§4):
// users with their devices, invites, and per household its members, tasks, events, photos and
// treats. Everything that belongs to a household lives INSIDE its HouseholdRecord, so a query for one
// household can never see another's events.
//
// DemoStore owns that object and three duties around it:
//  - mutate(): run one synchronous change, then notify every watcher synchronously and once more on
//    a microtask (the "settle" pass: if a callback mutates the store re-entrantly, every watcher
//    still ends on the newest state);
//  - watch(): derived, de-duplicated subscriptions. A watcher emits only when its JSON changes, and
//    always receives a fresh deep copy, so consumers can never mutate the store by accident;
//  - persistence: debounced writes to IndexedDB through idb-keyval under a namespaced key.

import { get, set, del } from 'idb-keyval';
import type {
  ActivityEvent,
  AuthUser,
  DeviceToken,
  EarnedTreat,
  Household,
  Invite,
  Member,
  Photo,
  Task,
  Unsubscribe
} from '../../domain/types';

export const DEMO_STATE_VERSION = 1;
/** The idb-keyval key the demo state is stored under (in idb-keyval's default store). */
export const DEFAULT_STORAGE_KEY = 'homecare.demo.v1';
export const DEFAULT_PERSIST_DELAY_MS = 200;

export interface HouseholdRecord {
  household: Household;
  members: Record<string, Member>;
  tasks: Record<string, Task>;
  /** Append-only, oldest first. */
  events: ActivityEvent[];
  photos: Record<string, Photo>;
  /** Keyed by String(round). */
  treats: Record<string, EarnedTreat>;
}

export interface UserRecord {
  profile: AuthUser;
  householdId: string | null;
  devices: Record<string, DeviceToken>;
}

export interface DemoState {
  version: typeof DEMO_STATE_VERSION;
  /** The signed-in user, or null when signed out. */
  authUid: string | null;
  /** Who `signInWithGoogle` signs back in as. */
  lastUid: string | null;
  users: Record<string, UserRecord>;
  households: Record<string, HouseholdRecord>;
  invites: Record<string, Invite>;
}

export function emptyState(): DemoState {
  return {
    version: DEMO_STATE_VERSION,
    authUid: null,
    lastUid: null,
    users: {},
    households: {},
    invites: {}
  };
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A loose structural check of persisted data: the right version and the top-level collections. */
export function isDemoState(v: unknown): v is DemoState {
  return (
    isObject(v) &&
    v.version === DEMO_STATE_VERSION &&
    (v.authUid === null || typeof v.authUid === 'string') &&
    (v.lastUid === null || typeof v.lastUid === 'string') &&
    isObject(v.users) &&
    isObject(v.households) &&
    isObject(v.invites)
  );
}

// ── Persistence ───────────────────────────────────────────────────────────────

export interface Persistence {
  load(): Promise<unknown>;
  save(state: DemoState): Promise<void>;
  clear(): Promise<void>;
}

/**
 * IndexedDB persistence via idb-keyval (default store, namespaced key). Null when IndexedDB is not
 * available (SSR, very old browsers), in which case the demo simply runs in memory.
 */
export function idbPersistence(key: string = DEFAULT_STORAGE_KEY): Persistence | null {
  if (typeof indexedDB === 'undefined') return null;
  return {
    load: () => get<unknown>(key),
    save: (state) => set(key, state),
    clear: () => del(key)
  };
}

/** In-memory persistence (tests, or a browser without IndexedDB). Saves a deep copy. */
export function memoryPersistence(): Persistence & { readonly saved: DemoState | undefined } {
  let saved: DemoState | undefined;
  return {
    get saved() {
      return saved;
    },
    load: async () => (saved === undefined ? undefined : structuredClone(saved)),
    save: async (state) => {
      saved = structuredClone(state);
    },
    clear: async () => {
      saved = undefined;
    }
  };
}

// ── The store ─────────────────────────────────────────────────────────────────

interface Watcher {
  compute: () => unknown;
  emit: (value: unknown) => void;
  /** JSON of the last emitted value; undefined = nothing emitted (or access was lost since). */
  last: string | undefined;
  active: boolean;
}

export class DemoStore {
  private readonly watchers = new Set<Watcher>();
  private settleQueued = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private saving: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(
    public state: DemoState,
    private readonly persistence: Persistence | null,
    private readonly persistDelayMs: number = DEFAULT_PERSIST_DELAY_MS
  ) {}

  /**
   * Runs `fn` against the state. When it returns, watchers are notified (synchronously, then once
   * more on a microtask) and a debounced save is scheduled. When it throws, nothing is notified or
   * saved: callers validate everything before their first assignment, so a throw leaves the state
   * untouched.
   */
  mutate<R>(fn: (state: DemoState) => R): R {
    const result = fn(this.state);
    this.changed();
    return result;
  }

  /** Swaps the whole state (reset / reseed). */
  replace(state: DemoState): void {
    this.state = state;
    this.changed();
  }

  /** Marks the state as needing a save (e.g. a fresh seed that was never persisted). */
  markDirty(): void {
    this.schedulePersist();
  }

  /**
   * Subscribes a derived value. `compute` returns `undefined` for "nothing visible" (no emission).
   * The first emission happens on a microtask (like a snapshot listener, and safe for callers that
   * use the returned Unsubscribe inside the callback); later ones synchronously after each mutation.
   */
  watch<T>(compute: () => T | undefined, emit: (value: T) => void): Unsubscribe {
    const watcher: Watcher = {
      compute,
      emit: emit as (value: unknown) => void,
      last: undefined,
      active: true
    };
    this.watchers.add(watcher);
    queueMicrotask(() => this.run(watcher));
    return () => {
      watcher.active = false;
      this.watchers.delete(watcher);
    };
  }

  /** Re-evaluates every watcher now (and again on a microtask). */
  notify(): void {
    for (const w of [...this.watchers]) this.run(w);
    if (!this.settleQueued) {
      this.settleQueued = true;
      queueMicrotask(() => {
        this.settleQueued = false;
        for (const w of [...this.watchers]) this.run(w);
      });
    }
  }

  /** Writes any pending change now and resolves when every save so far has finished. */
  flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.dirty && this.persistence) {
      this.dirty = false;
      const persistence = this.persistence;
      const state = this.state;
      this.saving = this.saving.then(() =>
        persistence.save(state).catch((e: unknown) => {
          console.warn('[demo] could not persist the demo state', e);
        })
      );
    }
    return this.saving;
  }

  /** Flushes, then stops all timers and watchers. */
  async dispose(): Promise<void> {
    this.disposed = true;
    for (const w of this.watchers) w.active = false;
    this.watchers.clear();
    await this.flush();
  }

  private changed(): void {
    this.schedulePersist();
    this.notify();
  }

  private schedulePersist(): void {
    if (!this.persistence || this.disposed) return;
    this.dirty = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.persistDelayMs);
  }

  private run(w: Watcher): void {
    if (!w.active) return;
    let value: unknown;
    try {
      value = w.compute();
    } catch (e) {
      console.error('[demo] a watcher failed to compute its value', e);
      return;
    }
    if (value === undefined) {
      w.last = undefined; // regaining access later emits again
      return;
    }
    const json = JSON.stringify(value);
    if (json === w.last) return;
    w.last = json;
    try {
      w.emit(JSON.parse(json));
    } catch (e) {
      console.error('[demo] a watcher callback threw', e);
    }
  }
}
