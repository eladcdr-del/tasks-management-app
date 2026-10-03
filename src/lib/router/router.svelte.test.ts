// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { Router, stripQueryParam } from './router.svelte';
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
    expect(window.history.state).toMatchObject({ idx: 1 });
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

  it('#/new opens QuickAdd over Home; closing returns to #/', async () => {
    stop();
    boot('#/new');
    expect(router.route.name).toBe('home');
    expect(router.meta.tab).toBe('home');
    expect(router.sheet).toEqual({ name: 'quickAdd' });
    await router.closeSheet();
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

/** Appends `<a href>` to the body and clicks it like a user would (primary button, no modifiers). */
function clickLink(
  hrefValue: string,
  init: MouseEventInit = {},
  attrs: Record<string, string> = {}
) {
  const a = document.createElement('a');
  a.setAttribute('href', hrefValue);
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  a.textContent = 'link';
  document.body.append(a);
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
  a.dispatchEvent(event);
  a.remove();
  return event;
}

describe('Router history rules (S1–S3, tabs)', () => {
  it('S1: navigate() issued right after closeSheet() is applied, not lost', async () => {
    router.openSheet({ name: 'request', taskId: 'a' });
    await afterPopstate(() => {
      void router.closeSheet();
      router.navigate(href('task', { id: 'abc' }));
    });
    expect(router.route.name).toBe('task');
    expect(router.sheet).toBeNull();
    expect(window.location.hash).toBe('#/task/abc');

    // Home sits beneath the task (the sheet entry is gone): Back → Home, no sheet.
    await afterPopstate(() => router.back());
    expect(router.route.name).toBe('home');
    expect(router.sheet).toBeNull();
    expect(router.canGoBack).toBe(false);
  });

  it('S1: closeSheet() returns a promise that resolves on the popstate', async () => {
    router.openSheet({ name: 'snooze', taskId: 'a' });
    let popped = false;
    window.addEventListener('popstate', () => (popped = true), { once: true });
    const closed = router.closeSheet();
    expect(closed).toBeInstanceOf(Promise);
    router.navigate(href('jar'));
    await closed;
    expect(popped).toBe(true);
    expect(router.route.name).toBe('jar');
    expect(router.sheet).toBeNull();
  });

  it('S1: a second closeSheet() while the first is pending does not go back twice', async () => {
    router.navigate(href('memory'));
    router.openSheet({ name: 'quickAdd' });
    await Promise.all([router.closeSheet(), router.closeSheet()]);
    expect(router.route.name).toBe('memory');
    expect(router.sheet).toBeNull();
  });

  it('S2: an <a href="#/…"> click while a sheet is open replaces the sheet entry', async () => {
    router.openSheet({ name: 'complete', taskId: 'a' });
    const event = clickLink('#/memory');
    expect(event.defaultPrevented).toBe(true);
    expect(router.route.name).toBe('memory');
    expect(router.sheet).toBeNull();

    await afterPopstate(() => window.history.back()); // Android back button
    expect(router.route.name).toBe('home');
    expect(router.sheet).toBeNull();
  });

  it('S2: link clicks without a sheet push (Back returns)', async () => {
    clickLink('#/task/t1');
    expect(router.route.name).toBe('task');
    expect(router.canGoBack).toBe(true);
    await afterPopstate(() => window.history.back());
    expect(router.route.name).toBe('home');
  });

  it('S2: modified, targeted and download clicks are left to the browser', () => {
    const seen: boolean[] = [];
    const record = (e: Event) => {
      seen.push(e.defaultPrevented);
      e.preventDefault(); // keep jsdom from following the link
    };
    document.addEventListener('click', record);
    try {
      clickLink('#/jar', { ctrlKey: true });
      clickLink('#/jar', { metaKey: true });
      clickLink('#/jar', { shiftKey: true });
      clickLink('#/jar', { button: 1 });
      clickLink('#/jar', {}, { target: '_blank' });
      clickLink('#/jar', {}, { download: '' });
      clickLink('https://example.com/#/jar');
    } finally {
      document.removeEventListener('click', record);
    }
    expect(seen).toEqual([false, false, false, false, false, false, false]);
    expect(router.route.name).toBe('home');
  });

  it('S2: a hash change that lands over a sheet entry never resurrects the sheet on Back', async () => {
    router.openSheet({ name: 'snooze', taskId: 'a' });
    // An unintercepted hash change (e.g. code setting location.hash) pushes a fresh entry.
    await new Promise<void>((resolve) => {
      window.addEventListener('hashchange', () => resolve(), { once: true });
      window.location.hash = '#/jar';
    });
    expect(router.route.name).toBe('jar');
    expect(router.sheet).toBeNull();

    await afterPopstate(() => window.history.back());
    expect(router.route.name).toBe('home');
    expect(router.sheet).toBeNull();
  });

  it('S2: a new route arriving on the sheet entry itself drops the sheet', () => {
    router.openSheet({ name: 'quickAdd' });
    window.history.replaceState(window.history.state, '', '#/memory');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(router.route.name).toBe('memory');
    expect(router.sheet).toBeNull();
    expect((window.history.state as { sheet?: unknown }).sheet).toBeUndefined();
  });

  it('S3: cold start on #/new puts Home beneath QuickAdd (Back closes the sheet, not the app)', async () => {
    stop();
    boot('#/new');
    expect(router.route.name).toBe('home');
    expect(router.sheet).toEqual({ name: 'quickAdd' });
    expect(window.location.hash).toBe('#/');
    expect(router.canGoBack).toBe(true);

    await afterPopstate(() => window.history.back());
    expect(router.route.name).toBe('home');
    expect(router.sheet).toBeNull();
    expect(router.canGoBack).toBe(false);
    expect(window.location.hash).toBe('#/');
  });

  it('S3: #/new keeps location.search (?demo=1)', () => {
    stop();
    window.history.replaceState(null, '', '/?demo=1#/new');
    router = new Router({ window, allowDev: false });
    stop = router.start();
    expect(window.location.search).toBe('?demo=1');
    expect(window.location.hash).toBe('#/');
    expect(router.sheet).toEqual({ name: 'quickAdd' });
  });

  it('S3: navigate() from the #/new QuickAdd replaces it', async () => {
    stop();
    boot('#/new');
    router.navigate(href('task', { id: 't' }));
    expect(router.route.name).toBe('task');
    expect(router.sheet).toBeNull();

    await afterPopstate(() => router.back());
    expect(router.route.name).toBe('home');
    expect(router.sheet).toBeNull();
    expect(router.canGoBack).toBe(false);
  });

  it('S3: navigating to #/new from another route opens QuickAdd over Home', async () => {
    router.navigate(href('memory'));
    router.navigate(href('new'));
    expect(router.route.name).toBe('home');
    expect(router.sheet).toEqual({ name: 'quickAdd' });
    await afterPopstate(() => window.history.back());
    expect(router.route.name).toBe('home');
    expect(router.sheet).toBeNull();
  });

  it('tabs: leaving Home pushes, tab → tab replaces, so Back goes Home', async () => {
    await router.navigateTab('memory');
    await router.navigateTab('jar');
    await router.navigateTab('household');
    expect(router.route.name).toBe('household');
    expect(router.canGoBack).toBe(true);

    await afterPopstate(() => window.history.back());
    expect(router.route.name).toBe('home');
    expect(router.canGoBack).toBe(false);
  });

  it('tabs: the Home tab returns to the Home entry beneath (no duplicate Home)', async () => {
    await router.navigateTab('memory');
    await router.navigateTab('home');
    expect(router.route.name).toBe('home');
    expect(router.canGoBack).toBe(false);
  });

  it('tabs: a cold start on a tab still has Home beneath after switching tabs', async () => {
    stop();
    boot('#/memory');
    await router.navigateTab('jar');
    expect(router.route.name).toBe('jar');
    await afterPopstate(() => window.history.back());
    expect(router.route.name).toBe('home');
    expect(router.canGoBack).toBe(false);
  });

  it('tabs: re-selecting the current tab is a no-op', async () => {
    await router.navigateTab('memory');
    const before = window.history.length;
    await router.navigateTab('memory');
    expect(window.history.length).toBe(before);
    expect(router.route.name).toBe('memory');
  });

  it('tabs: <a data-tab> links take the tab path', async () => {
    clickLink('#/memory', {}, { 'data-tab': 'memory' });
    clickLink('#/jar', {}, { 'data-tab': 'jar' });
    expect(router.route.name).toBe('jar');
    await afterPopstate(() => window.history.back());
    expect(router.route.name).toBe('home');
  });
});

describe('stripQueryParam', () => {
  it('removes one search param, keeping the others, the hash and history.state', () => {
    window.history.replaceState({ idx: 3 }, '', '/?demo=1&reset=1#/task/x');
    stripQueryParam('reset', window);
    expect(window.location.search).toBe('?demo=1');
    expect(window.location.hash).toBe('#/task/x');
    expect(window.history.state).toEqual({ idx: 3 });
    stripQueryParam('demo', window);
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#/task/x');
  });

  it('is a no-op when the param is absent', () => {
    window.history.replaceState({ idx: 0 }, '', '/?demo=1#/');
    const before = window.location.href;
    stripQueryParam('reset', window);
    expect(window.location.href).toBe(before);
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
