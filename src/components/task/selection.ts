// How the rows of a list take part in choosing several tasks at once (Home's selection mode).
// TaskList hands it to every TaskCard; Home's selection store (screens/Home/selection.svelte.ts)
// implements it. While `active`, a row shows a checkbox in place of its completion circle, a tap
// anywhere on it toggles it, and nothing else on it acts (no swipe, no link, no seat menu).
// Outside the mode a long press on a row starts it, with that row chosen.

export interface RowSelection {
  readonly active: boolean;
  has(id: string): boolean;
  toggle(id: string): void;
  /** A long press on a row (outside the mode): start choosing, with this row chosen. */
  begin(id: string): void;
}

/** How long a press holds before it starts choosing (ms). */
export const LONG_PRESS_MS = 450;
/** A press that moves farther than this (px) is a scroll or a swipe, not a long press. */
export const LONG_PRESS_SLOP = 8;
