// Task state (step 2.4). Fed by watchOpenTasks / watchDoneTasks / watchRecentEvents while the
// session is `ready` (attach/detach are called by the session only). Every derived view comes from
// the domain functions; screens never compute buckets themselves and never touch the repository.
//
// Reads
//   tasks.open                     open tasks (repository order), minus the ones being deleted
//   tasks.today                    clock.today (clock.svelte.ts): ISODate in Asia/Jerusalem, rolls over
//                                  at local midnight and when the app becomes visible again
//   tasks.groups                   groupTasks(open, today, memberIds, uid): attention/requested/
//                                  waiting/today/week/later ("requested" = asked of the signed-in user)
//   tasks.pulse                    pulseCounts(…): { attention, today, waiting, requested }
//   tasks.countsByMember           openCountsByMember(open, memberIds): { [uid]: n }
//   tasks.byId(id)                 an open or loaded done task, or null
//   tasks.done / hasMoreDone / loadMoreDone()      completed tasks, newest first, paged
//   tasks.recentEvents / eventsFor(taskId)         activity, newest first
//   tasks.watchTask(id)            live single task for the detail screen: { task, dispose() }
//   tasks.openLoaded / doneLoaded  the first snapshot has arrived (show skeletons until then)
//
// Writes (each goes straight to the repository; the snapshot then updates the reads)
//   create(draft) → id | null      update(id, patch)      take(id) → TakeResult | null
//   request(id, toUid)             release(id)            snooze(id, until)
//   accept(id) → TakeResult | null decline(id)            cancelRequest(id)    (requests)
//   complete(id, completion, photos?) → CompleteResult | null           reopen(id)
//   remove(id, message?)           hidden at once, deleted after 5 s unless undoRemove(id)
//   removeMany(ids, message?)      the same for several at once (Home's selection), ONE snackbar
//                                  whose "ביטול" brings them all back (undoRemoveMany)
//   createMany(drafts) → ids       quick add's list mode: one create per draft, in order
//   takeMany(ids) → { taken, lost } "אני לוקח/ת" on several free tasks (Home's selection)
//
// Actions never reject: failures are shown as a snackbar (ui.pushError) and resolve to null.

import type { CompleteResult, Repository, TakeResult } from '$lib/data/repository';
import type {
  ActivityEvent,
  Completion,
  EncodedPhoto,
  ISODate,
  Task,
  TaskDraft,
  TaskPatch,
  Unsubscribe
} from '$lib/domain/types';
import { groupTasks, openCountsByMember, pulseCounts } from '$lib/domain/buckets';
import { he } from '$lib/i18n/he';
import { ui as defaultUi, type UiStore } from './ui.svelte';
import { clock as defaultClock, type ClockStore } from './clock.svelte';
import { household as defaultHousehold } from './household.svelte';
import type { HouseholdScope, ScopedStore } from './session.svelte';

/** Done tasks per page (Memory screen). */
export const DONE_PAGE_SIZE = 30;
/** Recent activity kept live (task history timelines filter it). */
export const RECENT_EVENTS_LIMIT = 100;
/** Undo window of `remove` (the snackbar shows for as long). */
export const DELETE_DELAY_MS = 5000;

/** A live single-task subscription (detail screen). `task` is undefined while loading, null if gone. */
export class TaskWatch {
  task = $state.raw<Task | null | undefined>(undefined);
  #dispose: () => void;

  constructor(dispose: (w: TaskWatch) => void) {
    this.#dispose = () => dispose(this);
  }

  get loading(): boolean {
    return this.task === undefined;
  }

  dispose(): void {
    this.#dispose();
  }
}

export interface TasksStoreOptions {
  ui?: UiStore;
  /** Current membership (default: the household store's). undefined = not loaded yet. */
  memberIds?: () => readonly string[] | undefined;
  /** Source of "today" (tests pass their own). Default: the app clock. */
  clock?: ClockStore;
}

export class TasksStore implements ScopedStore {
  // Collaborators first: the derived fields below read them (lazily, but TS checks the order).
  #ui: UiStore = defaultUi;
  #memberIds: () => readonly string[] | undefined = () => defaultHousehold.memberIds;
  #clock: ClockStore = defaultClock;

