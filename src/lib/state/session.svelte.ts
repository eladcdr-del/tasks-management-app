// Session state and the boot sequence (step 2.4).
//
//   boot():  resolveMode → createRepository → bind repo-wide stores (sync, ui) → onAuthChange →
//            getMyHouseholdId → phase. `booting` ends when the FIRST auth state has been fully
//            applied (user and household id land together), so the first screen is the right one.
//
//   phase:   'booting'      splash (until the first auth state; also on a boot error, see `error`)
//            'setup'        firebase-config.ts is empty and the demo is off → #/setup
//            'signed-out'   → #/welcome
//            'no-household' → #/onboarding/household (or #/join/:code for a pending invite)
//            'ready'        the app. Household-scoped stores (household, tasks) are attached here,
//                           exactly once, and detached when the phase leaves 'ready'.
//
// Actions (signIn, signOut, createHousehold, joinHousehold, leaveHousehold) REJECT with the
// RepoError so onboarding / settings can show inline Hebrew errors. Store actions elsewhere
// (household, tasks) never reject; they use the snackbar.

import { RepoError, type NewMemberProfile, type Repository } from '$lib/data/repository';
import type { AuthUser, Unsubscribe } from '$lib/domain/types';
import {
  createRepository,
  resolveMode,
  safeLocalStorage,
  type AppMode,
  type ModeResolution
} from '$lib/data/select';
import { stripQueryParam } from '$lib/router/router.svelte';
import type { RouteMatch, RouteName } from '$lib/router/routes';
import { firebaseConfig } from '../../../firebase-config';
import { household as defaultHousehold } from './household.svelte';
import { tasks as defaultTasks } from './tasks.svelte';
import { sync as defaultSync } from './sync.svelte';
import { ui as defaultUi } from './ui.svelte';

export type Phase = 'booting' | 'setup' | 'signed-out' | 'no-household' | 'ready';

/** What household-scoped stores subscribe with. */
export interface HouseholdScope {
  repo: Repository;
  householdId: string;
}

/** A store fed by household-scoped subscriptions (attached only while the phase is 'ready'). */
export interface ScopedStore {
  attach(scope: HouseholdScope): void;
  detach(): void;
  setUser(uid: string | null): void;
}

/** A store fed by repository-wide subscriptions (bound once the repository exists). */
export interface RepoStore {
  bindRepo(repo: Repository): void;
  unbindRepo(): void;
}

export interface SessionStoreOptions {
  scoped?: ScopedStore[];
  repoStores?: RepoStore[];
  /** Errors outside the boot (e.g. a later household lookup). Default: ui.pushError. */
  onError?: (e: unknown) => void;
}

export interface BootOptions {
  /** Default: resolveMode(location, localStorage, firebase-config.ts). */
  resolution?: ModeResolution;
  /** Default: createRepository (select.ts). */
  createRepo?: (resolution: ModeResolution) => Promise<Repository>;
}

/** Waits for `signIn`'s auth emission when an adapter reports it after the sign-in resolves. */
const SIGN_IN_SETTLE_MS = 10_000;

const toRepoError = (e: unknown): RepoError =>
  e instanceof RepoError ? e : new RepoError('unknown', e instanceof Error ? e.message : String(e));

export class SessionStore {
  /** null until resolved (first synchronous step of boot). */
  mode = $state<AppMode | null>(null);
  repo = $state.raw<Repository | null>(null);
  user = $state.raw<AuthUser | null>(null);
  householdId = $state<string | null>(null);
  booting = $state(true);
  /** A boot failure (the splash then offers a retry). */
  error = $state.raw<unknown>(null);
  /** Profile collected by the onboarding profile step for createHousehold / joinHousehold (3.1). */
  profileDraft = $state.raw<NewMemberProfile | null>(null);

  readonly phase: Phase = $derived(
    this.booting
      ? 'booting'
      : this.mode === 'setup'
        ? 'setup'
        : this.user === null
          ? 'signed-out'
          : this.householdId === null
            ? 'no-household'
            : 'ready'
  );

  #scoped: ScopedStore[];
  #repoStores: RepoStore[];
  #onError: (e: unknown) => void;
  #attached: HouseholdScope | null = null;
  #unsubAuth: Unsubscribe | null = null;
  /** Auth emissions are applied one at a time, in order. */
  #authChain: Promise<void> = Promise.resolve();
  #authSeq = 0;
  #settleWaiters: (() => void)[] = [];
  #boot: Promise<void> | null = null;
  #resolveBooted: () => void = () => {};
  #booted = new Promise<void>((resolve) => (this.#resolveBooted = resolve));

