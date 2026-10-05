import { describe, expect, it } from 'vitest';
import { groupTasks } from './buckets';
import {
  GROUP_ABOVE,
  GROUP_PREVIEW,
  groupByCategory,
  groupKeyOf,
  homeList,
  isFree,
  matchesWho,
  nextTabWithTasks,
  preview,
  shouldGroup,
  tabCounts,
  tabTasks
} from './homeList';
import type { Task } from './types';

// Fixture clock: Sunday 2026-10-04 (the week runs to Saturday 10-10). Viewer: מיכל ('me').
const TODAY = '2026-10-04';
const ME = 'me';
const DANI = 'dani';
const MEMBERS = [ME, DANI];

let seq = 0;
function task(over: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `t${seq}`,
    title: `משימה ${seq}`,
    notes: '',
    categoryId: null,
    priority: 'normal',
    ownerId: null,
    requestedBy: null,
    requestedAt: null,
    createdBy: ME,
    createdAt: 1_000 + seq,
    updatedBy: ME,
    updatedAt: 1_000 + seq,
    scheduledFor: null,
    weekPlan: false,
    dueDate: null,
    dueTime: null,
    hardDeadline: false,
    recurrence: null,
    seriesId: null,
    status: 'open',
    snoozeCount: 0,
    lastSnoozedAt: null,
    completedAt: null,
    completedBy: null,
    completion: null,
    ...over
  };
}

const ids = (list: readonly Pick<Task, 'id'>[]) => list.map((t) => t.id);

/** A household like the demo: attention, a request to me, one to דני, owned and free tasks. */
function household() {
  const overdue = task({ ownerId: DANI, dueDate: '2026-10-02' });
  const urgentFree = task({ priority: 'urgent' });
  const askedMe = task({ requestedBy: DANI, requestedOf: ME, scheduledFor: '2026-10-06' });
  const askedDani = task({ requestedBy: ME, requestedOf: DANI });
  const todayMine = task({ ownerId: ME, dueDate: TODAY });
  const todayFree = task({ scheduledFor: TODAY, categoryId: 'shopping' });
  const weekDani = task({ ownerId: DANI, dueDate: '2026-10-08' });
  const weekMine = task({ ownerId: ME, scheduledFor: '2026-10-07' });
  const laterFree = task({ categoryId: 'home' });
  const laterGone = task({ ownerId: 'left' }); // a former member's: nobody holds it now
  const laterMine = task({ ownerId: ME, dueDate: '2026-11-20' });
  const all = [
    overdue,
    urgentFree,
    askedMe,
    askedDani,
    todayMine,
    todayFree,
    weekDani,
    weekMine,
    laterFree,
    laterGone,
    laterMine
  ];
  return {
    groups: groupTasks(all, TODAY, MEMBERS, ME),
    t: {
      overdue,
      urgentFree,
      askedMe,
      askedDani,
      todayMine,
      todayFree,
      weekDani,
      weekMine,
      laterFree,
      laterGone,
      laterMine
    }
  };
}

describe('isFree / matchesWho', () => {
  it('free: no owner, or an owner who left; owners are trusted while members are unknown', () => {
    expect(isFree({ ownerId: null }, MEMBERS)).toBe(true);
    expect(isFree({ ownerId: 'left' }, MEMBERS)).toBe(true);
    expect(isFree({ ownerId: DANI }, MEMBERS)).toBe(false);
    expect(isFree({ ownerId: 'left' }, undefined)).toBe(false);
  });

  it('all / mine / free / a member', () => {
    const mine = { ownerId: ME };
    const danis = { ownerId: DANI };
    const free = { ownerId: null };
    expect([mine, danis, free].map((t) => matchesWho(t, 'all', ME, MEMBERS))).toEqual([
      true,
      true,
      true
    ]);
    expect([mine, danis, free].map((t) => matchesWho(t, 'mine', ME, MEMBERS))).toEqual([
      true,
      false,
      false
    ]);
    expect([mine, danis, free].map((t) => matchesWho(t, 'free', ME, MEMBERS))).toEqual([
      false,
      false,
      true
    ]);
    expect([mine, danis, free].map((t) => matchesWho(t, DANI, ME, MEMBERS))).toEqual([
      false,
      true,
      false
    ]);
  });

  it('"mine" matches nothing while the viewer is unknown', () => {
    expect(matchesWho({ ownerId: ME }, 'mine', null, MEMBERS)).toBe(false);
    expect(matchesWho({ ownerId: null }, 'mine', null, MEMBERS)).toBe(false);
  });
});

