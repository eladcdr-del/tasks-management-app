import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepoError } from '$lib/data/repository';
import { createDemoRepository, type DemoRepository } from '$lib/data/demo/demoRepository';
import { DANI, DEMO_HOUSEHOLD_ID as HID, MICHAL } from '$lib/data/demo/seed';
import type { Member } from '$lib/domain/types';
import { HouseholdStore, sortMembers } from './household.svelte';
import { errorMessage, UiStore } from './ui.svelte';

const NOW = Date.parse('2026-10-04T09:00:00+03:00');
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let repo: DemoRepository;
let ui: UiStore;
let store: HouseholdStore;

beforeEach(async () => {
  repo = await createDemoRepository({ now: () => NOW, persistence: 'none' });
  ui = new UiStore();
  ui.bindRepo(repo);
  store = new HouseholdStore({ ui });
});

afterEach(async () => {
  store.detach();
  await repo.dispose();
});

async function attachAs(uid: string) {
  store.setUser(uid);
  store.attach({ repo, householdId: HID });
  await flush();
}

describe('HouseholdStore reads', () => {
  it('loads the seeded household: members by joinedAt, me, partner, jar, treats', async () => {
    expect(store.loaded).toBe(false);
    expect(store.memberIds).toBeUndefined();
    await attachAs(MICHAL);
    expect(store.loaded).toBe(true);
    expect(store.household?.name).toBe('הבית שלנו');
    expect(store.members.map((m) => m.uid)).toEqual([MICHAL, DANI]);
    expect(store.memberIds).toEqual([MICHAL, DANI]);
    expect(store.me?.displayName).toBe('מיכל');
    expect(store.partner?.displayName).toBe('דני');
    expect(store.memberById(DANI)?.color).toBe('slate');
    expect(store.memberById('nobody')).toBeNull();
    expect(store.memberById(null)).toBeNull();
    expect(store.jar).toMatchObject({ treat: 'ארוחה במסעדה', count: 7, target: 10, round: 3 });
    expect(store.treats).toHaveLength(2);
    expect(store.invite).toBeNull();
  });

  it('setUser switches me / partner without re-subscribing', async () => {
    await attachAs(MICHAL);
    const spy = vi.spyOn(repo, 'watchMembers');
    store.setUser(DANI);
    expect(store.me?.displayName).toBe('דני');
    expect(store.partner?.displayName).toBe('מיכל');
    store.attach({ repo, householdId: HID }); // same scope: no-op
    expect(spy).not.toHaveBeenCalled();
  });

  it('partner is null unless the household is exactly two (me included)', async () => {
    await attachAs(MICHAL);
    await repo.simulateJoin();
    await flush();
    expect(store.members).toHaveLength(3);
    expect(store.partner).toBeNull();
    store.setUser('stranger');
    expect(store.me).toBeNull();
  });

  it('detach clears everything and stops the snapshots', async () => {
    await attachAs(MICHAL);
    store.detach();
    expect(store.household).toBeNull();
    expect(store.members).toEqual([]);
    expect(store.treats).toEqual([]);
    expect(store.loaded).toBe(false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await store.updateHousehold({ name: 'אחר' }); // detached: warns, does nothing
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    await repo.updateHousehold(HID, { name: 'שונה' });
    await flush();
    expect(store.household).toBeNull();
  });

  it('sortMembers: joinedAt, then uid', () => {
    const m = (uid: string, joinedAt: number) => ({ uid, joinedAt }) as Member;
    expect(sortMembers([m('b', 2), m('c', 1), m('a', 2)]).map((x) => x.uid)).toEqual([
      'c',
      'a',
      'b'
    ]);
  });
});

describe('HouseholdStore actions', () => {
  it('createInvite / revokeInvite update the active invite', async () => {
    await attachAs(MICHAL);
    const invite = await store.createInvite();
    expect(invite?.householdName).toBe('הבית שלנו');
    await flush();
    expect(store.invite?.code).toBe(invite?.code);
    await store.revokeInvite();
    await flush();
    expect(store.invite).toBeNull();
    await store.revokeInvite(); // nothing active: no-op
  });

  it('updateMember / updateHousehold write through', async () => {
    await attachAs(MICHAL);
    await store.updateMember({ displayName: 'מיכלי', color: 'teal' });
    await store.updateHousehold({ name: 'הבית בכפר סבא' });
    await flush();
    expect(store.me).toMatchObject({ displayName: 'מיכלי', color: 'teal' });
    expect(store.household?.name).toBe('הבית בכפר סבא');
  });

  it('setJar writes; redeeming a jar that is not full shows the error snackbar', async () => {
    await attachAs(MICHAL);
    store.setJar({ treat: 'סרט', target: 8 });
    expect(store.jar).toMatchObject({ treat: 'סרט', target: 8, count: 7 });
    store.redeemJar();
    await flush();
    expect(ui.current?.message).toBe(errorMessage(new RepoError('conflict')));
    expect(store.jar?.round).toBe(3);
  });

  it('a rejected action shows the error and resolves to null', async () => {
    await attachAs(MICHAL);
    vi.spyOn(repo, 'createInvite').mockRejectedValueOnce(new RepoError('network'));
    expect(await store.createInvite()).toBeNull();
    expect(ui.current?.message).toBe(errorMessage(new RepoError('network')));
  });
});
