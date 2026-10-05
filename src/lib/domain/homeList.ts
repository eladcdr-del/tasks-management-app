// Home's list (feature "home"): what the list under the control bar shows, for a time tab and a
// "whose" chip, over groupTasks' sections; the counts on the tabs; and the category groups a long
// list folds into. Pure: the screen only renders what comes out of here.
//
// Vocabulary
//   tab        today | week | later (the time buckets of groupTasks) | all (the three together)
//   who        all | mine | free (nobody holds it: unowned, a former member's, or a request still
//              waiting for SOMEONE ELSE's answer) | a member's uid
//   the list   the tab's tasks matching `who`, minus what Home already shows above the bar:
//              attention is never in a time bucket (groupTasks), and the requests waiting for the
//              viewer's answer ("ביקשו ממך") are taken out here, so no task shows twice
//   groups     a list longer than GROUP_ABOVE folds into category groups (display order of the
//              category table; "אחר" and uncategorised together as "שונות", last). A group shows its
//              first GROUP_PREVIEW tasks, plus the ones the screen keeps in sight (just added), and
//              "עוד N" for the rest; it never hides a single task behind "עוד 1".
//
// Order inside a list or a group: sortTasks (urgent, important, the nearest date with a deadline
// before a plan, then oldest first). Unowned tasks are not set apart: they sit in the list in that
// order, each with its own "take" action.

import { sortTasks, type GroupedTasks, type MemberIds } from './buckets';
import { CATEGORY_ORDER } from './categories';
import type { CategoryId, Task } from './types';

export type HomeTab = 'today' | 'week' | 'later' | 'all';
export const HOME_TABS: readonly HomeTab[] = ['today', 'week', 'later', 'all'];

/** 'all', 'mine', 'free', or a member's uid. */
export type HomeWho = string;

/** A list longer than this is grouped by category. */
export const GROUP_ABOVE = 6;
/** Tasks a collapsed group (or the attention block) shows. */
export const GROUP_PREVIEW = 3;

/** Nobody holds it: no owner, or an owner who left (with `memberIds` undefined, owners are trusted). */
export function isFree(task: Pick<Task, 'ownerId'>, memberIds: MemberIds): boolean {
  return task.ownerId === null || (memberIds !== undefined && !memberIds.includes(task.ownerId));
}

/** Whether `task` passes the "whose" chip `who`, seen by `me`. */
export function matchesWho(
  task: Pick<Task, 'ownerId'>,
  who: HomeWho,
  me: string | null,
  memberIds: MemberIds
): boolean {
  switch (who) {
    case 'all':
      return true;
    case 'mine':
      return me !== null && task.ownerId === me;
    case 'free':
      return isFree(task, memberIds);
    default:
      return task.ownerId === who;
  }
}

/** A tab's tasks before the chip: its bucket(s) minus the requests waiting for my answer. */
export function tabTasks(groups: GroupedTasks, tab: HomeTab): Task[] {
  const asked = new Set(groups.requested.map((t) => t.id));
  const keep = (list: readonly Task[]) => list.filter((t) => !asked.has(t.id));
  if (tab === 'all') return sortTasks(keep([...groups.today, ...groups.week, ...groups.later]));
  return keep(groups[tab]);
}

export interface HomeView {
  tab: HomeTab;
  who: HomeWho;
}

/** The list under the bar, in display order. */
export function homeList(
  groups: GroupedTasks,
  view: HomeView,
  me: string | null,
  memberIds: MemberIds
): Task[] {
  return tabTasks(groups, view.tab).filter((t) => matchesWho(t, view.who, me, memberIds));
}

/** How many tasks each tab would list with the chip `who` (the numbers on the tabs). */
export function tabCounts(
  groups: GroupedTasks,
  who: HomeWho,
  me: string | null,
  memberIds: MemberIds
): Record<HomeTab, number> {
  const count = (tab: HomeTab) => homeList(groups, { tab, who }, me, memberIds).length;
  const today = count('today');
  const week = count('week');
  const later = count('later');
  return { today, week, later, all: today + week + later };
}

/**
 * The first time tab other than `current` that has tasks (for the empty state's pointer), in tab
 * order; never 'all', which only repeats them.
 */
export function nextTabWithTasks(
  counts: Readonly<Record<HomeTab, number>>,
  current: HomeTab
): Exclude<HomeTab, 'all'> | null {
  for (const tab of ['today', 'week', 'later'] as const) {
    if (tab !== current && counts[tab] > 0) return tab;
  }
  return null;
}

/** A group's key: a category id, or 'misc' for "אחר", no category, and unknown ids. */
export type GroupKey = Exclude<CategoryId, 'other'> | 'misc';

export interface TaskGroup {
  key: GroupKey;
  tasks: Task[];
}

const ORDER: readonly GroupKey[] = [
  ...CATEGORY_ORDER.filter((c): c is Exclude<CategoryId, 'other'> => c !== 'other'),
  'misc'
];

export function groupKeyOf(categoryId: string | null | undefined): GroupKey {
  return ORDER.includes(categoryId as GroupKey) ? (categoryId as GroupKey) : 'misc';
}

/** Whether a list of `n` tasks is shown grouped. */
export const shouldGroup = (n: number): boolean => n > GROUP_ABOVE;

/** `tasks` by category, in display order ("שונות" last); each group keeps the input order. */
export function groupByCategory(tasks: readonly Task[]): TaskGroup[] {
  const byKey = new Map<GroupKey, Task[]>();
  for (const t of tasks) {
    const key = groupKeyOf(t.categoryId);
    const list = byKey.get(key);
    if (list) list.push(t);
    else byKey.set(key, [t]);
  }
  return ORDER.filter((k) => byKey.has(k)).map((key) => ({ key, tasks: byKey.get(key)! }));
}

export interface Preview {
  shown: Task[];
  /** How many stay behind "עוד N" (0: nothing to expand). */
  hidden: number;
}

/**
 * What a collapsed (or `open`) block shows: the first `n` tasks plus any in `keep`, in order. A
 * single leftover task is shown rather than hidden behind "עוד 1".
 */
export function preview(
  tasks: readonly Task[],
  open: boolean,
  keep: ReadonlySet<string> = new Set(),
  n: number = GROUP_PREVIEW
): Preview {
  if (open) return { shown: [...tasks], hidden: 0 };
  const shown = tasks.filter((t, i) => i < n || keep.has(t.id));
  const hidden = tasks.length - shown.length;
  return hidden <= 1 ? { shown: [...tasks], hidden: 0 } : { shown, hidden };
}
