// The platform's "close request" (Android's back button or gesture, Escape on a keyboard) for UI
// that is not a sheet: the seat's menu and Home's selection mode. Chrome's CloseWatcher turns that
// request into a callback, so Back closes the menu (or leaves the mode) instead of leaving the
// screen. Where CloseWatcher is missing this is a no-op (Escape is still handled by the callers).

interface CloseWatcherLike {
  onclose: (() => void) | null;
  destroy(): void;
}

type CloseWatcherCtor = new () => CloseWatcherLike;

/**
 * Calls `onclose` once on the next close request. Returns a function that stops watching (call it
 * when the UI closes some other way; it does not call `onclose`).
 */
export function watchClose(onclose: () => void): () => void {
  const Watcher = (globalThis as { CloseWatcher?: CloseWatcherCtor }).CloseWatcher;
  if (typeof Watcher !== 'function') return () => {};
  let watcher: CloseWatcherLike | null = null;
  try {
    watcher = new Watcher();
  } catch {
    return () => {};
  }
  watcher.onclose = () => {
    watcher = null;
    onclose();
  };
  return () => {
    const w = watcher;
    watcher = null;
    if (w) {
      w.onclose = null;
      w.destroy();
    }
  };
}