describe('tabTasks / homeList', () => {
  it('a tab is its bucket minus the request waiting for my answer (shown above the bar)', () => {
    const { groups, t } = household();
    expect(ids(groups.week)).toContain(t.askedMe.id);
    expect(ids(tabTasks(groups, 'week'))).toEqual([t.weekMine.id, t.weekDani.id]);
    expect(ids(tabTasks(groups, 'today'))).toEqual([t.todayMine.id, t.todayFree.id]);
  });

  it('"all" is every bucket in one sorted list, without attention or the request to me', () => {
    const { groups, t } = household();
    const all = tabTasks(groups, 'all');
    expect(ids(all)).toEqual([
      t.todayMine.id, // due today: a deadline before a plan on the same day
      t.todayFree.id,
      t.weekMine.id,
      t.weekDani.id,
      t.laterMine.id,
      t.askedDani.id, // undated, oldest first
      t.laterFree.id,
      t.laterGone.id
    ]);
    for (const hidden of [t.overdue, t.urgentFree, t.askedMe]) {
      expect(ids(all)).not.toContain(hidden.id);
    }
  });

  it('every open task shows exactly once on Home: attention, requested, or the "all" list', () => {
    const { groups } = household();
    const shown = [...groups.attention, ...groups.requested, ...tabTasks(groups, 'all')];
    expect(new Set(ids(shown)).size).toBe(shown.length);
    expect(shown).toHaveLength(11);
  });

  it('the chips combine with the tabs', () => {
    const { groups, t } = household();
    const list = (tab: 'today' | 'week' | 'later' | 'all', who: string) =>
      ids(homeList(groups, { tab, who }, ME, MEMBERS));
    expect(list('all', 'free')).toEqual([
      t.todayFree.id,
      t.askedDani.id,
      t.laterFree.id,
      t.laterGone.id
    ]);
    expect(list('later', 'free')).toEqual([t.askedDani.id, t.laterFree.id, t.laterGone.id]);
    expect(list('all', 'mine')).toEqual([t.todayMine.id, t.weekMine.id, t.laterMine.id]);
    expect(list('week', DANI)).toEqual([t.weekDani.id]);
    expect(list('today', DANI)).toEqual([]);
  });

  it('"free" lists exactly what the pulse counts as waiting', () => {
    const { groups } = household();
    expect(ids(homeList(groups, { tab: 'all', who: 'free' }, ME, MEMBERS)).sort()).toEqual(
      ids(groups.waiting).sort()
    );
  });
});

describe('tabCounts / nextTabWithTasks', () => {
  it('counts each tab under the current chip; "all" is their sum', () => {
    const { groups } = household();
    expect(tabCounts(groups, 'all', ME, MEMBERS)).toEqual({ today: 2, week: 2, later: 4, all: 8 });
    expect(tabCounts(groups, 'free', ME, MEMBERS)).toEqual({ today: 1, week: 0, later: 3, all: 4 });
    expect(tabCounts(groups, 'mine', ME, MEMBERS)).toEqual({ today: 1, week: 1, later: 1, all: 3 });
  });

  it('points to the first other time tab with tasks, never to "all"', () => {
    expect(nextTabWithTasks({ today: 0, week: 0, later: 3, all: 3 }, 'today')).toBe('later');
    expect(nextTabWithTasks({ today: 0, week: 2, later: 3, all: 5 }, 'today')).toBe('week');
    expect(nextTabWithTasks({ today: 1, week: 0, later: 0, all: 1 }, 'week')).toBe('today');
    expect(nextTabWithTasks({ today: 0, week: 0, later: 0, all: 0 }, 'today')).toBeNull();
    expect(nextTabWithTasks({ today: 0, week: 0, later: 4, all: 4 }, 'later')).toBeNull();
  });
});

describe('category groups', () => {
  it('groups only lists longer than six', () => {
    expect(GROUP_ABOVE).toBe(6);
    expect(shouldGroup(6)).toBe(false);
    expect(shouldGroup(7)).toBe(true);
  });

  it('"אחר", no category and unknown ids share the "שונות" group', () => {
    expect(groupKeyOf('home')).toBe('home');
    expect(groupKeyOf('other')).toBe('misc');
    expect(groupKeyOf(null)).toBe('misc');
    expect(groupKeyOf(undefined)).toBe('misc');
    expect(groupKeyOf('garden')).toBe('misc');
  });

  it('follows the category table order, "שונות" last, keeping the order inside each group', () => {
    const a = task({ categoryId: 'home' });
    const b = task({ categoryId: null });
    const c = task({ categoryId: 'car' });
    const d = task({ categoryId: 'home' });
    const e = task({ categoryId: 'other' });
    const f = task({ categoryId: 'family' });
    const groups = groupByCategory([a, b, c, d, e, f]);
    expect(groups.map((g) => g.key)).toEqual(['car', 'home', 'family', 'misc']);
    expect(groups.map((g) => ids(g.tasks))).toEqual([[c.id], [a.id, d.id], [f.id], [b.id, e.id]]);
  });
});

describe('preview', () => {
  const list = (n: number) => Array.from({ length: n }, () => task());

  it('shows the first three and counts the rest', () => {
    const tasks = list(8);
    const p = preview(tasks, false);
    expect(GROUP_PREVIEW).toBe(3);
    expect(ids(p.shown)).toEqual(ids(tasks.slice(0, 3)));
    expect(p.hidden).toBe(5);
  });

  it('never hides a single task behind "עוד 1"', () => {
    const tasks = list(4);
    expect(preview(tasks, false)).toEqual({ shown: tasks, hidden: 0 });
    expect(preview(list(3), false).hidden).toBe(0);
  });

  it('open shows everything', () => {
    const tasks = list(9);
    expect(preview(tasks, true)).toEqual({ shown: tasks, hidden: 0 });
  });

  it('keeps tasks in sight (just added) in their place, beyond the first three', () => {
    const tasks = list(9);
    const keep = new Set([tasks[6]!.id, tasks[8]!.id]);
    const p = preview(tasks, false, keep);
    expect(ids(p.shown)).toEqual([
      tasks[0]!.id,
      tasks[1]!.id,
      tasks[2]!.id,
      tasks[6]!.id,
      tasks[8]!.id
    ]);
    expect(p.hidden).toBe(4);
  });
});
