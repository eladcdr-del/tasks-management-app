// CONTRACT (Blueprint §1/§7) — frozen in step 1.1. Request changes via the orchestrator.
//
// Tiny hash router built on Svelte 5 runes.
// - Routes live in the hash (`#/task/abc`); `location.search` (e.g. `?demo=1`) is preserved.
// - Every history entry is stamped with `{ idx }` so `back()` knows whether an in-app entry exists.
// - Sheets push their own history entry (`{ idx, sheet }`) so the Android back button closes them.
//
// Usage:
//   import { router } from '$lib/router/router.svelte';
//   router.route.name / router.route.params / router.meta.tab / router.meta.fab / router.sheet
//   router.navigate(href('task', { id }))   router.back()   router.navigateTab('memory')
//   router.openSheet({ name: 'snooze', taskId })   await router.closeSheet()
//   stripQueryParam('reset')   // after consuming ?reset=1 (step 2.4)
//
// History rules (each one is pinned by router.svelte.test.ts):
//  1. Sheets. `openSheet` pushes `{ idx, sheet }` over the current route (or replaces, if a sheet is
//     already open). Only one sheet is ever open, and its base route is always the entry beneath.
//  2. Navigating from inside a sheet REPLACES the sheet's entry, so Back never reopens the sheet.
//     This holds for `navigate()`, for `<a href="#/…">` clicks (rule 4) and for hash changes (rule 5).
//  3. Router-initiated traversals are async. `closeSheet()`, `back()` and `navigateTab('home')` may
//     call `history.back()`, whose popstate arrives later. While one is in flight, every router call
//     (`navigate`, `openSheet`, `closeSheet`, `back`, `navigateTab`) is QUEUED and replayed, in order,
//     on that popstate. So `closeSheet(); navigate('#/task/a')` lands on the task, with Home beneath.
//     `closeSheet()`/`back()`/`navigateTab()` return a Promise that resolves once their work has landed;
//     awaiting it is optional.
//  4. Links. `start()` installs ONE capture-phase click handler: a primary-button click, with no
//     modifier keys, on a same-document `<a href="#/…">` (no `target`, no `download`) is
//     `preventDefault()`-ed and routed through `navigate(href)` — or through `navigateTab(tab)` when
//     the link carries `data-tab="<TabId>"` (BottomNav does). Prefer `<a href={href(...)}>` for links.
//  5. Hash changes the router did not make (manual URL edits, `location.hash = …`): a fresh entry is
//     stamped `idx + 1`. If it was pushed over a sheet entry, that sheet is stripped when Back lands
//     on it. If the hash of the sheet's own entry changes, the sheet is dropped.
//  6. `#/new` (the manifest shortcut) never persists: it is canonicalised to `#/` (location.search
//     kept) with a QuickAdd sheet entry pushed on top, so Home is always beneath and Back closes the
//     sheet instead of exiting the app. `router.route.name` is therefore never `'new'` at rest.
//  7. Tabs (`navigateTab`). Home is the tab root: leaving Home pushes, tab → tab replaces, and the
//     Home tab goes back to the Home entry beneath. Back from any tab lands on Home, then exits.
//     Switching tabs on a cold start (no Home beneath) slips a Home entry underneath first.
//  8. Navigating to the current URL replaces instead of stacking a duplicate entry.

import {
  ROUTE_META,
  TAB_ROUTE,
  href,
  isSheetSpec,
  matchRoute,
  type RouteMatch,
  type RouteMeta,
  type SheetSpec,
  type TabId
} from './routes';

/** Dev-only routes (`#/dev/gallery`) exist in `vite dev` and in E2E builds (VITE_E2E=1), never in production. */
export const DEV_ROUTES_ENABLED: boolean = import.meta.env.DEV || import.meta.env.VITE_E2E === '1';

/** Safety net: if a router-initiated `history.back()` produces no popstate, unblock the queue. */
const TRAVERSAL_TIMEOUT_MS = 1000;

