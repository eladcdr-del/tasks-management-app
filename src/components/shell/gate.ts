// owner: step 3.1. Boot gating from ROUTE_META[name].access (Blueprint §3 router amendment),
// instead of per-phase route lists. Pure, so it is unit-tested (gate.test.ts).
//
//   phase          may render
//   booting        nothing (splash)
//   setup          #/setup only
//   signed-out     #/welcome only (a #/join link is kept for after sign-in by App.svelte)
//   no-household   'auth' routes (onboarding) and #/join
//   ready          'auth' and 'household' routes, except the profile and household-creating
//                  steps (my details are edited on #/household from then on)
//   any phase      dev-only routes (the gallery)
//
// A disallowed route goes to the phase's home: setup → #/setup, signed-out → #/welcome,
// no-household → #/join/<pending code> or #/onboarding/household, ready → #/.

import { ROUTE_META, type RouteName } from '$lib/router/routes';
import type { Phase } from '$lib/state/session.svelte';

export function routeAllowed(phase: Phase, route: RouteName): boolean {
  const meta = ROUTE_META[route];
  if (phase === 'booting') return false;
  if (meta.devOnly) return true;
  switch (phase) {
    case 'setup':
      return route === 'setup';
    case 'signed-out':
      return route === 'welcome';
    case 'no-household':
      return meta.access === 'auth' || route === 'join';
    case 'ready':
      return (
        meta.access !== 'public' && route !== 'onboardingHousehold' && route !== 'onboardingProfile'
      );
  }
}

/** Where a disallowed route goes (for a replace navigation), or null when it may stay. */
export function gateTarget(
  phase: Phase,
  route: RouteName,
  pendingInvite: string | null = null
): string | null {
  if (phase === 'booting' || routeAllowed(phase, route)) return null;
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
