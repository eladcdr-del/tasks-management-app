// Household state (step 2.4): the household document, its members, the treat jar and the invite.
// Fed by watchHousehold / watchMembers / watchTreats while the session is `ready` (attach/detach
// are called by the session only). Screens read the fields and call the actions; they never touch
// the repository.
//
//   household.household, .members (by joinedAt), .me, .partner, .memberById(uid), .memberIds
//   household.jar, .treats, .invite, .loaded
//   household.createInvite() / revokeInvite(code?) / updateMember(patch) / updateHousehold(patch)
//   household.setJar({ treat, target } | { treat, mode: 'each', share }) / redeemJar()
//   household.deleteJar() / undoDeleteJar()          the jar is gone at once; deleted after 5 s
//   household.deleteTreat(id) / undoDeleteTreat(id)  the same for an earned treat (its history row)
//   household.flushDeletes()                         commits pending deletes now
//
// Deletes follow tasks.remove: hidden at once (household.jar reads null, the treat leaves
// household.treats), a snackbar with "ביטול" for UNDO_MS, then the repository call. A hidden page,
// a detach or setJar commits a pending jar delete first (a new jar then starts after it). Once
// sent, what was deleted stays hidden until the snapshots agree (no flash of the old jar while a
// queued write lands), or SETTLE_MS at most: a refused delete then shows it again, with the error.
//
// Actions never reject: a failure is shown as a snackbar (ui.pushError) and the action resolves to
// null / undefined.

import type { Repository } from '$lib/data/repository';
import type { JarSettings } from '$lib/domain/jar';
import type {
  EarnedTreat,
  Household,
  Invite,
  Member,
  TreatJar,
  Unsubscribe
} from '$lib/domain/types';
import { he } from '$lib/i18n/he';
import { ui as defaultUi, type UiStore } from './ui.svelte';
import type { HouseholdScope, ScopedStore } from './session.svelte';

export type MemberPatch = Parameters<Repository['updateMember']>[1];

/** Undo window of deleteJar / deleteTreat (the snackbar shows for as long), as for tasks. */
export const UNDO_MS = 5000;

/** After a delete is sent, the longest it stays hidden waiting for the snapshots to agree. */
export const SETTLE_MS = 4000;

/** A delete waiting out its undo window. */
interface PendingDelete {
  timer: ReturnType<typeof setTimeout>;
  /** The snackbar offering "ביטול" (dismissed when the delete commits early). */
  snack: number;
}

/** One round of a jar: a redeem or a new jar after a delete starts another (new startedAt). */
interface JarKey {
  round: number;
  startedAt: number;
}

const isJarOf = (jar: TreatJar | null | undefined, key: JarKey | null): boolean =>
  !!jar && !!key && jar.round === key.round && jar.startedAt === key.startedAt;

/** Members in a stable order: by joinedAt (the owner first), then uid. */
export function sortMembers(members: readonly Member[]): Member[] {
  return [...members].sort((a, b) => a.joinedAt - b.joinedAt || (a.uid < b.uid ? -1 : 1));
}

