// CONTRACT (Blueprint §1/§7) — frozen in step 1.1. Request changes via the orchestrator.
//
// Tiny hash router built on Svelte 5 runes.
// - Routes live in the hash (`#/task/abc`); `location.search` (e.g. `?demo=1`) is preserved.
// - Every history entry is stamped with `{ idx }` so `back()` knows whether an in-app entry exists.
// - Sheets push their own history entry (`{ idx, sheet }`) so the Android back button closes them.
//
// Usage:
//   import { router } from '$lib/router/router.svelte';
//   router.route.name / router.route.params / router.meta.tab / router.sheet
//   router.navigate(href('task', { id }))   router.back()
//   router.openSheet({ name: 'snooze', taskId })   router.closeSheet()

import {
  ROUTE_META,
  isSheetSpec,
  matchRoute,
  type RouteMatch,
  type RouteMeta,
  type SheetSpec
} from './routes';

/** Dev-only routes (`#/dev/gallery`) exist in `vite dev` and in E2E builds (VITE_E2E=1), never in production. */
export const DEV_ROUTES_ENABLED: boolean = import.meta.env.DEV || import.meta.env.VITE_E2E === '1';

interface EntryState {
  idx: number;
  sheet?: SheetSpec;
}

function readEntryState(raw: unknown): EntryState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as { idx?: unknown; sheet?: unknown };
  if (typeof s.idx !== 'number' || !Number.isFinite(s.idx)) return null;
  return isSheetSpec(s.sheet) ? { idx: s.idx, sheet: s.sheet } : { idx: s.idx };
}

const HOME: RouteMatch = { name: 'home', params: {}, path: '/', query: {} };

/** Normalises `'#/x'`, `'/x'` or `'x'` to `'#/x'`. */
function toHash(to: string): string {
  const path = to.startsWith('#') ? to.slice(1) : to;
  return `#${path.startsWith('/') ? path : `/${path}`}`;
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

export class Router {
  /** The current route (replaced wholesale on every navigation). */
  route = $state.raw<RouteMatch>(HOME);
  /** The open sheet, from history state — or implied by `#/new` (QuickAdd over Home). */
  sheet = $state.raw<SheetSpec | null>(null);
  /** True when `back()` would stay inside the app. */
  canGoBack = $state(false);
  /** Static metadata (tab, devOnly) of the current route. */
  meta: RouteMeta = $derived(ROUTE_META[this.route.name]);

  #win: Window | null = null;
  #idx = 0;
  #allowDev: boolean;
  #started = false;
  #stop: (() => void) | null = null;

  constructor(opts: RouterOptions = {}) {
    this.#win = opts.window ?? null;
    this.#allowDev = opts.allowDev ?? DEV_ROUTES_ENABLED;
  }

  /** Binds to the window's history. Idempotent. Returns a function that unbinds. */
  start(): () => void {
    if (this.#stop) return this.#stop;
    const win = this.#win ?? globalThis.window;
    this.#win = win;
    const onChange = () => this.#sync();
    win.addEventListener('popstate', onChange);
    win.addEventListener('hashchange', onChange);
    this.#sync();
    this.#started = true;
    this.#stop = () => {
      win.removeEventListener('popstate', onChange);
      win.removeEventListener('hashchange', onChange);
      this.#stop = null;
    };
    return this.#stop;
  }

  /** Navigates to `'#/path'` (or `'/path'`). Build targets with `href()`/`pathFor()` from routes.ts. */
  navigate(to: string, opts: NavigateOptions = {}): void {
    const win = this.#requireWindow();
    const url = toHash(to);
    // A navigation from inside a sheet replaces the sheet's entry, so Back never reopens it.
    const sheetOpen = readEntryState(win.history.state)?.sheet !== undefined;
    if (opts.replace || sheetOpen) win.history.replaceState({ idx: this.#idx }, '', url);
    else win.history.pushState({ idx: this.#idx + 1 }, '', url);
    this.#sync();
  }

  /** Goes back one entry if it belongs to the app; otherwise replaces with `fallback`. */
  back(fallback = '/'): void {
    const win = this.#requireWindow();
    if (this.#idx > 0) win.history.back();
    else this.navigate(fallback, { replace: true });
  }

  /** Opens a sheet over the current route (pushes a history entry; replaces if a sheet is already open). */
  openSheet(spec: SheetSpec): void {
    const win = this.#requireWindow();
    const current = readEntryState(win.history.state);
    if (current?.sheet) win.history.replaceState({ idx: this.#idx, sheet: spec }, '');
    else win.history.pushState({ idx: this.#idx + 1, sheet: spec }, '');
    this.#sync();
  }

  /** Closes the open sheet (pops its history entry, so the hardware Back stays in sync). */
  closeSheet(): void {
    const win = this.#requireWindow();
    if (readEntryState(win.history.state)?.sheet) {
      this.sheet = null; // immediate UI response; popstate will confirm
      win.history.back();
    } else if (this.route.name === 'new') {
      this.navigate('/', { replace: true });
    } else {
      this.sheet = null;
    }
  }

  #requireWindow(): Window {
    if (!this.#win) this.start();
    return this.#win as Window;
  }

  #sync(): void {
    const win = this.#win;
    if (!win) return;
    let state = readEntryState(win.history.state);
    if (!state) {
      // A fresh entry (initial load, <a href="#/..."> click, manual URL edit): stamp it.
      state = { idx: this.#started ? this.#idx + 1 : 0 };
      win.history.replaceState(state, '');
    }
    this.#idx = state.idx;

    let match = matchRoute(win.location.hash, { allowDev: this.#allowDev });
    if (!match) {
      win.history.replaceState({ idx: state.idx }, '', '#/');
      match = HOME;
    }
    this.route = match;
    this.sheet = state.sheet ?? (match.name === 'new' ? { name: 'quickAdd' } : null);
    this.canGoBack = state.idx > 0;
  }
}

/** The app-wide router. `main.ts` calls `router.start()` before mounting. */
export const router = new Router();
