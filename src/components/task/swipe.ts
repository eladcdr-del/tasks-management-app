// Horizontal swipe on a task card (step 3.2): pure decisions, so the gesture rules are testable.
//
// - Axis lock: nothing happens until the pointer has moved SLOP px. A mostly vertical move hands
//   the gesture to the page scroll for good (touch-action: pan-y keeps scrolling native); a mostly
//   horizontal one claims it.
// - "Toward inline-end" (left in RTL) arms "done"; "toward inline-start" arms "snooze".
// - Past the threshold the card keeps following with resistance, so it never flies off.

export const SLOP = 10;
/** A horizontal claim needs |dx| this many times |dy|. */
export const AXIS_RATIO = 1.3;
export const MAX_THRESHOLD = 96;
export const THRESHOLD_FRACTION = 0.28;

export type SwipeAction = 'done' | 'snooze';
export type AxisDecision = 'pending' | 'horizontal' | 'vertical';

export function decideAxis(dx: number, dy: number): AxisDecision {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < SLOP && ay < SLOP) return 'pending';
  return ax > ay * AXIS_RATIO ? 'horizontal' : 'vertical';
}

/** The distance that arms an action on a card `width` px wide. */
export function threshold(width: number): number {
  return Math.min(MAX_THRESHOLD, Math.max(48, width * THRESHOLD_FRACTION));
}

/**
 * The action a physical horizontal offset points at. `rtl`: inline-end is the left (negative dx).
 * null when the offset is below the threshold.
 */
export function armedAction(dx: number, rtl: boolean, limit: number): SwipeAction | null {
  const towardEnd = rtl ? -dx : dx;
  if (Math.abs(towardEnd) < limit) return null;
  return towardEnd > 0 ? 'done' : 'snooze';
}

/** Which side is being revealed (for the label under the card), even below the threshold. */
export function revealing(dx: number, rtl: boolean): SwipeAction | null {
  if (dx === 0) return null;
  return (rtl ? -dx : dx) > 0 ? 'done' : 'snooze';
}

/** The visual offset: 1:1 up to the threshold, then a diminishing rubber band. */
export function resist(dx: number, limit: number): number {
  const ax = Math.abs(dx);
  if (ax <= limit) return dx;
  const extra = ax - limit;
  return Math.sign(dx) * (limit + 28 * Math.log1p(extra / 28));
}
