// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { Router } from './router.svelte';
import { href } from './routes';
import RouteProbe from './__fixtures__/RouteProbe.svelte';

/** Runs `action` and resolves after the resulting popstate has been handled. */
function afterPopstate(action: () => void): Promise<void> {
  return new Promise((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true });
    action();
  });
}

let router: Router;
let stop: () => void;

function boot(hash = '#/'): void {
  window.history.replaceState(null, '', hash);
  router = new Router({ window, allowDev: false });
  stop = router.start();
}

beforeEach(() => boot());
afterEach(() => stop());

describe('Router', () => {
  it('resolves the initial hash and stamps the first entry', () => {
    stop();
    boot('#/task/t1');
    expect(router.route.name).toBe('task');
    expect(router.route.name === 'task' && router.route.params.id).toBe('t1');
    expect(router.canGoBack).toBe(false);
    expect(window.history.state).toEqual({ idx: 0 });
  });

  it('navigates with pushState and goes back via popstate', async () => {
    router.navigate(href('memory'));
    expect(router.route.name).toBe('memory');
    expect(router.meta.tab).toBe('memory');
    expect(router.canGoBack).toBe(true);
    expect(window.location.hash).toBe('#/memory');

    await afterPopstate(() => router.back());
    expect(router.route.name).toBe('home');
    expect(router.canGoBack).toBe(false);
  });

  it('back() with no in-app history replaces with the fallback', () => {
    stop();
    boot('#/settings');
    router.back('/household');
    expect(router.route.name).toBe('household');
    expect(router.canGoBack).toBe(false);
  });

  it('redirects unknown and dev-only routes to home', () => {
    stop();
    boot('#/does-not-exist');
    expect(router.route.name).toBe('home');
    expect(window.location.hash).toBe('#/');
    stop();
    boot('#/dev/gallery');
    expect(router.route.name).toBe('home');
  });

  it('follows <a href="#/..."> style hash changes and stamps them', async () => {
    await new Promise<void>((resolve) => {
      window.addEventListener('hashchange', () => resolve(), { once: true });
      window.location.hash = '#/jar';
    });
    expect(router.route.name).toBe('jar');
    expect(router.canGoBack).toBe(true);
    expect(window.history.state).toEqual({ idx: 1 });
  });

  it('opens a sheet as a history entry that hardware Back closes', async () => {
    router.openSheet({ name: 'snooze', taskId: 't9' });
    expect(router.sheet).toEqual({ name: 'snooze', taskId: 't9' });
    expect(router.route.name).toBe('home');

    await afterPopstate(() => window.history.back()); // Android back button
    expect(router.sheet).toBeNull();
    expect(router.route.name).toBe('home');
  });

  it('closeSheet() pops the sheet entry', async () => {
    router.openSheet({ name: 'quickAdd' });
    await afterPopstate(() => router.closeSheet());
    expect(router.sheet).toBeNull();
    expect(window.history.state).toEqual({ idx: 0 });
  });

  it('replaces (not stacks) when a second sheet opens', async () => {
    router.openSheet({ name: 'complete', taskId: 'a' });
    router.openSheet({ name: 'jarSetup' });
    expect(router.sheet).toEqual({ name: 'jarSetup' });
    await afterPopstate(() => window.history.back());
    expect(router.sheet).toBeNull();
  });

  it('navigating from inside a sheet replaces the sheet entry', async () => {
    router.openSheet({ name: 'request', taskId: 'a' });
    router.navigate(href('task', { id: 'a' }));
    expect(router.route.name).toBe('task');
    expect(router.sheet).toBeNull();
    await afterPopstate(() => router.back());
    expect(router.route.name).toBe('home');
    expect(router.sheet).toBeNull();
  });

  it('#/new opens QuickAdd over Home; closing returns to #/', () => {
    stop();
    boot('#/new');
    expect(router.route.name).toBe('new');
    expect(router.meta.tab).toBe('home');
    expect(router.sheet).toEqual({ name: 'quickAdd' });
    router.closeSheet();
    expect(router.route.name).toBe('home');
    expect(router.sheet).toBeNull();
    expect(window.location.hash).toBe('#/');
  });

  it('keeps location.search (e.g. ?demo=1) across navigations', () => {
    stop();
    window.history.replaceState(null, '', '/?demo=1#/');
    router = new Router({ window, allowDev: false });
    stop = router.start();
    router.navigate('/jar');
    expect(window.location.search).toBe('?demo=1');
    expect(window.location.hash).toBe('#/jar');
  });
});

describe('Router + component reactivity', () => {
  it('re-renders components that read router state', () => {
    render(RouteProbe, { props: { router } });
    expect(screen.getByTestId('route')).toHaveTextContent('home');
    expect(screen.getByTestId('tab')).toHaveTextContent('home');

    router.navigate(href('task', { id: 'x' }));
    flushSync();
    expect(screen.getByTestId('route')).toHaveTextContent('task');
    expect(screen.getByTestId('tab')).toHaveTextContent('none');

    router.openSheet({ name: 'snooze', taskId: 'x' });
    flushSync();
    expect(screen.getByTestId('sheet')).toHaveTextContent('snooze');
  });
});
