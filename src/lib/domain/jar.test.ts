import { describe, expect, it } from 'vitest';
import { applyCompletion, applyRedeem, applyReopen, isFull, progress, remaining } from './jar';
import type { TreatJar } from './types';

const jar = (over: Partial<TreatJar> = {}): TreatJar => ({
  treat: 'ארוחה במסעדה',
  target: 10,
  count: 7,
  round: 1,
  startedAt: 1_000,
  ...over
});

describe('isFull', () => {
  it('is true only when count reaches the target', () => {
    expect(isFull(jar({ count: 9 }))).toBe(false);
    expect(isFull(jar({ count: 10 }))).toBe(true);
    expect(isFull(jar({ count: 12 }))).toBe(true);
  });
  it('is false for no jar', () => {
    expect(isFull(null)).toBe(false);
  });
});

describe('remaining', () => {
  it('is target minus count', () => {
    expect(remaining(jar({ count: 7 }))).toBe(3);
  });
  it('never goes below zero when the jar overflowed', () => {
    expect(remaining(jar({ count: 13 }))).toBe(0);
  });
  it('is 0 for no jar', () => {
    expect(remaining(null)).toBe(0);
  });
});

describe('progress', () => {
  it('is the 0..1 fraction filled', () => {
    expect(progress(jar({ count: 0 }))).toBe(0);
    expect(progress(jar({ count: 5 }))).toBe(0.5);
    expect(progress(jar({ count: 10 }))).toBe(1);
  });
  it('is clamped to 1 on overflow', () => {
    expect(progress(jar({ count: 14 }))).toBe(1);
  });
  it('is 0 for no jar or a degenerate target', () => {
    expect(progress(null)).toBe(0);
    expect(progress(jar({ target: 0, count: 3 }))).toBe(0);
  });
});

describe('applyCompletion', () => {
  it('adds one marble without mutating the input', () => {
    const before = jar({ count: 7 });
    const after = applyCompletion(before);
    expect(after).toEqual({ ...before, count: 8 });
    expect(before.count).toBe(7);
    expect(after).not.toBe(before);
  });
  it('keeps counting past the target so the surplus carries to the next round', () => {
    expect(applyCompletion(jar({ count: 10 }))?.count).toBe(11);
  });
  it('passes null through', () => {
    expect(applyCompletion(null)).toBeNull();
  });
});

describe('applyReopen', () => {
  it('removes one marble', () => {
    expect(applyReopen(jar({ count: 7 }))?.count).toBe(6);
  });
  it('floors at zero', () => {
    expect(applyReopen(jar({ count: 0 }))?.count).toBe(0);
  });
  it('passes null through', () => {
    expect(applyReopen(null)).toBeNull();
  });
});

describe('applyRedeem', () => {
  it('starts a new round, carrying the surplus', () => {
    const after = applyRedeem(jar({ count: 12, target: 10, round: 3 }), 9_999);
    expect(after).toEqual({
      treat: 'ארוחה במסעדה',
      target: 10,
      count: 2,
      round: 4,
      startedAt: 9_999
    });
  });
  it('lands on exactly 0 when the jar was exactly full', () => {
    expect(applyRedeem(jar({ count: 10 }), 5)?.count).toBe(0);
  });
  it('never goes negative if redeemed early', () => {
    expect(applyRedeem(jar({ count: 4, target: 10 }), 5)?.count).toBe(0);
  });
  it('does not mutate the input', () => {
    const before = jar({ count: 10 });
    applyRedeem(before, 5);
    expect(before.round).toBe(1);
    expect(before.count).toBe(10);
  });
  it('accepts a Date for now and stores epoch millis', () => {
    expect(applyRedeem(jar({ count: 10 }), new Date(9_999))?.startedAt).toBe(9_999);
  });
  it('passes null through', () => {
    expect(applyRedeem(null, 5)).toBeNull();
  });
});
