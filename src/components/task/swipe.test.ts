import { describe, expect, it } from 'vitest';
import { armedAction, decideAxis, resist, revealing, threshold } from './swipe';

describe('task card swipe', () => {
  it('waits for the slop, then locks to one axis', () => {
    expect(decideAxis(4, 3)).toBe('pending');
    expect(decideAxis(20, 4)).toBe('horizontal');
    expect(decideAxis(12, 11)).toBe('vertical');
    expect(decideAxis(2, 30)).toBe('vertical');
  });

  it('arms done toward inline-end and snooze toward inline-start (RTL and LTR)', () => {
    expect(armedAction(-120, true, 96)).toBe('done');
    expect(armedAction(120, true, 96)).toBe('snooze');
    expect(armedAction(120, false, 96)).toBe('done');
    expect(armedAction(-50, true, 96)).toBeNull();
    expect(revealing(-5, true)).toBe('done');
    expect(revealing(5, true)).toBe('snooze');
    expect(revealing(0, true)).toBeNull();
  });

  it('caps the threshold and resists past it', () => {
    expect(threshold(350)).toBe(96);
    expect(threshold(200)).toBeCloseTo(56);
    expect(resist(50, 96)).toBe(50);
    expect(resist(300, 96)).toBeLessThan(200);
    expect(resist(-300, 96)).toBeGreaterThan(-200);
  });
});
