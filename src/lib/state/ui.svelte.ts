// UI state (step 2.4): the snackbar queue, and RepoError → Hebrew message.
//
//   ui.current                              the snackbar to show (SnackbarHost, 3.1), or null
//   ui.show(message, { action, onAction })  queue one; returns its id
//   ui.dismiss(id?)                         remove it (default: the current one)
//   ui.pushError(e)                         a RepoError (or anything thrown) as a snackbar
//
// The queue is presentation-free: the Snackbar primitive (1.4) runs the 5-second timer (pausing
// while touched) and calls onDismiss, which the host maps to `ui.dismiss(snack.id)`. Queued writes
// that fail later (repo.onWriteError) arrive here through bindRepo().

import { RepoError, type Repository } from '$lib/data/repository';
import type { Unsubscribe } from '$lib/domain/types';
import { he } from '$lib/i18n/he';

export interface Snack {
  id: number;
  message: string;
  /** Action label, e.g. he.common.undo. */
  action?: string;
  onAction?: () => void;
  /** Auto-dismiss delay for the Snackbar primitive (default 5000; 0 keeps it). */
  duration?: number;
}

export type SnackOptions = Omit<Snack, 'id' | 'message'>;

/** Hebrew text for an error: `he.errors[code]` when step 2.2 provides one, else the generic line. */
export function errorMessage(e: unknown): string {
  const table: Partial<Record<string, string>> = he.errors;
  const code = e instanceof RepoError ? e.code : 'unknown';
  return table[code] ?? he.errors.generic;
}

export class UiStore {
  /** Waiting snackbars, oldest first; the first one is on screen. */
  queue = $state.raw<readonly Snack[]>([]);
  readonly current: Snack | null = $derived(this.queue[0] ?? null);

  #nextId = 1;
  #unbindRepo: Unsubscribe | null = null;

  show(message: string, opts: SnackOptions = {}): number {
    const snack: Snack = { id: this.#nextId++, message, ...opts };
    this.queue = [...this.queue, snack];
    return snack.id;
  }

  /** Removes a snackbar (default: the one on screen). Unknown ids are ignored. */
  dismiss(id: number | undefined = this.current?.id): void {
    if (id === undefined) return;
    const next = this.queue.filter((s) => s.id !== id);
    if (next.length !== this.queue.length) this.queue = next;
  }

  /** Shows an error. The same message already waiting (an offline burst) is not queued twice. */
  pushError(e: unknown): number {
    if (!(e instanceof RepoError)) console.error('[homecare]', e);
    const message = errorMessage(e);
    const waiting = this.queue.find((s) => s.message === message && s.action === undefined);
    return waiting ? waiting.id : this.show(message);
  }

  /** Routes the repository's asynchronous write failures to the snackbar. */
  bindRepo(repo: Repository): void {
    this.unbindRepo();
    this.#unbindRepo = repo.onWriteError((e) => this.pushError(e));
  }

  unbindRepo(): void {
    this.#unbindRepo?.();
    this.#unbindRepo = null;
  }
}

export const ui = new UiStore();
