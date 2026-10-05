// @vitest-environment jsdom
// TaskCard while choosing several tasks (feature "seat", B1), on the demo seed signed in as מיכל:
// a long press starts it with this card chosen (and its click neither opens the task nor
// un-chooses it); while it is on, a square checkbox replaces the completion circle, a tap
// anywhere toggles the card, and the link, the answers and the swipe step aside.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet, flushSync } from 'svelte';
import { createDemoRepository, type DemoRepository } from '$lib/data/demo/demoRepository';
import { DEMO_HOUSEHOLD_ID as HID, MICHAL } from '$lib/data/demo/seed';
import type { Task } from '$lib/domain/types';
import { household } from '$lib/state/household.svelte';
import { tasks } from '$lib/state/tasks.svelte';

vi.hoisted(() => {
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {}
    }) as unknown as MediaQueryList;
});

import TaskCard from './TaskCard.svelte';
import { LONG_PRESS_MS, type RowSelection } from './selection';
import { HomeSelection } from '../../screens/Home/selection.svelte';

let repo: DemoRepository;
let selection: HomeSelection;
const settle = async () => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
  flushSync();
};
const task = (id: string) => tasks.byId(id)!;
const article = () => document.querySelector('article')!;
const pick = () => screen.queryByRole('checkbox', { name: 'לקנות נורות לסלון' });

const answers = createRawSnippet((t: () => Task) => ({
  render: () => `<button type="button" data-answer>${t().id}</button>`
}));

beforeEach(async () => {
  repo = await createDemoRepository({ persistence: 'none' });
  household.attach({ repo, householdId: HID });
  tasks.attach({ repo, householdId: HID });
  repo.actAs(MICHAL);
  household.uid = MICHAL;
  tasks.setUser(MICHAL);
  await settle();
  selection = new HomeSelection();
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  tasks.detach();
  household.detach();
  await repo.dispose();
});

describe('TaskCard selection', () => {
  it('outside the mode: the completion circle and the link, as always', () => {
    render(TaskCard, { task: task('seed-bulbs'), variant: 'row', selection });
    expect(screen.getByRole('checkbox', { name: 'סימון כבוצעה: לקנות נורות לסלון' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'לקנות נורות לסלון' })).toBeTruthy();
    expect(document.querySelector('[data-selected]')).toBeNull();
  });

  it('while choosing: a checkbox in the circle’s place; a tap toggles; the link steps aside', async () => {
    selection.start();
    render(TaskCard, {
      task: task('seed-bulbs'),
      variant: 'row',
      selection,
      actions: answers
    });
    expect(screen.queryByRole('checkbox', { name: /סימון כבוצעה/ })).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(document.querySelector('[data-answer]')).toBeNull();
    const box = pick()!;
    expect(box.getAttribute('aria-checked')).toBe('false');
    expect(document.querySelector('[data-selected]')?.getAttribute('data-selected')).toBe('false');

    await fireEvent.click(box);
    flushSync();
    expect(selection.has('seed-bulbs')).toBe(true);
    expect(box.getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('[data-selected="true"]')).toBeTruthy();
    await fireEvent.click(box);
    flushSync();
    expect(selection.has('seed-bulbs')).toBe(false);
  });

  it('a long press starts choosing with this card chosen; its click changes nothing more', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    render(TaskCard, { task: task('seed-bulbs'), variant: 'row', selection });
    const opts = { pointerId: 7, clientX: 100, clientY: 20, pointerType: 'touch', button: 0 };
    await fireEvent.pointerDown(article(), opts);
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(selection.active).toBe(false);
    vi.advanceTimersByTime(1);
    flushSync();
    expect(selection.active).toBe(true);
    expect([...selection.ids]).toEqual(['seed-bulbs']);
    // The press ends: the click it makes is swallowed (it would un-choose the card).
    await fireEvent.pointerUp(article(), opts);
    await fireEvent.click(pick()!);
    flushSync();
    expect(selection.has('seed-bulbs')).toBe(true);
    // Android's link menu stays away from a press that chose the card.
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    article().dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
  });

  it('a press that moves (a scroll) or ends early starts nothing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    render(TaskCard, { task: task('seed-bulbs'), variant: 'row', selection });
    const at = { pointerId: 3, clientX: 100, clientY: 20, pointerType: 'touch', button: 0 };
    await fireEvent.pointerDown(article(), at);
    await fireEvent.pointerMove(article(), { ...at, clientY: 40 });
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(selection.active).toBe(false);

    await fireEvent.pointerDown(article(), at);
    await fireEvent.pointerUp(article(), at);
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(selection.active).toBe(false);
  });

  it('a selection that is not active only listens for the long press', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const stub: RowSelection = { active: false, has: () => false, toggle: vi.fn(), begin: vi.fn() };
    render(TaskCard, { task: task('seed-bulbs'), variant: 'row', selection: stub });
    // A press on the completion circle is the circle's, not a long press.
    const circle = screen.getByRole('checkbox', { name: /סימון כבוצעה/ });
    await fireEvent.pointerDown(circle, { pointerId: 1, clientX: 1, clientY: 1, button: 0 });
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(stub.begin).not.toHaveBeenCalled();
    await fireEvent.pointerDown(article(), { pointerId: 2, clientX: 1, clientY: 1, button: 0 });
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(stub.begin).toHaveBeenCalledWith('seed-bulbs');
    expect(pick()).toBeNull();
  });
});
