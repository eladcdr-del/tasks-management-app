// CONTRACT (Blueprint §7) — frozen in step 1.1. Request changes via the orchestrator.
//
// Hash routes (`#/task/abc`) are immune to GitHub Pages 404s and the base path.
// This module is pure (no DOM, no runes) so it can be unit-tested in Node.

/** Every route in the app. `:name` segments are params. */
export const ROUTES = {
  home: '/',
  memory: '/memory',
  jar: '/jar',
  household: '/household',
  settings: '/settings',
  task: '/task/:id',
  new: '/new', // manifest shortcut: opens QuickAdd over Home
  welcome: '/welcome',
  onboardingProfile: '/onboarding/profile',
  onboardingHousehold: '/onboarding/household',
  onboardingInstall: '/onboarding/install',
  onboardingNotifications: '/onboarding/notifications',
  join: '/join/:code',
  setup: '/setup',
  devGallery: '/dev/gallery' // dev only (see DEV_ROUTES_ENABLED)
} as const;

export type RouteName = keyof typeof ROUTES;

/** Bottom-nav tabs, in RTL order from the right. */
export type TabId = 'home' | 'memory' | 'jar' | 'household';
export const TABS: readonly TabId[] = ['home', 'memory', 'jar', 'household'];

export interface RouteMeta {
  /** Highlighted bottom-nav tab. Routes without a tab render without the bottom nav. */
  tab?: TabId;
  /** Whether App.svelte mounts the quick-add FAB (<FabHost />) on this route (Home and Memory). */
  fab: boolean;
  /** Only reachable in dev / E2E builds; tree-shaken from production. */
  devOnly?: boolean;
}

export const ROUTE_META: Readonly<Record<RouteName, RouteMeta>> = {
  home: { tab: 'home', fab: true },
  memory: { tab: 'memory', fab: true },
  jar: { tab: 'jar', fab: false },
  household: { tab: 'household', fab: false },
  settings: { fab: false },
  task: { fab: false },
  new: { tab: 'home', fab: true }, // renders Home; the router canonicalises it to #/ + QuickAdd
  welcome: { fab: false },
  onboardingProfile: { fab: false },
  onboardingHousehold: { fab: false },
  onboardingInstall: { fab: false },
  onboardingNotifications: { fab: false },
  join: { fab: false },
  setup: { fab: false },
  devGallery: { devOnly: true, fab: false }
};

/** The root route of each tab (all param-less, so `href(TAB_ROUTE[tab])` type-checks). */
export const TAB_ROUTE = {
  home: 'home',
  memory: 'memory',
  jar: 'jar',
  household: 'household'
} as const satisfies Readonly<Record<TabId, RouteName>>;

// ── Typed params ──────────────────────────────────────────────────────────────

type ParamNames<P extends string> = P extends `${string}:${infer Name}/${infer Rest}`
  ? Name | ParamNames<`/${Rest}`>
  : P extends `${string}:${infer Name}`
    ? Name
    : never;

/** `RouteParams<'task'>` → `{ id: string }`; `RouteParams<'home'>` → `{}`. */
export type RouteParams<N extends RouteName> = { [K in ParamNames<(typeof ROUTES)[N]>]: string };

/** A resolved route. Discriminated on `name`, so `params` is typed per route. */
export type RouteMatch = {
  [N in RouteName]: {
    name: N;
    params: RouteParams<N>;
    /** Normalised path without the leading `#`, e.g. `/task/abc`. */
    path: string;
    /** Query string inside the hash (`#/x?a=1`), decoded. */
    query: Readonly<Record<string, string>>;
  };
}[RouteName];

// ── Sheets ────────────────────────────────────────────────────────────────────
// Sheets are not routes. Opening one pushes a history entry ({ sheet }) so the
// Android back button closes it. Only one sheet is open at a time.

export type SheetSpec =
  | { name: 'quickAdd' }
  | { name: 'complete'; taskId: string }
  | { name: 'request'; taskId: string }
  | { name: 'snooze'; taskId: string }
  | { name: 'jarSetup' };

export type SheetName = SheetSpec['name'];

const SHEET_NAMES: readonly SheetName[] = ['quickAdd', 'complete', 'request', 'snooze', 'jarSetup'];

/** Validates an unknown value (e.g. from `history.state`) as a SheetSpec. */
export function isSheetSpec(value: unknown): value is SheetSpec {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { name?: unknown; taskId?: unknown };
  if (typeof v.name !== 'string' || !SHEET_NAMES.includes(v.name as SheetName)) return false;
  if (v.name === 'complete' || v.name === 'request' || v.name === 'snooze') {
    return typeof v.taskId === 'string' && v.taskId.length > 0;
  }
  return true;
}

// ── Parsing & matching ────────────────────────────────────────────────────────

export interface ParsedHash {
  path: string;
  query: Record<string, string>;
}

/** `'#/task/a%20b?x=1'` → `{ path: '/task/a%20b', query: { x: '1' } }`. Empty → `/`. */
export function parseHash(hash: string): ParsedHash {
  let raw = hash.startsWith('#') ? hash.slice(1) : hash;
  let queryString = '';
  const q = raw.indexOf('?');
  if (q !== -1) {
    queryString = raw.slice(q + 1);
    raw = raw.slice(0, q);
  }
  let path = raw.startsWith('/') ? raw : `/${raw}`;
  if (path.length > 1 && path.endsWith('/')) path = path.replace(/\/+$/, '') || '/';
  const query: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(queryString)) query[k] = v;
  return { path, query };
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

const ROUTE_ENTRIES = Object.entries(ROUTES) as [RouteName, string][];

export interface MatchOptions {
  /** Whether dev-only routes may match. */
  allowDev: boolean;
}

/** Matches a hash (or bare path) against the route table. `null` when nothing matches. */
export function matchRoute(hashOrPath: string, opts: MatchOptions): RouteMatch | null {
  const { path, query } = parseHash(hashOrPath);
  const parts = path.split('/').filter(Boolean);
  for (const [name, pattern] of ROUTE_ENTRIES) {
    if (ROUTE_META[name].devOnly && !opts.allowDev) continue;
    const patternParts = pattern.split('/').filter(Boolean);
    if (patternParts.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < patternParts.length; i++) {
      const p = patternParts[i] as string;
      const actual = parts[i] as string;
      if (p.startsWith(':')) {
        const value = safeDecode(actual);
        if (!value) {
          ok = false;
          break;
        }
        params[p.slice(1)] = value;
      } else if (p !== actual) {
        ok = false;
        break;
      }
    }
    if (ok) return { name, params, path, query } as RouteMatch;
  }
  return null;
}

type ParamArgs<N extends RouteName> = keyof RouteParams<N> extends never ? [] : [RouteParams<N>];

/** Builds a path (no `#`) for a route: `pathFor('task', { id: 'a' })` → `/task/a`. */
export function pathFor<N extends RouteName>(name: N, ...args: ParamArgs<N>): string {
  const params = (args[0] ?? {}) as Record<string, string>;
  const pattern: string = ROUTES[name];
  return pattern.replace(/:([A-Za-z]+)/g, (_, key: string) => {
    const value = params[key];
    if (value === undefined) throw new Error(`Missing route param "${key}" for ${name}`);
    return encodeURIComponent(value);
  });
}

/** Builds an `href` for `<a>` tags: `href('task', { id: 'a' })` → `#/task/a`. */
export function href<N extends RouteName>(name: N, ...args: ParamArgs<N>): string {
  return `#${pathFor(name, ...args)}`;
}
