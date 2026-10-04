import { describe, expect, it } from 'vitest';
import { ROUTES, type RouteName } from '$lib/router/routes';
import { routeAllowed as legacyAllowed } from '$lib/state/session.svelte';
import { gateTarget, routeAllowed } from './gate';

const ALL = Object.keys(ROUTES) as RouteName[];

describe('access-based gating', () => {
  it('matches the 2.4 behaviour except that later onboarding steps open before a household', () => {
    for (const phase of ['booting', 'setup', 'signed-out', 'no-household', 'ready'] as const) {
      for (const route of ALL) {
        const relaxed =
          phase === 'no-household' &&
          (route === 'onboardingInstall' || route === 'onboardingNotifications');
        if (relaxed) expect(routeAllowed(phase, route)).toBe(true);
        else
          expect(routeAllowed(phase, route), `${phase} ${route}`).toBe(legacyAllowed(phase, route));
      }
    }
  });

  it('sends each phase to its home', () => {
    expect(gateTarget('setup', 'home')).toBe('#/setup');
    expect(gateTarget('signed-out', 'join')).toBe('#/welcome');
    expect(gateTarget('no-household', 'home')).toBe('#/onboarding/household');
    expect(gateTarget('no-household', 'home', 'Abc 1')).toBe('#/join/Abc%201');
    expect(gateTarget('ready', 'welcome')).toBe('#/');
    expect(gateTarget('ready', 'onboardingHousehold')).toBe('#/');
    expect(gateTarget('ready', 'onboardingInstall')).toBeNull();
    expect(gateTarget('booting', 'home')).toBeNull();
  });
});