  /** Calendar date in Asia/Jerusalem (the clock's). */
  readonly today: ISODate = $derived(this.#clock.today);
  /** The signed-in uid (set by the session). */
  uid = $state<string | null>(null);
  openLoaded = $state(false);
  done = $state.raw<readonly Task[]>([]);
  hasMoreDone = $state(false);
  doneLoaded = $state(false);
  recentEvents = $state.raw<readonly ActivityEvent[]>([]);

  #rawOpen = $state.raw<readonly Task[]>([]);
  #deleting = $state.raw<ReadonlySet<string>>(new Set());

  readonly open: readonly Task[] = $derived(
    this.#deleting.size === 0
      ? this.#rawOpen
      : this.#rawOpen.filter((t) => !this.#deleting.has(t.id))
  );
  readonly groups = $derived(groupTasks(this.open, this.today, this.#memberIds(), this.uid));
  readonly pulse = $derived(pulseCounts(this.open, this.today, this.#memberIds(), this.uid));
  readonly countsByMember: Readonly<Record<string, number>> = $derived(
    openCountsByMember(this.open, this.#memberIds() ?? [])
  );
  readonly #index = $derived(new Map([...this.done, ...this.open].map((t) => [t.id, t])));

  #scope: HouseholdScope | null = null;
  #subs: Unsubscribe[] = [];
  #unsubDone: Unsubscribe | null = null;
  #doneLimit = DONE_PAGE_SIZE;
  #watches = new Set<{ watch: TaskWatch; unsub: Unsubscribe | null }>();
  #deleteTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(opts: TasksStoreOptions = {}) {
    if (opts.ui) this.#ui = opts.ui;
    if (opts.memberIds) this.#memberIds = opts.memberIds;
    if (opts.clock) this.#clock = opts.clock;
  }

  byId(id: string): Task | null {
    return this.#deleting.has(id) ? null : (this.#index.get(id) ?? null);
  }

  /** Events about one task, newest first (from the live recent window). */
  eventsFor(taskId: string): ActivityEvent[] {
    return this.recentEvents.filter((e) => e.taskId === taskId);
  }

  /** Subscribes to one task; call `dispose()` when the screen goes away (a detach disposes too). */
  watchTask(id: string): TaskWatch {
    const entry: { watch: TaskWatch; unsub: Unsubscribe | null } = {
      watch: new TaskWatch(() => {
        entry.unsub?.();
        entry.unsub = null;
        this.#watches.delete(entry);
      }),
      unsub: null
    };
    const scope = this.#scope;
    if (!scope) {
      entry.watch.task = null;
      return entry.watch;
    }
    this.#watches.add(entry);
    entry.unsub = scope.repo.watchTask(scope.householdId, id, (t) => (entry.watch.task = t));
    return entry.watch;
  }

  /** Loads the next page of done tasks (re-subscribes with a larger limit; old rows stay meanwhile). */
  loadMoreDone(): void {
    if (!this.#scope || !this.hasMoreDone) return;
    this.#doneLimit += DONE_PAGE_SIZE;
    this.#subscribeDone();
  }

  // ── lifecycle (session only) ──────────────────────────────────────────────

  attach(scope: HouseholdScope): void {
    const cur = this.#scope;
    if (cur && cur.repo === scope.repo && cur.householdId === scope.householdId) return;
    this.detach();
    this.#scope = scope;
    const { repo, householdId: hid } = scope;
    this.#subs = [
      repo.watchOpenTasks(hid, (t) => {
        this.#rawOpen = t;
        this.openLoaded = true;
      }),
      repo.watchRecentEvents(hid, RECENT_EVENTS_LIMIT, (e) => (this.recentEvents = e))
    ];
    this.#doneLimit = DONE_PAGE_SIZE;
    this.#subscribeDone();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.#onVisibility);
    }
  }

  detach(): void {
    if (this.#scope) this.flushDeletes();
    for (const unsub of this.#subs) unsub();
    this.#subs = [];
    this.#unsubDone?.();
    this.#unsubDone = null;
    for (const { watch } of [...this.#watches]) watch.dispose();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.#onVisibility);
    }
    this.#scope = null;
    this.#rawOpen = [];
    this.openLoaded = false;
    this.done = [];
    this.hasMoreDone = false;
    this.doneLoaded = false;
    this.recentEvents = [];
  }

  setUser(uid: string | null): void {
    this.uid = uid;
  }

  // ── actions ───────────────────────────────────────────────────────────────

  /** Adds a task (owned by another member = a request, Blueprint amendment). Returns its id. */
  create(draft: TaskDraft): string | null {
    return this.#run((repo, hid) => repo.createTask(hid, draft), null);
  }

  /**
   * Adds several tasks in a row (quick add's list mode), each exactly like `create`: queued
   * offline, one "created" event each (no push). Returns the ids that were created, in order; a
   * draft that fails is skipped (its error shows once in the snackbar).
   */
  createMany(drafts: readonly TaskDraft[]): string[] {
    const ids: string[] = [];
    for (const draft of drafts) {
      const id = this.create(draft);
      if (id !== null) ids.push(id);
    }
    return ids;
  }

  update(id: string, patch: TaskPatch): void {
    this.#run((repo, hid) => repo.updateTask(hid, id, patch), undefined);
  }

  /** "אני לוקח/ת". `{ ok: false, takenBy }` when someone was faster; null on failure. */
  take(id: string): Promise<TakeResult | null> {
    return this.#runAsync((repo, hid) => repo.takeTask(hid, id));
  }

  /**
   * Takes several tasks at once (Home's selection), each exactly like `take`. Resolves to the ids
   * that became mine, and the ones someone else was faster to (`lost`); a failure shows its error
   * once and counts as neither.
   */
  async takeMany(ids: readonly string[]): Promise<{ taken: string[]; lost: string[] }> {
    const unique = [...new Set(ids)];
    const results = await Promise.all(unique.map((id) => this.take(id)));
    const taken: string[] = [];
    const lost: string[] = [];
    results.forEach((r, i) => {
      const id = unique[i] as string;
      if (r?.ok) taken.push(id);
      else if (r) lost.push(id);
    });
    return { taken, lost };
  }

  /** Asks `toUid` to do it: a proposal, nobody's until they accept (domain/requests.ts). */
  request(id: string, toUid: string): void {
    this.#run((repo, hid) => repo.requestTask(hid, id, toUid), undefined);
  }

  /** "אני לוקח/ת" on a request to me: mine, and the asker hears about it. Same answers as take. */
  accept(id: string): Promise<TakeResult | null> {
    return this.#runAsync((repo, hid) => repo.acceptRequest(hid, id));
  }

  /** "לא מתאים לי": the request is cleared and the task waits for anyone. */
  decline(id: string): void {
    this.#run((repo, hid) => repo.declineRequest(hid, id), undefined);
  }

  /** The asker withdraws a request that still waits for an answer. */
  cancelRequest(id: string): void {
    this.#run((repo, hid) => repo.cancelRequest(hid, id), undefined);
  }

  /** Back to "waiting for someone to take". */
  release(id: string): void {
    this.#run((repo, hid) => repo.releaseTask(hid, id), undefined);
  }

  snooze(id: string, until: ISODate): void {
    this.#run((repo, hid) => repo.snoozeTask(hid, id, until), undefined);
  }

  /** Completes with optional documentation and ≤3 encoded photos (platform/image.ts). */
  complete(
    id: string,
    completion: Omit<Completion, 'photoIds'>,
    photos: readonly EncodedPhoto[] = []
  ): Promise<CompleteResult | null> {
    return this.#runAsync((repo, hid) => repo.completeTask(hid, id, completion, [...photos]));
  }

  /** Undo of complete (jar −1, untouched next instance removed). */
  reopen(id: string): void {
    this.#run((repo, hid) => repo.reopenTask(hid, id), undefined);
  }

  /**
   * Deletes after DELETE_DELAY_MS unless `undoRemove(id)` is called first. The task leaves every
   * list at once. With `message`, shows that snackbar with a "ביטול" action wired to undoRemove.
   */
  remove(id: string, message?: string): void {
    if (!this.#scope || this.#deleteTimers.has(id)) return;
    this.#deleting = new Set([...this.#deleting, id]);
    this.#deleteTimers.set(
      id,
      setTimeout(() => this.#commitDelete(id), DELETE_DELAY_MS)
    );
    if (message !== undefined) {
      this.#ui.show(message, {
        action: he.common.undo,
        onAction: () => this.undoRemove(id),
        duration: DELETE_DELAY_MS
      });
    }
  }

  /**
   * `remove` for several tasks at once (Home's selection): they all leave every list in one go and
   * are deleted after DELETE_DELAY_MS. With `message` (given how many went), ONE snackbar whose
   * "ביטול" brings them all back. Returns the ids it removed (open ones not already going).
   */
  removeMany(ids: readonly string[], message?: (count: number) => string): string[] {
    if (!this.#scope) return [];
    const open = new Set(this.open.map((t) => t.id));
    const fresh = [...new Set(ids)].filter((id) => open.has(id) && !this.#deleteTimers.has(id));
    if (fresh.length === 0) return [];
    this.#deleting = new Set([...this.#deleting, ...fresh]);
    for (const id of fresh) {
      this.#deleteTimers.set(
        id,
        setTimeout(() => this.#commitDelete(id), DELETE_DELAY_MS)
      );
    }
    if (message !== undefined) {
      this.#ui.show(message(fresh.length), {
        action: he.common.undo,
        onAction: () => this.undoRemoveMany(fresh),
        duration: DELETE_DELAY_MS
      });
    }
    return fresh;
  }

  /** Cancels the pending deletes of `ids`; returns how many came back. */
  undoRemoveMany(ids: readonly string[]): number {
    let restored = 0;
    for (const id of ids) if (this.undoRemove(id)) restored++;
    return restored;
  }

  /** Cancels a pending `remove`. False when there is none (already deleted, or never removed). */
  undoRemove(id: string): boolean {
    const timer = this.#deleteTimers.get(id);
    if (timer === undefined) return false;
    clearTimeout(timer);
    this.#deleteTimers.delete(id);
    this.#forget(id);
    return true;
  }

  /** Commits every pending delete now (page hidden, sign-out, leaving the household). */
  flushDeletes(): void {
    for (const id of [...this.#deleteTimers.keys()]) this.#commitDelete(id);
  }

  // ── internals ─────────────────────────────────────────────────────────────

  #commitDelete(id: string): void {
    const timer = this.#deleteTimers.get(id);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.#deleteTimers.delete(id);
    this.#run((repo, hid) => repo.deleteTask(hid, id), undefined);
    this.#forget(id);
  }

  #forget(id: string): void {
    if (!this.#deleting.has(id)) return;
    const next = new Set(this.#deleting);
    next.delete(id);
    this.#deleting = next;
  }

  #subscribeDone(): void {
    const scope = this.#scope;
    if (!scope) return;
    this.#unsubDone?.();
    this.#unsubDone = scope.repo.watchDoneTasks(scope.householdId, this.#doneLimit, (t, more) => {
      this.done = t;
      this.hasMoreDone = more;
      this.doneLoaded = true;
    });
  }

  #run<T, F>(fn: (repo: Repository, hid: string) => T, fallback: F): T | F {
    const scope = this.#scope;
    if (!scope) {
      console.warn('[homecare] task action while no household is attached');
      return fallback;
    }
    try {
      return fn(scope.repo, scope.householdId);
    } catch (e) {
      this.#ui.pushError(e);
      return fallback;
    }
  }

  async #runAsync<T>(fn: (repo: Repository, hid: string) => Promise<T>): Promise<T | null> {
    const scope = this.#scope;
    if (!scope) {
      console.warn('[homecare] task action while no household is attached');
      return null;
    }
    try {
      return await fn(scope.repo, scope.householdId);
    } catch (e) {
      this.#ui.pushError(e);
      return null;
    }
  }

  /** Hidden page → pending deletes commit (the user may never come back within the undo window). */
  #onVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.flushDeletes();
  };
}

export const tasks = new TasksStore();