/** What the router stores in `history.state`. Internal; read it through the router's fields. */
interface EntryState {
  idx: number;
  sheet?: SheetSpec;
  /** The entry directly beneath this one is Home (lets the Home tab go back instead of stacking). */
  overHome?: true;
  /** This entry was pushed (by a hash change) over a sheet entry; Back must not resurrect it. */
  coversSheet?: true;
}

function readEntryState(raw: unknown): EntryState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as { idx?: unknown; sheet?: unknown; overHome?: unknown; coversSheet?: unknown };
  if (typeof s.idx !== 'number' || !Number.isFinite(s.idx)) return null;
  const state: EntryState = { idx: s.idx };
  if (isSheetSpec(s.sheet)) state.sheet = s.sheet;
  if (s.overHome === true) state.overHome = true;
  if (s.coversSheet === true) state.coversSheet = true;
  return state;
}

const HOME: RouteMatch = { name: 'home', params: {}, path: '/', query: {} };

/** Normalises `'#/x'`, `'/x'` or `'x'` to `'#/x'`. */
function toHash(to: string): string {
  const path = to.startsWith('#') ? to.slice(1) : to;
  return `#${path.startsWith('/') ? path : `/${path}`}`;
}

function isTabId(value: string | undefined): value is TabId {
  return value !== undefined && Object.hasOwn(TAB_ROUTE, value);
}

export interface RouterOptions {
  /** Window to bind to (tests may pass a jsdom window). Defaults to `globalThis.window` at `start()`. */
  window?: Window;
  /** Whether dev-only routes match. Defaults to `DEV_ROUTES_ENABLED`. */
  allowDev?: boolean;
}

export interface NavigateOptions {
  /** Replace the current history entry instead of pushing a new one. */
  replace?: boolean;
}

interface PendingTraversal {
  resolve: () => void;
  timer: ReturnType<typeof setTimeout>;
}

export class Router {
  /** The current route (replaced wholesale on every navigation). */
  route = $state.raw<RouteMatch>(HOME);
  /** The open sheet, from history state. */
  sheet = $state.raw<SheetSpec | null>(null);
  /** True when `back()` would stay inside the app. */
  canGoBack = $state(false);
  /** Static metadata (tab, fab, devOnly) of the current route. */
  meta: RouteMeta = $derived(ROUTE_META[this.route.name]);

  #win: Window | null = null;
  #idx = 0;
  /** State of the current entry as last synced (null before the first sync). */
  #entry: EntryState | null = null;
  #allowDev: boolean;
  #started = false;
  #stop: (() => void) | null = null;
  #pending: PendingTraversal | null = null;
  #queue: (() => void)[] = [];

  constructor(opts: RouterOptions = {}) {
    this.#win = opts.window ?? null;
    this.#allowDev = opts.allowDev ?? DEV_ROUTES_ENABLED;
  }

  /** Binds to the window's history and link clicks. Idempotent. Returns a function that unbinds. */
  start(): () => void {
    if (this.#stop) return this.#stop;
    const win = this.#win ?? globalThis.window;
    this.#win = win;
    const onPopState = () => {
      this.#sync();
      this.#endTraversal();
    };
    const onHashChange = () => this.#sync();
    const onClick = (e: MouseEvent) => this.#onLinkClick(e);
    win.addEventListener('popstate', onPopState);
    win.addEventListener('hashchange', onHashChange);
    win.addEventListener('click', onClick, { capture: true });
    this.#sync();
    this.#started = true;
    this.#stop = () => {
      win.removeEventListener('popstate', onPopState);
      win.removeEventListener('hashchange', onHashChange);
      win.removeEventListener('click', onClick, { capture: true });
      this.#queue = [];
      this.#endTraversal();
      this.#stop = null;
    };
    return this.#stop;
  }

