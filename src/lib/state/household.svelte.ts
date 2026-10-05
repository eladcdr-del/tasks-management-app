// Household state (step 2.4): the household document, its members, the treat jar and the invite.
// Fed by watchHousehold / watchMembers / watchTreats while the session is `ready` (attach/detach
// are called by the session only). Screens read the fields and call the actions; they never touch
// the repository.
//
//   household.household, .members (by joinedAt), .me, .partner, .memberById(uid), .memberIds
//   household.jar, .treats, .invite, .loaded
//   household.createInvite() / revokeInvite(code?) / updateMember(patch) / updateHousehold(patch)
//   household.setJar({ treat, target } | { treat, mode: 'each', share }) / redeemJar()
//
// Actions never reject: a failure is shown as a snackbar (ui.pushError) and the action resolves to
// null / undefined.

import type { Repository } from '$lib/data/repository';
import type { JarSettings } from '$lib/domain/jar';
import type { EarnedTreat, Household, Invite, Member, Unsubscribe } from '$lib/domain/types';
import { ui as defaultUi, type UiStore } from './ui.svelte';
import type { HouseholdScope, ScopedStore } from './session.svelte';

export type MemberPatch = Parameters<Repository['updateMember']>[1];

/** Members in a stable order: by joinedAt (the owner first), then uid. */
export function sortMembers(members: readonly Member[]): Member[] {
  return [...members].sort((a, b) => a.joinedAt - b.joinedAt || (a.uid < b.uid ? -1 : 1));
}

export class HouseholdStore implements ScopedStore {
  household = $state.raw<Household | null>(null);
  /** Sorted by joinedAt. Empty until the first snapshot. */
  members = $state.raw<readonly Member[]>([]);
  /** Earned treats, newest round first. */
  treats = $state.raw<readonly EarnedTreat[]>([]);
  /** The signed-in uid (set by the session). */
  uid = $state<string | null>(null);
  #membersLoaded = $state(false);

  /** Both the household and its members have arrived. */
  readonly loaded: boolean = $derived(this.household !== null && this.#membersLoaded);
  readonly me: Member | null = $derived(this.members.find((m) => m.uid === this.uid) ?? null);
  /** The other member when the household is exactly two people (me + one); otherwise null. */
  readonly partner: Member | null = $derived(
    this.members.length === 2 && this.me !== null
      ? (this.members.find((m) => m.uid !== this.uid) ?? null)
      : null
  );
  /** Membership from the household document; undefined until it loads (groupTasks then trusts owners). */
  readonly memberIds: readonly string[] | undefined = $derived(this.household?.memberIds);
  readonly jar = $derived(this.household?.jar ?? null);
  /** The active invite `{ code, expiresAt }` (members only), or null. */
  readonly invite = $derived(this.household?.invite ?? null);
  readonly #byUid = $derived(new Map(this.members.map((m) => [m.uid, m])));

  #ui: UiStore;
  #scope: HouseholdScope | null = null;
  #subs: Unsubscribe[] = [];

  constructor(opts: { ui?: UiStore } = {}) {
    this.#ui = opts.ui ?? defaultUi;
  }

  memberById(uid: string | null | undefined): Member | null {
    return uid ? (this.#byUid.get(uid) ?? null) : null;
  }

  // ── lifecycle (session only) ──────────────────────────────────────────────

  attach(scope: HouseholdScope): void {
    const cur = this.#scope;
    if (cur && cur.repo === scope.repo && cur.householdId === scope.householdId) return;
    this.detach();
    this.#scope = scope;
    const { repo, householdId: hid } = scope;
    this.#subs = [
      repo.watchHousehold(hid, (h) => (this.household = h)),
      repo.watchMembers(hid, (m) => {
        this.members = sortMembers(m);
        this.#membersLoaded = true;
      }),
      repo.watchTreats(hid, (t) => (this.treats = t))
    ];
  }

  detach(): void {
    for (const unsub of this.#subs) unsub();
    this.#subs = [];
    this.#scope = null;
    this.household = null;
    this.members = [];
    this.treats = [];
    this.#membersLoaded = false;
  }

  setUser(uid: string | null): void {
    this.uid = uid;
  }

  // ── actions ───────────────────────────────────────────────────────────────

  /** A new invite (revokes the previous one), or null on failure. */
  async createInvite(): Promise<Invite | null> {
    return this.#call((repo, hid) => repo.createInvite(hid), null);
  }

  /** Revokes `code` (default: the active invite). */
  async revokeInvite(code: string | undefined = this.invite?.code): Promise<void> {
    if (!code) return;
    await this.#call((repo, hid) => repo.revokeInvite(hid, code), undefined);
  }

  /** Edits MY member profile (name, colour, address-as, notification prefs). */
  async updateMember(patch: MemberPatch): Promise<void> {
    await this.#call((repo, hid) => repo.updateMember(hid, patch), undefined);
  }

  async updateHousehold(patch: { name?: string }): Promise<void> {
    await this.#call((repo, hid) => repo.updateHousehold(hid, patch), undefined);
  }

  /**
   * Sets the jar's treat and goal (a first call starts round 1). `backfill`: domain backfillCounts
   * when switching to 'each' mid-round. Queued write.
   */
  setJar(j: JarSettings, backfill?: Record<string, number> | null): void {
    void this.#call((repo, hid) => repo.setJar(hid, j, backfill ?? undefined), undefined);
  }

  /** "מימשנו": records the treat and starts the next round. Queued write. */
  redeemJar(): void {
    void this.#call((repo, hid) => repo.redeemJar(hid), undefined);
  }

  async #call<T, F>(
    fn: (repo: Repository, hid: string) => T | Promise<T>,
    fallback: F
  ): Promise<T | F> {
    const scope = this.#scope;
    if (!scope) {
      console.warn('[homecare] household action while no household is attached');
      return fallback;
    }
    try {
      return await fn(scope.repo, scope.householdId);
    } catch (e) {
      this.#ui.pushError(e);
      return fallback;
    }
  }
}

export const household = new HouseholdStore();
