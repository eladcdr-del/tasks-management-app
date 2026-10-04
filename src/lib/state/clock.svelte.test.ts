// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClockStore, MINUTE_MS } from './clock.svelte';

const at = (iso: string) => Date.parse(iso);
const HOUR = 3_600_000;

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}

let clock: ClockStore | null = null;

function startAt(iso: string): ClockStore {
  vi.useFakeTimers({ now: at(iso), toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  clock = new ClockStore().start();
  return clock;
}

beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

afterEach(() => {
  clock?.dispose();
  clock = null;
  vi.useRealTimers();
});

describe('ClockStore', () => {
  it('exposes nowMs, today and wall time in Asia/Jerusalem', () => {
    const c = startAt('2026-10-04T09:00:30+03:00');
    expect(c.nowMs).toBe(at('2026-10-04T09:00:30+03:00'));
    expect(c.today).toBe('2026-10-04');
    expect(c.wall).toEqual({ hour: 9, minute: 0, weekday: 0 });
  });

  it('ticks on minute boundaries with one timer and no drift', () => {
    const c = startAt('2026-10-04T09:00:30+03:00');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(29_999);
    expect(c.wall.minute).toBe(0);
    vi.advanceTimersByTime(1);
    expect(c.nowMs).toBe(at('2026-10-04T09:01:00+03:00'));
    expect(c.wall).toEqual({ hour: 9, minute: 1, weekday: 0 });
    vi.advanceTimersByTime(59 * MINUTE_MS);
    expect(c.nowMs).toBe(at('2026-10-04T10:00:00+03:00'));
    expect(c.nowMs % MINUTE_MS).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('rolls today over at local midnight across the 2026-10-25 DST night (25-hour day)', () => {
    const c = startAt('2026-10-24T23:59:30+03:00');
    expect(c.today).toBe('2026-10-24');
    vi.advanceTimersByTime(30_000);
    expect(c.today).toBe('2026-10-25');
    expect(c.wall).toEqual({ hour: 0, minute: 0, weekday: 0 });

    // 02:00 IDT → 01:00 IST: the hour from 01:00 to 02:00 happens twice.
    vi.advanceTimersByTime(90 * MINUTE_MS);
    expect(c.wall).toMatchObject({ hour: 1, minute: 30 });
    vi.advanceTimersByTime(HOUR);
    expect(c.wall).toMatchObject({ hour: 1, minute: 30 });
    expect(c.today).toBe('2026-10-25');

    // The 25th lasts 25 hours; it ends at 00:00 IST (+02:00), not 00:00 IDT.
    vi.advanceTimersByTime(at('2026-10-25T23:59:00+02:00') - c.nowMs);
    expect(c.today).toBe('2026-10-25');
    vi.advanceTimersByTime(MINUTE_MS);
    expect(c.nowMs).toBe(at('2026-10-26T00:00:00+02:00'));
    expect(c.today).toBe('2026-10-26');
    expect(c.wall).toEqual({ hour: 0, minute: 0, weekday: 1 });
    expect(vi.getTimerCount()).toBe(1);
  });

  it('recomputes on visibilitychange (visible) and pageshow, after the timers were frozen', () => {
    const c = startAt('2026-10-04T09:00:00+03:00');
    // The phone slept: no timer fired, but the wall clock moved on.
    vi.setSystemTime(at('2026-10-06T07:45:10+03:00'));
    expect(c.today).toBe('2026-10-04');
    setVisibility('hidden');
    expect(c.today).toBe('2026-10-04');
    setVisibility('visible');
    expect(c.today).toBe('2026-10-06');
    expect(c.wall).toMatchObject({ hour: 7, minute: 45 });
    expect(vi.getTimerCount()).toBe(1); // re-armed, not doubled

    vi.setSystemTime(at('2026-10-07T12:00:00+03:00'));
    window.dispatchEvent(new Event('pageshow'));
    expect(c.today).toBe('2026-10-07');
    vi.advanceTimersByTime(MINUTE_MS);
    expect(c.wall).toMatchObject({ hour: 12, minute: 1 });
  });

  it('dispose clears the timer and the listeners; start is idempotent', () => {
    const c = startAt('2026-10-04T09:00:00+03:00');
    c.start();
    expect(vi.getTimerCount()).toBe(1);
    c.dispose();
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(at('2026-10-05T09:00:00+03:00'));
    setVisibility('visible');
    window.dispatchEvent(new Event('pageshow'));
    vi.advanceTimersByTime(10 * MINUTE_MS);
    expect(c.today).toBe('2026-10-04');
  });

  it('an unstarted clock reads the time once and never schedules', () => {
    vi.useFakeTimers({ now: at('2026-10-04T09:00:00+03:00'), toFake: ['setTimeout', 'Date'] });
    const c = new ClockStore();
    expect(c.today).toBe('2026-10-04');
    expect(vi.getTimerCount()).toBe(0);
    const injected = new ClockStore({ now: () => at('2026-12-31T23:00:00+02:00') });
    expect(injected.today).toBe('2026-12-31');
  });
});
