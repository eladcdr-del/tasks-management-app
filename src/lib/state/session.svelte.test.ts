// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepoError, type NewMemberProfile, type Repository } from '$lib/data/repository';
import { createDemoRepository, type DemoRepository } from '$lib/data/demo/demoRepository';
import { DANI, DEMO_HOUSEHOLD_ID as HID, MICHAL } from '$lib/data/demo/seed';
import type { ModeResolution } from '$lib/data/select';
import type { RouteName } from '$lib/router/routes';
import { HouseholdStore } from './household.svelte';
import { TasksStore } from './tasks.svelte';
import { SyncStore } from './sync.svelte';
import { UiStore } from './ui.svelte';
import { ClockStore } from './clock.svelte';
import {
  gateTarget,
  peekPendingInvite,
  rememberPendingInvite,
  routeAllowed,
  SessionStore,
  takePendingInvite,
  type Phase
} from './session.svelte';

const NOW = Date.parse('2026-10-04T09:00:00+03:00');
const DEMO: ModeResolution = { mode: 'demo', reset: true };
const PROFILE: NewMemberProfile = {
  displayName: 'נועה',
  photoURL: null,
  color: 'sage',
  addressAs: 'f'
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Wraps a repository so the test sees how many of each subscription are open (and ever opened). */
function counted(repo: DemoRepository) {
  const active = new Map<string, number>();
  const opened = new Map<string, number>();
  const methods = [
    'onAuthChange',
    'watchHousehold',
    'watchMembers',
    'watchTreats',
    'watchOpenTasks',
    'watchDoneTasks',
    'watchRecentEvents',
    'watchTask',
    'watchSync',
    'onWriteError'
  ] as const;
  for (const name of methods) {
    const original = (repo[name] as (...args: unknown[]) => () => void).bind(repo);
    vi.spyOn(repo as Repository, name).mockImplementation(((...args: unknown[]) => {
      active.set(name, (active.get(name) ?? 0) + 1);
      opened.set(name, (opened.get(name) ?? 0) + 1);
      const unsub = original(...args);
      let done = false;
      return () => {
        if (!done) active.set(name, (active.get(name) ?? 0) - 1);
        done = true;
        unsub();
      };
    }) as never);
  }
  const snapshot = (map: Map<string, number>) =>
    Object.fromEntries(methods.map((m) => [m, map.get(m) ?? 0]));
  return { repo, active: () => snapshot(active), opened: () => snapshot(opened) };
}

const ALL_ONE = {
  onAuthChange: 1,
  watchHousehold: 1,
  watchMembers: 1,
  watchTreats: 1,
  watchOpenTasks: 1,
  watchDoneTasks: 1,
  watchRecentEvents: 1,
  watchTask: 0,
  watchSync: 1,
  onWriteError: 1
};
const REPO_WIDE_ONLY = {
  ...ALL_ONE,
  watchHousehold: 0,
  watchMembers: 0,
  watchTreats: 0,
  watchOpenTasks: 0,
  watchDoneTasks: 0,
  watchRecentEvents: 0
};

let repos: DemoRepository[] = [];

function makeStores() {
  const ui = new UiStore();
  const household = new HouseholdStore({ ui });
  const tasks = new TasksStore({
    ui,
    clock: new ClockStore({ now: () => NOW }),
    memberIds: () => household.memberIds
  });
  const sync = new SyncStore();
  const session = new SessionStore({
    scoped: [household, tasks],
    repoStores: [sync, ui],
    onError: (e) => ui.pushError(e)
  });
  return { ui, household, tasks, sync, session };
}

async function demoRepo(initial: 'seed' | 'empty' = 'seed') {
  const repo = await createDemoRepository({ now: () => NOW, persistence: 'none', initial });
  repos.push(repo);
  return counted(repo);
}

beforeEach(() => sessionStorage.clear());
afterEach(async () => {
  for (const r of repos) await r.dispose();
  repos = [];
});

describe('boot', () => {
  it('setup mode: no repository, phase setup, no splash wait', async () => {
    const { session } = makeStores();
    const createRepo = vi.fn();
    const booting = session.boot({ resolution: { mode: 'setup', reset: false }, createRepo });
    expect(session.phase).toBe('setup'); // decided synchronously, before the first render
    await booting;
    expect(session.mode).toBe('setup');
    expect(session.repo).toBeNull();
    expect(createRepo).not.toHaveBeenCalled();
    await expect(session.signIn()).rejects.toBeInstanceOf(RepoError);
  });

  it('demo: booting until the first auth state, then ready with the stores fed', async () => {
    const { session, household, tasks, sync } = makeStores();
    const c = await demoRepo();
    const done = session.boot({ resolution: DEMO, createRepo: async () => c.repo });
    expect(session.phase).toBe('booting');
    await done;
    expect(session.phase).toBe('ready');
    expect(session.mode).toBe('demo');
    expect(session.user?.uid).toBe(MICHAL);
    expect(session.householdId).toBe(HID);
    await flush();
    expect(tasks.pulse).toEqual({ attention: 3, today: 4, waiting: 3, requested: 1 });
    expect(household.me?.displayName).toBe('מיכל');
    expect(household.partner?.displayName).toBe('דני');
    expect(sync.status).toBe('synced');
    expect(c.active()).toEqual(ALL_ONE);
  });

  it('boot() twice boots once', async () => {
    const { session } = makeStores();
    const c = await demoRepo();
    const createRepo = vi.fn(async () => c.repo);
    const a = session.boot({ resolution: DEMO, createRepo });
    const b = session.boot({ resolution: DEMO, createRepo });
    expect(a).toBe(b);
    await Promise.all([a, b, session.whenBooted()]);
    expect(createRepo).toHaveBeenCalledTimes(1);
    expect(c.opened().onAuthChange).toBe(1);
  });

  it('a failed boot keeps the splash with the error (retry = reload)', async () => {
    const { session } = makeStores();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await session.boot({ resolution: DEMO, createRepo: () => Promise.reject(new Error('down')) });
    expect(session.phase).toBe('booting');
    expect(session.error).toBeInstanceOf(Error);
    err.mockRestore();
  });

  it('a failed household lookup during boot is a boot error too', async () => {
    const { session } = makeStores();
    const c = await demoRepo();
    vi.spyOn(c.repo, 'getMyHouseholdId').mockRejectedValueOnce(new RepoError('network'));
    await session.boot({ resolution: DEMO, createRepo: async () => c.repo });
    expect(session.phase).toBe('booting');
    expect(session.error).toBeInstanceOf(RepoError);
  });
});

describe('phases and subscriptions', () => {
  it('acting as the partner switches the user without re-subscribing anything', async () => {
    const { session, household } = makeStores();
    const c = await demoRepo();
    await session.boot({ resolution: DEMO, createRepo: async () => c.repo });
    const before = c.opened();
    c.repo.actAs(DANI);
    await session.settled();
    expect(session.user?.uid).toBe(DANI);
    expect(household.me?.displayName).toBe('דני');
    expect(c.opened()).toEqual(before);
    expect(c.active()).toEqual(ALL_ONE);
  });

  it('rapid auth changes: only the newest is applied, and settled() waits for it', async () => {
    const { session } = makeStores();
    const c = await demoRepo();
    await session.boot({ resolution: DEMO, createRepo: async () => c.repo });
    const lookups = vi.spyOn(c.repo, 'getMyHouseholdId');
    c.repo.actAs(DANI);
    c.repo.actAs('newcomer');
    c.repo.actAs(MICHAL);
    await session.settled();
    expect(session.user?.uid).toBe(MICHAL);
    expect(session.phase).toBe('ready');
    expect(lookups).toHaveBeenCalledTimes(1); // the superseded ones were skipped
    expect(c.active()).toEqual(ALL_ONE);
  });

  it('sign-out tears the household subscriptions down; sign-in brings back exactly one set', async () => {
    const { session, tasks, household } = makeStores();
    const c = await demoRepo();
    await session.boot({ resolution: DEMO, createRepo: async () => c.repo });
    await session.signOut();
    expect(session.phase).toBe('signed-out');
    expect(c.active()).toEqual(REPO_WIDE_ONLY);
    expect(tasks.open).toEqual([]);
    expect(household.household).toBeNull();

    await session.signIn();
    expect(session.phase).toBe('ready');
    expect(c.active()).toEqual(ALL_ONE);
    await session.signIn(); // already signed in: nothing happens
    expect(c.active()).toEqual(ALL_ONE);
    expect(c.opened().watchOpenTasks).toBe(2);
  });

  it('no household → create → ready → leave → no household → join → ready', async () => {
    const { session, household } = makeStores();
    const c = await demoRepo('empty');
    await session.boot({ resolution: DEMO, createRepo: async () => c.repo });
    expect(session.phase).toBe('signed-out');
    expect(c.active()).toEqual(REPO_WIDE_ONLY);

    await session.signIn();
    expect(session.phase).toBe('no-household');
    expect(c.active().watchOpenTasks).toBe(0);

    const hid = await session.createHousehold('הבית של נועה', PROFILE);
    expect(session.phase).toBe('ready');
    expect(session.householdId).toBe(hid);
    await flush();
    expect(household.me?.displayName).toBe('נועה');
    expect(c.active()).toEqual(ALL_ONE);
    const invite = await household.createInvite();

    await session.leaveHousehold();
    expect(session.phase).toBe('no-household');
    expect(c.active()).toEqual(REPO_WIDE_ONLY);

    // Someone else joins with the invite; then a fresh user joins through the same flow.
    c.repo.actAs('newcomer');
    await session.settled();
    expect(session.phase).toBe('no-household');
    rememberPendingInvite(invite!.code);
    expect(await session.joinHousehold(invite!.code, { ...PROFILE, displayName: 'רון' })).toBe(hid);
    expect(session.phase).toBe('ready');
    expect(peekPendingInvite()).toBeNull();
    expect(c.active()).toEqual(ALL_ONE);
  });

  it('onboarding actions reject with the RepoError and leave the phase as it was', async () => {
    const { session } = makeStores();
    const c = await demoRepo('empty');
    await session.boot({ resolution: DEMO, createRepo: async () => c.repo });
    await session.signIn();
    await expect(session.joinHousehold('AAAAAAAAAAAAAAAAAAAAAAAA', PROFILE)).rejects.toMatchObject({
      code: 'not-found'
    });
    expect(session.phase).toBe('no-household');
    vi.spyOn(c.repo, 'signInWithGoogle').mockRejectedValueOnce(new RepoError('popup-blocked'));
    await session.signOut();
    await expect(session.signIn()).rejects.toMatchObject({ code: 'popup-blocked' });
    expect(session.phase).toBe('signed-out');
  });

  it('a failed leave re-attaches (and rejects)', async () => {
    const { session } = makeStores();
    const c = await demoRepo();
    await session.boot({ resolution: DEMO, createRepo: async () => c.repo });
    vi.spyOn(c.repo, 'leaveHousehold').mockRejectedValueOnce(new RepoError('network'));
    await expect(session.leaveHousehold()).rejects.toMatchObject({ code: 'network' });
    expect(session.phase).toBe('ready');
    expect(c.active()).toEqual(ALL_ONE);
  });

  it('resetDemo while ready keeps one subscription set and lands back on מיכל', async () => {
    const { session, tasks } = makeStores();
    const c = await demoRepo();
    await session.boot({ resolution: DEMO, createRepo: async () => c.repo });
    c.repo.actAs(DANI);
    tasks.create({ title: 'משהו חדש', priority: 'urgent' });
    await c.repo.resetDemo();
    await session.settled();
    await flush();
    expect(session.user?.uid).toBe(MICHAL);
    expect(tasks.pulse).toEqual({ attention: 3, today: 4, waiting: 3, requested: 1 });
    expect(c.active()).toEqual(ALL_ONE);
  });
});

describe('route gating', () => {
  const routes: RouteName[] = [
    'home',
    'memory',
    'jar',
    'household',
    'settings',
    'task',
    'welcome',
    'onboardingProfile',
    'onboardingHousehold',
    'onboardingInstall',
    'onboardingNotifications',
    'join',
    'setup',
    'devGallery'
  ];
  const allowedIn = (phase: Phase) => routes.filter((r) => routeAllowed(phase, r));

  it('allows exactly the routes of each phase', () => {
    expect(allowedIn('booting')).toEqual([]);
    expect(allowedIn('setup')).toEqual(['setup', 'devGallery']);
    expect(allowedIn('signed-out')).toEqual(['welcome', 'devGallery']);
    expect(allowedIn('no-household')).toEqual([
      'onboardingProfile',
      'onboardingHousehold',
      'join',
      'devGallery'
    ]);
    expect(allowedIn('ready')).toEqual([
      'home',
      'memory',
      'jar',
      'household',
      'settings',
      'task',
      'onboardingProfile',
      'onboardingInstall',
      'onboardingNotifications',
      'devGallery'
    ]);
  });

  it('redirects a disallowed route to the phase home', () => {
    expect(gateTarget('booting', { name: 'home' })).toBeNull();
    expect(gateTarget('setup', { name: 'home' })).toBe('#/setup');
    expect(gateTarget('setup', { name: 'setup' })).toBeNull();
    expect(gateTarget('signed-out', { name: 'join' })).toBe('#/welcome');
    expect(gateTarget('no-household', { name: 'welcome' })).toBe('#/onboarding/household');
    expect(gateTarget('no-household', { name: 'home' }, 'Abc 1')).toBe('#/join/Abc%201');
    expect(gateTarget('no-household', { name: 'join' }, 'x')).toBeNull();
    expect(gateTarget('ready', { name: 'setup' })).toBe('#/');
    expect(gateTarget('ready', { name: 'welcome' })).toBe('#/');
    expect(gateTarget('ready', { name: 'join' })).toBe('#/');
    expect(gateTarget('ready', { name: 'task' })).toBeNull();
  });

  it('pending invite: remember, peek, take once', () => {
    expect(peekPendingInvite()).toBeNull();
    rememberPendingInvite('CODE');
    expect(peekPendingInvite()).toBe('CODE');
    expect(takePendingInvite()).toBe('CODE');
    expect(takePendingInvite()).toBeNull();
  });
});
