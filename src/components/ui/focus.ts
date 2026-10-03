// Focus helpers shared by BottomSheet and Dialog (step 1.4).

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[tabindex]'
].join(',');

/** Tabbable descendants in DOM order (skips tabindex=-1, hidden and inert elements). */
export function tabbables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (el.tabIndex < 0) return false;
    if (el.closest('[inert]')) return false;
    return el.getClientRects().length > 0;
  });
}

/**
 * Keeps Tab / Shift+Tab inside `root` (wraps at both ends). Native modal dialogs already make the
 * page inert, but would let focus escape to the browser UI; this keeps it in the sheet.
 * Returns true when the event was handled.
 */
export function wrapTab(e: KeyboardEvent, root: HTMLElement): boolean {
  if (e.key !== 'Tab') return false;
  const items = tabbables(root);
  if (items.length === 0) {
    e.preventDefault();
    root.focus();
    return true;
  }
  const first = items[0] as HTMLElement;
  const last = items[items.length - 1] as HTMLElement;
  const idx = items.indexOf(document.activeElement as HTMLElement);
  // idx === -1: focus sits on a non-tabbable spot (the panel itself) or escaped the root.
  const wrapTo = e.shiftKey
    ? idx <= 0
      ? last
      : null
    : idx === -1 || idx === items.length - 1
      ? first
      : null;
  if (!wrapTo) return false;
  e.preventDefault();
  wrapTo.focus();
  return true;
}

/** Moves focus into `root`: `[data-autofocus]` first, else `fallback` (made focusable). */
export function focusInitial(root: HTMLElement, fallback: HTMLElement): void {
  const target = root.querySelector<HTMLElement>('[data-autofocus]');
  if (target) {
    target.focus({ preventScroll: true });
    return;
  }
  if (!fallback.hasAttribute('tabindex')) fallback.setAttribute('tabindex', '-1');
  fallback.focus({ preventScroll: true });
}

// ── Scroll lock (ref-counted: nested sheet + dialog) ───────────────────────────
let locks = 0;
let saved = '';

/** Locks page scroll while an overlay is open. Call the returned function to release. */
export function lockScroll(): () => void {
  const root = document.documentElement;
  if (locks === 0) {
    saved = root.style.overflow;
    root.style.overflow = 'hidden';
  }
  locks++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks--;
    if (locks === 0) root.style.overflow = saved;
  };
}
