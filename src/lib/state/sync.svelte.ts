// Sync state (step 2.4) for the Header's SyncIndicator:
//   <SyncIndicator status={sync.status} pending={sync.pendingWrites} />
//
// Fed by repo.watchSync (bound per repository, any phase) and the browser's online/offline events.
// The demo adapter has no network, so it stays 'synced' even when the device is offline; for
// Firebase, a device that reports offline shows 'offline' whatever the last snapshot said.

import type { Repository } from '$lib/data/repository';
import type { SyncState, Unsubscribe } from '$lib/domain/types';

export class SyncStore {
  /** navigator.onLine, kept current by the online/offline events. */
  online = $state(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  #repoState = $state<SyncState>({ status: 'synced', pendingWrites: 0 });
  #kind = $state<Repository['kind'] | null>(null);

  readonly status: SyncState['status'] = $derived(
    !this.online && this.#kind === 'firebase' ? 'offline' : this.#repoState.status
  );
  readonly pendingWrites: number = $derived(this.#repoState.pendingWrites);

  #unsub: Unsubscribe | null = null;
  #onOnline = () => (this.online = true);
  #onOffline = () => (this.online = false);

  bindRepo(repo: Repository): void {
    this.unbindRepo();
    this.#kind = repo.kind;
    const unwatch = repo.watchSync((s) => (this.#repoState = s));
    const win = typeof window === 'undefined' ? null : window;
    win?.addEventListener('online', this.#onOnline);
    win?.addEventListener('offline', this.#onOffline);
    this.#unsub = () => {
      unwatch();
      win?.removeEventListener('online', this.#onOnline);
      win?.removeEventListener('offline', this.#onOffline);
    };
  }

  unbindRepo(): void {
    this.#unsub?.();
    this.#unsub = null;
    this.#kind = null;
    this.#repoState = { status: 'synced', pendingWrites: 0 };
  }
}

export const sync = new SyncStore();