  /** Navigates to `'#/path'` (or `'/path'`). Build targets with `href()`/`pathFor()` from routes.ts. */
  navigate(to: string, opts: NavigateOptions = {}): void {
    const win = this.#requireWindow();
    if (this.#pending) {
      this.#queue.push(() => this.navigate(to, opts));
      return;
    }
    const url = toHash(to);
    const current = readEntryState(win.history.state);
    // A navigation from inside a sheet replaces the sheet's entry, so Back never reopens it.
    const sheetOpen = current?.sheet !== undefined;
    const sameUrl = url === win.location.hash;
    if (opts.replace || sheetOpen || sameUrl) {
      win.history.replaceState(this.#stamp(this.#idx, current?.overHome), '', url);
    } else {
      win.history.pushState(this.#stamp(this.#idx + 1, this.#onHome()), '', url);
    }
    this.#sync();
  }

  /**
   * Bottom-nav tab switch (rule 7): Back from any tab goes Home rather than walking through tabs.
   * `<a href data-tab="memory">` links call this automatically (rule 4).
   */
  navigateTab(tab: TabId): Promise<void> {
    const win = this.#requireWindow();
    if (this.#pending) return this.#defer(() => this.navigateTab(tab));
    const current = readEntryState(win.history.state);
    const sheetOpen = current?.sheet !== undefined;
    const routeName = TAB_ROUTE[tab];
    const target = href(routeName);

    // Re-selecting the current tab: close a sheet if one is open, otherwise nothing to do.
    if (this.route.name === routeName) return sheetOpen ? this.closeSheet() : Promise.resolve();
    if (tab === 'home') {
      if (!sheetOpen && current?.overHome) return this.#traverseBack();
      this.navigate(target, { replace: true });
      return Promise.resolve();
    }
    if (sheetOpen) {
      // Replace the sheet's entry; whatever is beneath it stays (Home, if it was opened over Home).
      win.history.replaceState(this.#stamp(this.#idx, current?.overHome), '', target);
    } else if (this.route.name === 'home') {
      win.history.pushState(this.#stamp(this.#idx + 1, true), '', target);
    } else if (current?.overHome) {
      win.history.replaceState(this.#stamp(this.#idx, true), '', target);
    } else {
      // Cold start on a tab (nothing beneath): slip Home underneath so Back lands there.
      win.history.replaceState(this.#stamp(this.#idx), '', '#/');
      win.history.pushState(this.#stamp(this.#idx + 1, true), '', target);
    }
    this.#sync();
    return Promise.resolve();
  }

  /** Goes back one entry if it belongs to the app; otherwise replaces with `fallback`. */
  back(fallback = '/'): Promise<void> {
    this.#requireWindow();
    if (this.#pending) return this.#defer(() => this.back(fallback));
    if (this.#idx > 0) return this.#traverseBack();
    this.navigate(fallback, { replace: true });
    return Promise.resolve();
  }

  /** Opens a sheet over the current route (pushes a history entry; replaces if a sheet is already open). */
  openSheet(spec: SheetSpec): void {
    const win = this.#requireWindow();
    if (this.#pending) {
      this.#queue.push(() => this.openSheet(spec));
      return;
    }
    const current = readEntryState(win.history.state);
    if (current?.sheet) {
      win.history.replaceState({ ...this.#stamp(this.#idx, current.overHome), sheet: spec }, '');
    } else {
      win.history.pushState({ ...this.#stamp(this.#idx + 1, this.#onHome()), sheet: spec }, '');
    }
    this.#sync();
  }

  /**
   * Closes the open sheet by popping its history entry (so the hardware Back stays in sync).
   * The UI updates immediately; the returned Promise resolves on the popstate, after any calls made
   * in the meantime have been applied (rule 3). Safe to call without awaiting, and to call twice.
   */
  closeSheet(): Promise<void> {
    const win = this.#requireWindow();
    if (this.#pending) return this.#defer(() => this.closeSheet());
    const current = readEntryState(win.history.state);
    if (!current?.sheet) {
      this.sheet = null;
      return Promise.resolve();
    }
    this.sheet = null; // immediate UI response; popstate confirms
    if (current.idx > 0) return this.#traverseBack();
    // No in-app entry beneath (should not happen, see rule 6): drop the sheet in place.
    win.history.replaceState(this.#stamp(current.idx, current.overHome), '');
    this.#sync();
    return Promise.resolve();
  }

  #requireWindow(): Window {
    if (!this.#win) this.start();
    return this.#win as Window;
  }

  #onHome(): boolean {
    return this.route.name === 'home' && !this.sheet;
  }

  #stamp(idx: number, overHome?: boolean): EntryState {
    return overHome ? { idx, overHome: true } : { idx };
  }

  /** Queues `run` until the in-flight traversal lands; resolves when `run`'s own work has landed. */
  #defer(run: () => Promise<void>): Promise<void> {
    return new Promise((resolve) => this.#queue.push(() => void run().then(resolve)));
  }

  #traverseBack(): Promise<void> {
    const win = this.#requireWindow();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.#sync();
        this.#endTraversal();
      }, TRAVERSAL_TIMEOUT_MS);
      this.#pending = { resolve, timer };
      win.history.back();
    });
  }

  /** Ends the in-flight traversal (if any) and replays queued calls until one starts a new one. */
  #endTraversal(): void {
    const pending = this.#pending;
    if (!pending) return;
    this.#pending = null;
    clearTimeout(pending.timer);
    while (!this.#pending && this.#queue.length > 0) this.#queue.shift()?.();
    pending.resolve();
  }

  #onLinkClick(e: MouseEvent): void {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    // Duck-typed (not `instanceof Element`): tests bind the router to a jsdom window.
    const origin = e.target as Element | null;
    if (!origin || typeof origin.closest !== 'function') return;
    const link = origin.closest('a[href^="#/"]');
    if (!link) return;
    const target = link.getAttribute('target');
    if ((target && target !== '_self') || link.hasAttribute('download')) return;
    const to = link.getAttribute('href');
    if (!to) return;
    e.preventDefault();
    const tab = link.getAttribute('data-tab') ?? undefined;
    if (isTabId(tab)) void this.navigateTab(tab);
    else this.navigate(to);
  }

  #sync(): void {
    const win = this.#win;
    if (!win) return;
    const prev = this.#entry;
    let state = readEntryState(win.history.state);
    if (!state) {
      // A fresh entry (initial load, manual URL edit, `location.hash = …`): stamp it (rule 5).
      state = this.#started ? this.#stamp(this.#idx + 1, this.#onHome()) : { idx: 0 };
      if (prev?.sheet) state.coversSheet = true;
      win.history.replaceState(state, '');
    }

    let match = matchRoute(win.location.hash, { allowDev: this.#allowDev });
    if (!match) {
      state = this.#stamp(state.idx, state.overHome);
      win.history.replaceState(state, '', '#/');
      match = HOME;
    }

    if (state.sheet && prev) {
      // Back landed on a sheet entry that a hash change had covered, or the sheet entry's own hash
      // changed: the sheet is stale, drop it (rule 5).
      const backOverCover = prev.coversSheet === true && state.idx === prev.idx - 1;
      const hashChangedInPlace = state.idx === prev.idx && match.path !== this.route.path;
      if (backOverCover || hashChangedInPlace) {
        state = this.#stamp(state.idx, state.overHome);
        win.history.replaceState(state, '');
      }
    }

    if (match.name === 'new') {
      // Rule 6: `#/new` → Home with a QuickAdd sheet entry on top. The relative '#/' URL keeps
      // location.search (`?demo=1`).
      win.history.replaceState(this.#stamp(state.idx, state.overHome), '', '#/');
      state = { idx: state.idx + 1, sheet: { name: 'quickAdd' }, overHome: true };
      win.history.pushState(state, '');
      match = HOME;
    }

    this.#idx = state.idx;
    this.#entry = state;
    this.route = match;
    this.sheet = state.sheet ?? null;
    this.canGoBack = state.idx > 0;
  }
}

/**
 * Removes one `location.search` param in place (`history.replaceState`, keeping the hash and the
 * history state). Step 2.4 calls `stripQueryParam('reset')` after consuming `?demo=1&reset=1`.
 */
export function stripQueryParam(name: string, win: Window = globalThis.window): void {
  const url = new URL(win.location.href);
  if (!url.searchParams.has(name)) return;
  url.searchParams.delete(name);
  win.history.replaceState(win.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

/** The app-wide router. `main.ts` calls `router.start()` before mounting. */
export const router = new Router();