export class HouseholdStore implements ScopedStore {
  household = $state.raw<Household | null>(null);
  /** Sorted by joinedAt. Empty until the first snapshot. */
  members = $state.raw<readonly Member[]>([]);
  #rawTreats = $state.raw<readonly EarnedTreat[]>([]);
  /** The jar being deleted (that round of it): it already reads as gone. */
  #hiddenJar = $state.raw<JarKey | null>(null);
  /** Earned treats being deleted: already gone from `treats`. */
  #hiddenTreats = $state.raw<ReadonlySet<string>>(new Set());
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
  /** The jar, or null (none set up, or being deleted). */
  readonly jar: TreatJar | null = $derived(
    isJarOf(this.household?.jar, this.#hiddenJar) ? null : (this.household?.jar ?? null)
  );
  /** Earned treats, newest round first (minus the ones being deleted). */
  readonly treats: readonly EarnedTreat[] = $derived(
    this.#hiddenTreats.size === 0
      ? this.#rawTreats
      : this.#rawTreats.filter((t) => !this.#hiddenTreats.has(t.id))
  );
  /** The active invite `{ code, expiresAt }` (members only), or null. */
  readonly invite = $derived(this.household?.invite ?? null);
  readonly #byUid = $derived(new Map(this.members.map((m) => [m.uid, m])));

  #ui: UiStore;
  #scope: HouseholdScope | null = null;
  #subs: Unsubscribe[] = [];
  /** The jar delete in its undo window. */
  #jarDelete: PendingDelete | null = null;
  /** Treat deletes in their undo window, by treat id. */
  #treatDeletes = new Map<string, PendingDelete>();
  #settleTimers = new Set<ReturnType<typeof setTimeout>>();

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
      repo.watchHousehold(hid, (h) => {
        this.household = h;
        this.#settleJar();
      }),
      repo.watchMembers(hid, (m) => {
        this.members = sortMembers(m);
        this.#membersLoaded = true;
      }),
      repo.watchTreats(hid, (t) => {
        this.#rawTreats = t;
        this.#settleTreats();
      })
    ];
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.#onVisibility);
    }
  }

  detach(): void {
    if (this.#scope) this.flushDeletes();
    for (const unsub of this.#subs) unsub();
    this.#subs = [];
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.#onVisibility);
    }
    for (const timer of this.#settleTimers) clearTimeout(timer);
    this.#settleTimers.clear();
    this.#scope = null;
    this.household = null;
    this.members = [];
    this.#rawTreats = [];
    this.#hiddenJar = null;
    this.#hiddenTreats = new Set();
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
   * Sets the jar's treat and goal (without a jar it starts one: round 1, or after a delete the
   * round after the deleted one). `backfill`: domain backfillCounts when switching to 'each'
   * mid-round. Queued write.
   */
  setJar(j: JarSettings, backfill?: Record<string, number> | null): void {
    // A jar delete still in its undo window goes first: the new jar then starts after it.
    this.#commitJarDelete();
    void this.#call((repo, hid) => repo.setJar(hid, j, backfill ?? undefined), undefined);
  }

  /** "מימשנו": records the treat and starts the next round. Queued write. */
  redeemJar(): void {
    void this.#call((repo, hid) => repo.redeemJar(hid), undefined);
  }

  /**
   * "מחיקת הצנצנת": the jar reads as gone at once (Jar screen and Home show "no jar"), with a
   * "הצנצנת נמחקה · ביטול" snackbar; repo.deleteJar runs after UNDO_MS unless undoDeleteJar().
   * Earned treats stay.
   */
  deleteJar(): void {
    const jar = this.household?.jar;
    if (!this.#scope || this.#jarDelete || !jar || isJarOf(jar, this.#hiddenJar)) return;
    this.#hiddenJar = { round: jar.round, startedAt: jar.startedAt };
    this.#jarDelete = {
      timer: setTimeout(() => this.#commitJarDelete(false), UNDO_MS),
      snack: this.#ui.show(he.jar.remove.done, {
        action: he.common.undo,
        onAction: () => this.undoDeleteJar(),
        duration: UNDO_MS
      })
    };
  }

  /** Brings the jar back exactly as it was. False when no delete is waiting (already sent). */
  undoDeleteJar(): boolean {
    const pending = this.#jarDelete;
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.#jarDelete = null;
    this.#hiddenJar = null;
    return true;
  }

  /**
   * Removes an earned treat from the history ("הצ׳ופר נמחק מההיסטוריה · ביטול"); repo.deleteTreat
   * runs after UNDO_MS unless undoDeleteTreat(id).
   */
  deleteTreat(id: string): void {
    if (!this.#scope || this.#hiddenTreats.has(id)) return;
    if (!this.#rawTreats.some((t) => t.id === id)) return;
    this.#hiddenTreats = new Set([...this.#hiddenTreats, id]);
    this.#treatDeletes.set(id, {
      timer: setTimeout(() => this.#commitTreatDelete(id, false), UNDO_MS),
      snack: this.#ui.show(he.jar.removeTreat.done, {
        action: he.common.undo,
        onAction: () => this.undoDeleteTreat(id),
        duration: UNDO_MS
      })
    });
  }

  /** Puts the treat back in the history. False when no delete of it is waiting. */
  undoDeleteTreat(id: string): boolean {
    const pending = this.#treatDeletes.get(id);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.#treatDeletes.delete(id);
    this.#unhideTreat(id);
    return true;
  }

  /** Commits every pending delete now (page hidden, sign-out, leaving the household). */
  flushDeletes(): void {
    this.#commitJarDelete();
    for (const id of [...this.#treatDeletes.keys()]) this.#commitTreatDelete(id);
  }

  /** `early`: before the undo window is over (flush, setJar), so its snackbar goes too. */
  #commitJarDelete(early = true): void {
    const pending = this.#jarDelete;
    if (!pending) return;
    clearTimeout(pending.timer);
    this.#dropUndo(pending.snack, early);
    this.#jarDelete = null;
    const key = this.#hiddenJar;
    // Deleted or redeemed elsewhere meanwhile (a redeem shows the next round again): the round
    // that was hidden is gone already, and nothing the user still sees is deleted.
    if (!isJarOf(this.household?.jar, key)) {
      this.#hiddenJar = null;
      return;
    }
    void this.#call((repo, hid) => repo.deleteJar(hid), undefined);
    this.#settleJar();
    if (this.#hiddenJar) {
      this.#afterSettle(() => {
        if (this.#hiddenJar === key && !this.#jarDelete) this.#hiddenJar = null;
      });
    }
  }

  #commitTreatDelete(id: string, early = true): void {
    const pending = this.#treatDeletes.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.#dropUndo(pending.snack, early);
    this.#treatDeletes.delete(id);
    void this.#call((repo, hid) => repo.deleteTreat(hid, id), undefined);
    this.#settleTreats();
    if (this.#hiddenTreats.has(id)) this.#afterSettle(() => this.#unhideTreat(id));
  }

  /**
   * The "ביטול" snackbar of a delete that is being sent: too late to undo. Early, it goes. At the
   * end of the window, one still waiting in the queue goes; the one on screen times out by itself
   * at this very moment.
   */
  #dropUndo(snack: number, early: boolean): void {
    if (early || this.#ui.current?.id !== snack) this.#ui.dismiss(snack);
  }

  /** A sent jar delete has landed (no jar, or another round): stop hiding. */
  #settleJar(): void {
    if (this.#jarDelete || !this.#hiddenJar) return;
    if (!isJarOf(this.household?.jar, this.#hiddenJar)) this.#hiddenJar = null;
  }

  /** Sent treat deletes that have landed (the treat is gone from the snapshot): stop hiding. */
  #settleTreats(): void {
    for (const id of this.#hiddenTreats) {
      if (this.#treatDeletes.has(id)) continue;
      if (!this.#rawTreats.some((t) => t.id === id)) this.#unhideTreat(id);
    }
  }

  #afterSettle(fn: () => void): void {
    const timer = setTimeout(() => {
      this.#settleTimers.delete(timer);
      fn();
    }, SETTLE_MS);
    this.#settleTimers.add(timer);
  }

  #unhideTreat(id: string): void {
    if (!this.#hiddenTreats.has(id) || this.#treatDeletes.has(id)) return;
    const next = new Set(this.#hiddenTreats);
    next.delete(id);
    this.#hiddenTreats = next;
  }

  /** Hidden page → pending deletes commit (the user may never come back within the undo window). */
  #onVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.flushDeletes();
  };

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