  constructor(opts: SessionStoreOptions = {}) {
    this.#scoped = opts.scoped ?? [defaultHousehold, defaultTasks];
    this.#repoStores = opts.repoStores ?? [defaultSync, defaultUi];
    this.#onError = opts.onError ?? ((e) => defaultUi.pushError(e));
  }

  /** Starts the boot once (later calls return the same promise). Never rejects: see `error`. */
  boot(opts: BootOptions = {}): Promise<void> {
    this.#boot ??= this.#runBoot(opts);
    return this.#boot;
  }

  /** Resolves once boot has finished (successfully or not). Does not start it. */
  whenBooted(): Promise<void> {
    return this.#booted;
  }

  /** Resolves when every auth emission received so far has been applied. */
  async settled(): Promise<void> {
    let chain: Promise<void>;
    do {
      chain = this.#authChain;
      await chain;
    } while (chain !== this.#authChain);
  }

  // ── actions ───────────────────────────────────────────────────────────────

  /** Google sign-in. Resolves once the new phase is known; rejects with RepoError (popup-blocked…). */
  async signIn(): Promise<void> {
    const repo = this.#requireRepo();
    if (this.user) return;
    try {
      await repo.signInWithGoogle();
    } catch (e) {
      throw toRepoError(e);
    }
    await this.settled();
    if (!this.user) await this.#nextSettle(SIGN_IN_SETTLE_MS);
  }

  async signOut(): Promise<void> {
    const repo = this.#requireRepo();
    // Tear down first: listeners must not outlive the credentials they were opened with.
    this.#detach();
    this.user = null;
    this.householdId = null;
    try {
      await repo.signOut();
    } catch (e) {
      this.#resubscribeAuth(); // re-read the real auth state
      throw toRepoError(e);
    }
  }

  /** Creates my household (I become its owner); the phase becomes 'ready'. Returns its id. */
  async createHousehold(name: string, profile: NewMemberProfile): Promise<string> {
    const repo = this.#requireRepo();
    let hid: string;
    try {
      hid = await repo.createHousehold(name, profile);
    } catch (e) {
      throw toRepoError(e);
    }
    this.#setHousehold(hid);
    return hid;
  }

  /** Joins through an invite; the phase becomes 'ready'. Rejects with not-found / expired / … */
  async joinHousehold(code: string, profile: NewMemberProfile): Promise<string> {
    const repo = this.#requireRepo();
    let hid: string;
    try {
      hid = await repo.joinHousehold(code, profile);
    } catch (e) {
      throw toRepoError(e);
    }
    takePendingInvite();
    this.#setHousehold(hid);
    return hid;
  }

  /** Leaves the household; the phase becomes 'no-household'. */
  async leaveHousehold(): Promise<void> {
    const repo = this.#requireRepo();
    const hid = this.householdId;
    if (hid === null) return;
    this.#detach();
    this.householdId = null;
    try {
      await repo.leaveHousehold(hid);
    } catch (e) {
      this.#setHousehold(hid);
      throw toRepoError(e);
    }
  }

  // ── boot ──────────────────────────────────────────────────────────────────

  async #runBoot(opts: BootOptions): Promise<void> {
    try {
      const resolution =
        opts.resolution ?? resolveMode(window.location, safeLocalStorage(), firebaseConfig);
      this.mode = resolution.mode;
      if (typeof window !== 'undefined') stripQueryParam('exit-demo', window);
      if (resolution.mode === 'setup') {
        this.booting = false;
        return;
      }
      const repo = await (opts.createRepo ?? createRepository)(resolution);
      this.repo = repo;
      for (const store of this.#repoStores) store.bindRepo(repo);
      const first = this.#nextSettle();
      this.#subscribeAuth(repo);
      await first;
    } catch (e) {
      console.error('[homecare] boot failed', e);
      this.error = e;
    } finally {
      this.#resolveBooted();
    }
  }

  #subscribeAuth(repo: Repository): void {
    this.#unsubAuth?.();
    this.#unsubAuth = repo.onAuthChange((u) => {
      const seq = ++this.#authSeq;
      this.#authChain = this.#authChain.then(() => this.#applyAuth(u, seq));
    });
  }

  #resubscribeAuth(): void {
    if (this.repo) this.#subscribeAuth(this.repo);
  }

  async #applyAuth(u: AuthUser | null, seq: number): Promise<void> {
    const repo = this.repo;
    // A newer emission supersedes this one; it is already queued and will settle the waiters.
    const superseded = () => seq !== this.#authSeq;
    try {
      if (!repo || superseded()) return;
      let hid: string | null = null;
      if (u) {
        try {
          hid = await repo.getMyHouseholdId();
        } catch (e) {
          if (this.booting) {
            this.error = e;
            return;
          }
          this.#onError(e);
          u = null;
        }
        if (superseded()) return;
      }
      // One synchronous step: no intermediate phase (e.g. 'no-household' before the id arrives).
      this.user = u;
      this.householdId = hid;
      this.error = null;
      this.booting = false;
      if (hid !== null) takePendingInvite();
      this.#syncScope();
    } finally {
      if (!superseded()) {
        const waiters = this.#settleWaiters;
        this.#settleWaiters = [];
        for (const w of waiters) w();
      }
    }
  }

  /** Resolves after the next auth emission has been applied (or after `timeoutMs`). */
  #nextSettle(timeoutMs?: number): Promise<void> {
    return new Promise((resolve) => {
      this.#settleWaiters.push(resolve);
      if (timeoutMs !== undefined) setTimeout(resolve, timeoutMs);
    });
  }

  #setHousehold(hid: string): void {
    this.householdId = hid;
    this.#syncScope();
  }

  /** Attaches the household-scoped stores iff ready; never twice for the same (repo, household). */
  #syncScope(): void {
    const repo = this.repo;
    const uid = this.user?.uid ?? null;
    const hid = this.householdId;
    const want = repo && uid !== null && hid !== null ? { repo, householdId: hid } : null;
    const cur = this.#attached;
    const same = cur && want && cur.repo === want.repo && cur.householdId === want.householdId;
    if (!same) {
      this.#detach();
      if (want) {
        for (const store of this.#scoped) store.attach(want);
        this.#attached = want;
      }
    }
    for (const store of this.#scoped) store.setUser(uid);
  }

  #detach(): void {
    if (!this.#attached) return;
    for (const store of this.#scoped) store.detach();
    this.#attached = null;
  }

  #requireRepo(): Repository {
    if (!this.repo) throw new RepoError('unknown', 'no repository (setup mode or still booting)');
    return this.repo;
  }
}

