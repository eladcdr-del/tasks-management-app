// Treat jar math (Blueprint §3 "Domain rules"). All functions are pure, never mutate their input and
// accept `null` (a household with no jar yet) by passing it through.
//
// The counter is allowed to run past `target`: completing a task while the jar is already full keeps
// counting, and the surplus carries into the next round when the treat is redeemed.

import type { Millis, TreatJar } from './types';

export function isFull(jar: TreatJar | null): boolean {
  return jar !== null && jar.count >= jar.target;
}

/** Marbles still needed to fill the jar (0 once full). */
export function remaining(jar: TreatJar | null): number {
  return jar === null ? 0 : Math.max(0, jar.target - jar.count);
}

/** Fraction filled, 0..1. */
export function progress(jar: TreatJar | null): number {
  if (jar === null || jar.target <= 0) return 0;
  return Math.min(1, Math.max(0, jar.count / jar.target));
}

/** A task was completed: +1. */
export function applyCompletion(jar: TreatJar | null): TreatJar | null {
  return jar === null ? null : { ...jar, count: jar.count + 1 };
}

/** A completed task was reopened: -1, never below 0. */
export function applyReopen(jar: TreatJar | null): TreatJar | null {
  return jar === null ? null : { ...jar, count: Math.max(0, jar.count - 1) };
}

/** The treat was redeemed: the surplus (if any) carries over, the round advances, the clock restarts. */
export function applyRedeem(jar: TreatJar | null, now: Millis): TreatJar | null {
  return jar === null
    ? null
    : { ...jar, count: Math.max(0, jar.count - jar.target), round: jar.round + 1, startedAt: now };
}
