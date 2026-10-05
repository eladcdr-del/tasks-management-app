// Choosing several tasks on Home at once (feature "seat", B1). Module state: App.svelte reads
// `active` to move the bottom nav and the FAB out of the way while the selection's own action bar
// is up. Home owns the rest (it ends the mode when it goes away).
//
//   homeSelection.active                  the mode is on (rows show checkboxes)
//   homeSelection.ids / count / has(id)   what is chosen
//   start()                               the bar's "בחירה": the mode, nothing chosen yet
//   begin(id)                             a long press on a row: the mode, with that row chosen
//   toggle(id)                            a tap on a row while choosing
//   choose(ids) / release(ids)            "בחירת הכל" / "ניקוי הבחירה" over the visible list
//   keepOnly(ids)                         drops what left Home (deleted, done, filtered away)
//   exit()                                "ביטול", Escape, Back, after an action, leaving Home
//
// Predictable rule: only what Home lists can stay chosen. A tab or chip that hides a chosen task,
// or a task that disappears (done, deleted on another phone), lets it go.

import type { RowSelection } from '$components/task/selection';

export class HomeSelection implements RowSelection {
  active = $state(false);
  ids = $state.raw<ReadonlySet<string>>(new Set());
  readonly count: number = $derived(this.ids.size);

  has(id: string): boolean {
    return this.ids.has(id);
  }

  start(): void {
    this.active = true;
    this.ids = new Set();
  }

  begin(id: string): void {
    if (this.active) {
      if (!this.ids.has(id)) this.ids = new Set([...this.ids, id]);
      return;
    }
    this.active = true;
    this.ids = new Set([id]);
  }

  toggle(id: string): void {
    if (!this.active) return;
    const next = new Set(this.ids);
    if (!next.delete(id)) next.add(id);
    this.ids = next;
  }

  /** Adds every one of `ids` (the visible list's "בחירת הכל"). */
  choose(ids: Iterable<string>): void {
    if (!this.active) return;
    this.ids = new Set([...this.ids, ...ids]);
  }

  /** Lets go of every one of `ids`. */
  release(ids: Iterable<string>): void {
    const drop = new Set(ids);
    const next = [...this.ids].filter((id) => !drop.has(id));
    if (next.length !== this.ids.size) this.ids = new Set(next);
  }

  /** Keeps only what is in `ids` (what Home still lists). */
  keepOnly(ids: Iterable<string>): void {
    const keep = new Set(ids);
    const next = [...this.ids].filter((id) => keep.has(id));
    if (next.length !== this.ids.size) this.ids = new Set(next);
  }

  exit(): void {
    if (!this.active && this.ids.size === 0) return;
    this.active = false;
    this.ids = new Set();
  }
}

export const homeSelection = new HomeSelection();