// ── Pending invite (a signed-out visitor opened #/join/:code) ────────────────────────────────────

export const PENDING_INVITE_KEY = 'homecare.pendingInvite';

function sessionStore(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** Keeps the invite code across the sign-in round trip. */
export function rememberPendingInvite(code: string): void {
  try {
    sessionStore()?.setItem(PENDING_INVITE_KEY, code);
  } catch {
    // Storage blocked: the visitor can open the link again after signing in.
  }
}

export function peekPendingInvite(): string | null {
  try {
    return sessionStore()?.getItem(PENDING_INVITE_KEY) || null;
  } catch {
    return null;
  }
}

/** Returns and forgets the pending invite code. */
export function takePendingInvite(): string | null {
  const code = peekPendingInvite();
  if (code !== null) {
    try {
      sessionStore()?.removeItem(PENDING_INVITE_KEY);
    } catch {
      // ignore
    }
  }
  return code;
}

// ── Route gating (pure; App.svelte applies it) ───────────────────────────────────────────────────

const PHASE_ROUTES: Readonly<Record<Exclude<Phase, 'booting' | 'ready'>, readonly RouteName[]>> = {
  setup: ['setup'],
  'signed-out': ['welcome'],
  'no-household': ['onboardingHousehold', 'onboardingProfile', 'join']
};

/** Routes that make no sense once the user has a household. */
const NOT_WHEN_READY: readonly RouteName[] = ['setup', 'welcome', 'onboardingHousehold', 'join'];

/** Whether `route` may render in `phase`. Nothing renders while booting; the dev gallery always may. */
export function routeAllowed(phase: Phase, route: RouteName): boolean {
  if (phase === 'booting') return false;
  if (route === 'devGallery') return true;
  if (phase === 'ready') return !NOT_WHEN_READY.includes(route);
  return PHASE_ROUTES[phase].includes(route);
}

/**
 * Where a disallowed route goes (a hash for `router.navigate(…, { replace: true })`), or null when
 * the route may stay. `pendingInvite` is the code kept in sessionStorage (no-household only).
 */
export function gateTarget(
  phase: Phase,
  route: Pick<RouteMatch, 'name'>,
  pendingInvite: string | null = null
): string | null {
  if (phase === 'booting' || routeAllowed(phase, route.name)) return null;
  switch (phase) {
    case 'setup':
      return '#/setup';
    case 'signed-out':
      return '#/welcome';
    case 'no-household':
      return pendingInvite
        ? `#/join/${encodeURIComponent(pendingInvite)}`
        : '#/onboarding/household';
    case 'ready':
      return '#/';
  }
}

export const session = new SessionStore();
