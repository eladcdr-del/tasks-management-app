// @vitest-environment jsdom
// Home's list and its rows (feature "home") on the demo seed, signed in as מיכל: a short list is
// flat; a long one folds into category groups of three with "עוד N" (homeView.expanded keeps a
// group open, homeView.fresh keeps just-added tasks in sight); rows carry the request on their
// meta line (the seat at the end of a row has its own tests: components/task/Seat.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet, flushSync } from 'svelte';
import { createDemoRepository, type DemoRepository } from '$lib/data/demo/demoRepository';
import { DANI, DEMO_HOUSEHOLD_ID as HID, MICHAL } from '$lib/data/demo/seed';
import type { Task } from '$lib/domain/types';
import { household } from '$lib/state/household.svelte';
import { tasks } from '$lib/state/tasks.svelte';
import { ui } from '$lib/state/ui.svelte';

// Svelte's motion helpers (pulled in through '$components/ui') read prefers-reduced-motion on import;
// rows fade in and out (Web Animations), which jsdom lacks: a finished stand-in.
vi.hoisted(() => {
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {}
    }) as unknown as MediaQueryList;
  Element.prototype.getAnimations ??= () => [];
  Element.prototype.animate ??= function () {
    const animation = {
      onfinish: null as null | (() => void),
      cancel: () => {},
      finished: Promise.resolve()
    };
    setTimeout(() => animation.onfinish?.(), 0);
    return animation as unknown as Animation;
  };
});

import HomeList from './HomeList.svelte';
import { homeView } from './homeView.svelte';
import TaskCard from '$components/task/TaskCard.svelte';

let repo: DemoRepository;
const settle = async () => {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
  flushSync();
};

async function as(uid: string) {
  repo.actAs(uid);
  household.uid = uid;
  tasks.setUser(uid);
  await settle();
}

const task = (id: string) => tasks.byId(id)!;
const shownIds = (root: ParentNode = document) =>
  [...root.querySelectorAll<HTMLElement>('[data-task-id]')].map((e) => e.dataset.taskId);
const groupEl = (key: string) => document.querySelector<HTMLElement>(`[data-group="${key}"]`)!;

/** `n` free household chores in `categoryId`, created now (newest last). */
async function chores(n: number, categoryId: Task['categoryId']): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = tasks.create({ title: `מטלה ${categoryId ?? 'ללא'} ${i + 1}`, categoryId });
    if (id) ids.push(id);
  }
  await settle();
  return ids;
}

beforeEach(async () => {
  repo = await createDemoRepository({ persistence: 'none' });
  household.attach({ repo, householdId: HID });
  tasks.attach({ repo, householdId: HID });
  ui.queue = [];
  homeView.expanded = [];
  homeView.fresh = [];
  await as(MICHAL);
});

afterEach(async () => {
  cleanup();
  tasks.detach();
  household.detach();
  await repo.dispose();
});

describe('HomeList', () => {
  it('six tasks or fewer: one flat list of rows, categories on the rows', () => {
    const list = tasks.groups.today;
    render(HomeList, { tasks: list, label: 'היום' });
    expect(document.querySelector('[data-group]')).toBeNull();
    expect(screen.getByRole('list', { name: 'היום' })).toBeTruthy();
    expect(shownIds()).toEqual(list.map((t) => t.id));
    expect(document.querySelectorAll('[data-variant="row"]')).toHaveLength(list.length);
    expect(screen.getByRole('list', { name: 'היום' }).textContent).toContain('קניות');
  });

  it('more: category groups in table order, three each, "עוד N" opens and folds a group', async () => {
    await chores(5, 'home');
    await chores(2, null);
    const list = [...tasks.groups.later];
    expect(list.length).toBeGreaterThan(6);
    render(HomeList, { tasks: list, label: 'בהמשך' });

    const keys = [...document.querySelectorAll<HTMLElement>('[data-group]')].map(
      (e) => e.dataset.group
    );
    expect(keys).toEqual(['car', 'home', 'finance', 'misc']);
    const home = groupEl('home');
    expect(within(home).getByRole('heading', { level: 3 }).textContent).toMatch(/בית ותיקונים\s*7/);
    expect(within(groupEl('misc')).getByRole('heading', { level: 3 }).textContent).toMatch(
      /שונות\s*2/
    );
    // The group names the category, so its rows do not repeat it.
    expect(within(home).getByRole('list').textContent).not.toContain('בית');

    expect(shownIds(home)).toHaveLength(3);
    const more = within(home).getByRole('button', { name: 'עוד 4 משימות ב"בית ותיקונים"' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(more.getAttribute('aria-controls')!)).toBe(
      within(home).getByRole('list')
    );
    await fireEvent.click(more);
    flushSync();
    expect(homeView.expanded).toEqual(['home']);
    expect(shownIds(groupEl('home'))).toHaveLength(7);
    const less = within(groupEl('home')).getByRole('button', {
      name: 'פחות משימות ב"בית ותיקונים"'
    });
    expect(less.getAttribute('aria-expanded')).toBe('true');
    await fireEvent.click(less);
    await settle();
    expect(homeView.expanded).toEqual([]);
  });

  it('keeps just-added tasks in sight inside a folded group', async () => {
    const ids = await chores(6, 'home');
    homeView.fresh = [ids[5]!];
    render(HomeList, { tasks: [...tasks.groups.later], label: 'בהמשך' });
    const home = groupEl('home');
    expect(shownIds(home)).toHaveLength(4);
    expect(shownIds(home)).toContain(ids[5]);
    expect(within(home).getByRole('button', { name: /^עוד 4/ })).toBeTruthy();
  });

  it('a group opened earlier in the session renders open', async () => {
    await chores(6, 'home');
    homeView.expanded = ['home'];
    render(HomeList, { tasks: [...tasks.groups.later], label: 'בהמשך' });
    expect(shownIds(groupEl('home'))).toHaveLength(8);
  });
});

describe('TaskCard row', () => {
  it('keeps the request on its meta line: who asked first, when it waits for my answer', () => {
    render(TaskCard, { task: task('seed-post'), variant: 'row' });
    const meta = document.querySelector('.meta')!;
    const request = meta.querySelector('[data-request]')!;
    expect(request.textContent).toBe('דני ביקש ממך');
    expect(meta.firstElementChild).toBe(request);
    expect(document.querySelector('p[data-request]')).toBeNull();
  });

  it('the asker sees a short quiet line after the date (the seat says it waits)', async () => {
    await as(DANI);
    render(TaskCard, { task: task('seed-post'), variant: 'row' });
    const request = document.querySelector('.meta [data-request]')!;
    expect(request.textContent).toBe('ביקשת ממיכל');
    expect(request.classList.contains('quiet')).toBe(true);
    expect(document.querySelector('.meta')!.firstElementChild).not.toBe(request);
  });

  it('a trailing action replaces the avatar; showCategory off drops the category badge', () => {
    const trailing = createRawSnippet((t: () => Task) => ({
      render: () => `<button type="button" data-trailing>${t().id}</button>`
    }));
    render(TaskCard, {
      task: task('seed-bulbs'),
      variant: 'row',
      trailing,
      showCategory: false
    });
    expect(document.querySelector('[data-trailing]')?.textContent).toBe('seed-bulbs');
    expect(document.querySelector('.trail [role="img"]')).toBeNull();
    expect(document.querySelector('.meta')?.textContent).not.toContain('קניות');
    expect(document.querySelector('[data-variant="row"]')).toBeTruthy();
  });
});
