// Motion helpers (Blueprint §8 "Motion principles"). Owner: step 1.4.
//
// - `reducedMotion.current` is reactive (Svelte MediaQuery): read it inside components/effects and
//   the UI re-renders when the OS setting flips.
// - `dur(ms)` caps any duration at 120ms under reduced motion (crossfades only, no bounce).
// - `easeOut` is the JS twin of the CSS `--ease-out` token, for Svelte transitions.
// - `SHEET_SPRING` matches the sheet spring in the blueprint.
//
// Usage in a component:
//   import { fade } from 'svelte/transition';
//   import { dur, easeOut, reducedMotion } from '$lib/platform/motion';
//   <div transition:fade={{ duration: dur(200), easing: easeOut }}>
//   {#if reducedMotion.current} … static … {:else} … animated … {/if}

import { MediaQuery } from 'svelte/reactivity';

/** Reactive `prefers-reduced-motion: reduce`. `false` outside the browser. */
export const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)', false);

/** Duration tokens in ms (mirror tokens.css). */
export const D_FAST = 120;
export const D_BASE = 200;
export const D_SLOW = 320;

/** Ceiling for any animation when the user asked for reduced motion. */
export const REDUCED_MAX = 120;

/** Returns `ms`, or at most 120ms when reduced motion is on. */
export function dur(ms: number): number {
  return reducedMotion.current ? Math.min(ms, REDUCED_MAX) : ms;
}

/** Svelte `Spring` options for bottom sheets (Blueprint §8). */
export const SHEET_SPRING = { stiffness: 0.18, damping: 0.75 } as const;

/**
 * Cubic-bezier easing factory (same maths as CSS). `bezier(.2,.8,.2,1)` equals `--ease-out`.
 * Newton–Raphson with a bisection fallback; accurate to ~1e-6, fine for 60fps transitions.
 */
export function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  function solveX(x: number): number {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    while (lo < hi) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-6) return t;
      if (x > v) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
      if (hi - lo < 1e-7) break;
    }
    return t;
  }

  return (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : sampleY(solveX(t)));
}

/** JS twin of `--ease-out: cubic-bezier(.2,.8,.2,1)`. */
export const easeOut = bezier(0.2, 0.8, 0.2, 1);
