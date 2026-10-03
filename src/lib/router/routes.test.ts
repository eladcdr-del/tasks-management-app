import { describe, expect, it } from 'vitest';
import { ROUTES, href, isSheetSpec, matchRoute, parseHash, pathFor } from './routes';

const prod = { allowDev: false };
const dev = { allowDev: true };

describe('parseHash', () => {
  it('normalises empty and slash-less hashes to paths', () => {
    expect(parseHash('')).toEqual({ path: '/', query: {} });
    expect(parseHash('#')).toEqual({ path: '/', query: {} });
    expect(parseHash('#/')).toEqual({ path: '/', query: {} });
    expect(parseHash('#memory')).toEqual({ path: '/memory', query: {} });
    expect(parseHash('#/memory/')).toEqual({ path: '/memory', query: {} });
  });

  it('splits a query string inside the hash', () => {
    expect(parseHash('#/jar?from=home&x=%D7%90')).toEqual({
      path: '/jar',
      query: { from: 'home', x: 'א' }
    });
  });
});

describe('matchRoute', () => {
  it('matches #/task/:id with a typed id param', () => {
    const m = matchRoute('#/task/abc123', prod);
    expect(m?.name).toBe('task');
    if (m?.name !== 'task') throw new Error('expected task route');
    expect(m.params.id).toBe('abc123');
    expect(m.path).toBe('/task/abc123');
  });

  it('decodes params', () => {
    const m = matchRoute('#/task/series__2026-10-31', prod);
    expect(m?.name === 'task' && m.params.id).toBe('series__2026-10-31');
    const enc = matchRoute(`#${pathFor('task', { id: 'a b/ג' })}`, prod);
    expect(enc?.name === 'task' && enc.params.id).toBe('a b/ג');
  });

  it('matches #/join/:code with a 24-char invite code', () => {
    const code = 'Ab3dEf6hIj9kLm2nOp5qRs8t';
    const m = matchRoute(`#/join/${code}`, prod);
    expect(m?.name).toBe('join');
    if (m?.name !== 'join') throw new Error('expected join route');
    expect(m.params.code).toBe(code);
  });

  it('matches every static route in the table', () => {
    const expected: [string, string][] = [
      ['#/', 'home'],
      ['#/memory', 'memory'],
      ['#/jar', 'jar'],
      ['#/household', 'household'],
      ['#/settings', 'settings'],
      ['#/new', 'new'],
      ['#/welcome', 'welcome'],
      ['#/onboarding/profile', 'onboardingProfile'],
      ['#/onboarding/household', 'onboardingHousehold'],
      ['#/onboarding/install', 'onboardingInstall'],
      ['#/onboarding/notifications', 'onboardingNotifications'],
      ['#/setup', 'setup']
    ];
    for (const [hash, name] of expected) expect(matchRoute(hash, prod)?.name, hash).toBe(name);
  });

  it('rejects unknown paths, missing params and extra segments', () => {
    expect(matchRoute('#/nope', prod)).toBeNull();
    expect(matchRoute('#/task', prod)).toBeNull();
    expect(matchRoute('#/task/a/b', prod)).toBeNull();
    expect(matchRoute('#/join/', prod)).toBeNull();
  });

  it('only matches the dev gallery when dev routes are allowed', () => {
    expect(matchRoute('#/dev/gallery', prod)).toBeNull();
    expect(matchRoute('#/dev/gallery', dev)?.name).toBe('devGallery');
  });

  it('keeps the hash query on the match', () => {
    expect(matchRoute('#/memory?q=מצבר', prod)?.query).toEqual({ q: 'מצבר' });
  });
});

describe('href / pathFor', () => {
  it('builds hrefs that round-trip through matchRoute', () => {
    expect(href('home')).toBe('#/');
    expect(href('task', { id: 'x1' })).toBe('#/task/x1');
    expect(href('join', { code: 'abc' })).toBe('#/join/abc');
    for (const name of Object.keys(ROUTES) as (keyof typeof ROUTES)[]) {
      const path = ROUTES[name].replace(/:([A-Za-z]+)/g, 'p');
      expect(matchRoute(path, dev)?.name, name).toBe(name);
    }
  });
});

describe('isSheetSpec', () => {
  it('accepts valid sheet specs and rejects junk', () => {
    expect(isSheetSpec({ name: 'quickAdd' })).toBe(true);
    expect(isSheetSpec({ name: 'snooze', taskId: 't1' })).toBe(true);
    expect(isSheetSpec({ name: 'snooze' })).toBe(false);
    expect(isSheetSpec({ name: 'complete', taskId: '' })).toBe(false);
    expect(isSheetSpec({ name: 'other' })).toBe(false);
    expect(isSheetSpec(null)).toBe(false);
    expect(isSheetSpec('quickAdd')).toBe(false);
  });
});
