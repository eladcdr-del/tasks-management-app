import { describe, expect, it } from 'vitest';
import * as app from './age';
import { addDays, todayISO } from './dates';
import type { Task } from './types';

/**
 * The notifier's stuck rule. It is loaded through a non-literal path so the app's type check
 * (svelte-check over src/) does not pull in the notifier package, whose imports end in ".ts".
 */
interface NotifierStuck {
  STUCK_AGE_DAYS: number;
  STUCK_SNOOZE_COUNT: number;
  ageStart(task: Task): string;
  isStuck(task: Task, today: string): boolean;
}
const NOTIFIER_PLANNER = '../../../scripts/notify/planner';
const notifier = (await import(/* @vite-ignore */ NOTIFIER_PLANNER)) as NotifierStuck;

// The notifier is its own package and must not import from src/, so it carries a copy of the stuck
// rule (scripts/notify/planner.ts: ageStart, isStuck, STUCK_*). This test pins the two copies
// together on a generated table: same thresholds, same start day, same verdict, for every row.
// Rows are produced by a seeded generator, so a failure is reproducible from its index.

/** Deterministic PRNG (mulberry32), so the table is the same on every run and machine. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * "Now" instants around the interesting days: an ordinary Sunday, both 2026 DST switches in
 * Jerusalem (Fri 27 Mar, Sun 25 Oct), a month end, a leap day and a year end. Each is probed at
 * several wall-clock hours, including just before and just after local midnight (UTC 21:00-22:00).
 */
const NOW_BASES = [
  '2026-10-04',
  '2026-03-27',
  '2026-10-25',
  '2026-01-31',
  '2028-02-29',
  '2026-12-31'
].flatMap((iso) =>
  [-3.5, -0.25, 0, 0.25, 6, 11.99, 20.75, 20.99, 21, 21.01, 22, 23.9].map(
    (h) => Date.parse(`${iso}T00:00:00Z`) + h * HOUR
  )
);

interface Row {
  task: Task;
  now: number;
}

function generate(count: number, seed: number): Row[] {
  const rnd = prng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const rows: Row[] = [];
  for (let i = 0; i < count; i++) {
    const now = pick(NOW_BASES);
    const today = todayISO(now);
    // created 0-70 days before now, at any minute (so local-midnight edges are well covered)
    const createdAt = now - Math.floor(rnd() * 70 * DAY) - Math.floor(rnd() * 1440) * 60_000;
    const dated = (): string | null => {
      const r = rnd();
      if (r < 0.4) return null;
      if (r < 0.42) return '2026-02-30'; // malformed: both copies must ignore it the same way
      return addDays(today, Math.floor(rnd() * 80) - 50); // -50 .. +29 days
    };
    const task: Task = {
      id: `row-${i}`,
      title: 'משימה',
      notes: '',
      categoryId: null,
      priority: 'normal',
      ownerId: null,
      requestedBy: null,
      requestedAt: null,
      createdBy: 'u1',
      createdAt,
      updatedBy: 'u1',
      updatedAt: createdAt,
      scheduledFor: dated(),
      weekPlan: false,
      dueDate: dated(),
      dueTime: null,
      hardDeadline: false,
      recurrence: null,
      seriesId: rnd() < 0.35 ? 'series' : null,
      status: rnd() < 0.9 ? 'open' : 'done',
      snoozeCount: pick([0, 0, 0, 1, 2, 2, 3, 3, 4, 7]),
      lastSnoozedAt: null,
      completedAt: null,
      completedBy: null,
      completion: null
    };
    rows.push({ task, now });
  }
  return rows;
}

describe('stuck rule parity: src/lib/domain/age.ts vs scripts/notify/planner.ts', () => {
  it('uses the same thresholds', () => {
    expect(notifier.STUCK_AGE_DAYS).toBe(app.STUCK_AGE_DAYS);
    expect(notifier.STUCK_SNOOZE_COUNT).toBe(app.STUCK_SNOOZE_COUNT);
  });

  const rows = generate(20_000, 0x5eed);

  it('the generated table exercises both verdicts and every branch', () => {
    const stuck = rows.filter(({ task, now }) => app.isStuck(task, now));
    expect(stuck.length).toBeGreaterThan(2_000);
    expect(rows.length - stuck.length).toBeGreaterThan(2_000);
    // stuck by age alone, by snoozes alone, recurring instances, and future-dated (not actionable)
    expect(stuck.some(({ task }) => task.snoozeCount < 3)).toBe(true);
    expect(stuck.some(({ task, now }) => app.ageDays(task, now) < 21)).toBe(true);
    expect(stuck.some(({ task }) => task.seriesId !== null)).toBe(true);
    expect(
      rows.some(
        ({ task, now }) =>
          task.status === 'open' &&
          task.snoozeCount >= 3 &&
          !app.isStuck(task, now) &&
          (task.dueDate ?? task.scheduledFor ?? '') > todayISO(now)
      )
    ).toBe(true);
  });

  it('agrees on ageStart and isStuck for every row', () => {
    const mismatches: string[] = [];
    rows.forEach(({ task, now }, i) => {
      const today = todayISO(now);
      const startApp = app.ageStart(task);
      const startNotifier = notifier.ageStart(task);
      const stuckApp = app.isStuck(task, now);
      const stuckNotifier = notifier.isStuck(task, today);
      if (startApp !== startNotifier || stuckApp !== stuckNotifier) {
        mismatches.push(
          `#${i} today=${today} ${JSON.stringify({
            createdAt: task.createdAt,
            seriesId: task.seriesId,
            dueDate: task.dueDate,
            scheduledFor: task.scheduledFor,
            snoozeCount: task.snoozeCount,
            status: task.status
          })}: ageStart ${startApp}/${startNotifier}, stuck ${stuckApp}/${stuckNotifier}`
        );
      }
    });
    expect(mismatches.slice(0, 5)).toEqual([]);
  });
});
