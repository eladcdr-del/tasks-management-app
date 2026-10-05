// Keeps keyboard and screen-reader users from being dropped onto the page after a delete: the
// focused control (a deleted row's "⋮", the edit sheet's opener on a jar that is gone) leaves the
// page, and the browser puts focus on <body>. refocusWhenLost watches for that for a moment and
// moves focus to `target()` instead. Focus that has landed somewhere real is left alone.

/** Moves focus to `target()` if, within `ms`, focus is found lost (on <body>, or detached). */
export function refocusWhenLost(target: () => HTMLElement | null, ms = 1200): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const until = performance.now() + ms;
  const step = () => {
    const active = document.activeElement;
    const lost = !active || active === document.body || !active.isConnected;
    if (lost) {
      const el = target();
      if (el?.isConnected) {
        el.focus({ preventScroll: true });
        return;
      }
    }
    if (performance.now() < until) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
