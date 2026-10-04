// Reactive time for the whole app (step 2.4, Phase 1 council).
//
// RULE: screens and stores never call `new Date()` / `Date.now()` for display logic (greetings,
// "today", due chips, ages, "בתוקף עוד 6 ימים"…). They read `clock`:
//
//   clock.nowMs   epoch ms, refreshed every minute
//   clock.today   ISODate in Asia/Jerusalem (todayISO); changes only when the date does
//   clock.wall    { hour, minute, weekday } in Asia/Jerusalem (localTimeParts)
//
// Timestamps written to data (createdAt…) are the adapters' business, not the clock's.
//
// One timer, re-armed after every tick from the CURRENT time (so no drift accumulates): it fires at
// the next minute boundary or at the next local midnight (msUntilNextLocalMidnight), whichever is
// first. Timers are throttled in the background and frozen while the phone sleeps, so the clock
// also recomputes on `visibilitychange` (visible) and `pageshow` (back/forward cache). main.ts
// starts the app's clock; dispose() stops it.

import { localTimeParts, msUntilNextLocalMidnight, todayISO } from '$lib/domain/dates';
import type { ISODate, Millis } from '$lib/domain/types';

export const MINUTE_MS = 60_000;

export interface ClockOptions {
  /** Time source (tests). Default Date.now. */
  now?: () => Millis;
}

export class ClockStore {
  nowMs = $state<Millis>(0);
  readonly today: ISODate = $derived(todayISO(this.nowMs));
  readonly wall: { hour: number; minute: number; weekday: number } = $derived(
    localTimeParts(this.nowMs)
  );

  #now: () => Millis;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #started = false;

  constructor(opts: ClockOptions = {}) {
    this.#now = opts.now ?? (() => Date.now());
    this.nowMs = this.#now();
  }

  /** Starts ticking (idempotent). */
  start(): this {
    if (this.#started) return this;
    this.#started = true;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.#onVisibility);
    }
    if (typeof window !== 'undefined') window.addEventListener('pageshow', this.#onPageShow);
    this.refresh();
    return this;
  }

  /** Re-reads the time now and re-arms the timer (also the visibility / pageshow handler). */
  refresh(): void {
    const now = this.#now();
    this.nowMs = now;
    if (!this.#started) return;
    if (this.#timer !== null) clearTimeout(this.#timer);
    const toNextMinute = MINUTE_MS - (((now % MINUTE_MS) + MINUTE_MS) % MINUTE_MS);
    const delay = Math.min(toNextMinute, msUntilNextLocalMidnight(now));
    this.#timer = setTimeout(() => this.refresh(), delay);
  }

  /** Stops the timer and the listeners. The last values stay readable. */
  dispose(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
    if (!this.#started) return;
    this.#started = false;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.#onVisibility);
    }
    if (typeof window !== 'undefined') window.removeEventListener('pageshow', this.#onPageShow);
  }

  #onVisibility = (): void => {
    if (document.visibilityState === 'visible') this.refresh();
  };

  #onPageShow = (): void => this.refresh();
}

/** The app's clock (main.ts calls `clock.start()`). */
export const clock = new ClockStore();
