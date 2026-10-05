// What the jar shows (ProgressJar): one marble per completion this round, in the colour of whoever
// closed it, in the order the work happened, then a dashed outline per completion still needed.
// Pure, so it is unit-tested apart from the SVG.
//
//  - A completion done for someone who asked for it (requestedBy set and not the completer) is a
//    "help" marble: it carries a tiny heart. Visual only.
//  - Completions past the goal (together: past the target; each: past the completer's share) are
//    "bonus" marbles: they sit on top with a soft halo and leave no outline behind.
//  - The order comes from this round's done tasks (as far as they are loaded); older completions
//    the jar counted but no loaded task explains go first, in their member's colour when the
//    tallies tell whose they were.

import type { MemberColor, Task, TreatJar } from '$lib/domain/types';
import { filled, modeOf, required, shareOf, tallyOf } from '$lib/domain/jar';

export interface Marble {
  uid: string | null;
  color: MemberColor | null;
  help: boolean;
  bonus: boolean;
}

export interface JarPicture {
  marbles: Marble[];
  /** Outlines still to fill. */
  empty: number;
}

/** More than this many positions would make marbles too small to read: the extra bonus is not drawn. */
export const MAX_POSITIONS = 150;

type DoneTask = Pick<Task, 'completedAt' | 'completedBy' | 'requestedBy'>;

export function jarPicture(
  jar: TreatJar | null,
  memberIds: readonly string[],
  colorOf: (uid: string | null) => MemberColor | null,
  done: readonly DoneTask[]
): JarPicture {
  if (jar === null) return { marbles: [], empty: 0 };
  const each = modeOf(jar) === 'each';
  const need = required(jar, memberIds);
  const known = done
    .filter((t) => t.completedAt !== null && t.completedAt >= jar.startedAt)
    .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));

  /** The completions the jar holds, oldest first: [uid, help]. */
  const sequence: { uid: string | null; help: boolean }[] = [];
  const isHelp = (t: DoneTask) => t.requestedBy !== null && t.requestedBy !== t.completedBy;

  if (each) {
    // Every current member's tally, explained by their loaded done tasks where possible.
    const left = new Map(memberIds.map((uid) => [uid, tallyOf(jar, uid)]));
    const explained: { uid: string; help: boolean }[] = [];
    for (const t of known) {
      const uid = t.completedBy;
      if (uid === null || (left.get(uid) ?? 0) <= 0) continue;
      left.set(uid, (left.get(uid) ?? 0) - 1);
      explained.push({ uid, help: isHelp(t) });
    }
    sequence.push(...roundRobin(left).map((uid) => ({ uid, help: false })), ...explained);
  } else {
    const total = Math.max(0, Math.floor(jar.count));
    const recent = known.slice(-total);
    const left = new Map(memberIds.map((uid) => [uid, tallyOf(jar, uid)]));
    for (const t of recent) {
      if (t.completedBy && left.has(t.completedBy)) {
        left.set(t.completedBy, Math.max(0, (left.get(t.completedBy) ?? 0) - 1));
      }
    }
    const older = roundRobin(left).slice(0, Math.max(0, total - recent.length));
    const unknown = Math.max(0, total - recent.length - older.length);
    sequence.push(
      ...Array.from({ length: unknown }, (_, i) => ({
        uid: memberIds.length > 0 ? memberIds[i % memberIds.length]! : null,
        help: false
      })),
      ...older.map((uid) => ({ uid, help: false })),
      ...recent.map((t) => ({ uid: t.completedBy, help: isHelp(t) }))
    );
  }

  // Bonus: past each member's share (each), or past the target (together).
  const share = shareOf(jar);
  const perMember = new Map<string, number>();
  let marbles: Marble[] = sequence.map((m, i) => {
    let bonus: boolean;
    if (each) {
      const n = perMember.get(m.uid ?? '') ?? 0;
      perMember.set(m.uid ?? '', n + 1);
      bonus = n >= share;
    } else {
      bonus = i >= jar.target;
    }
    return { uid: m.uid, color: colorOf(m.uid), help: m.help, bonus };
  });

  const empty = Math.max(0, need - filled(jar, memberIds));
  const room = Math.max(0, MAX_POSITIONS - empty);
  if (marbles.length > room) {
    // Keep every marble that fills the jar; drop the newest bonus marbles that do not fit.
    let extra = marbles.length - room;
    marbles = marbles
      .slice()
      .reverse()
      .filter((m) => !(m.bonus && extra-- > 0))
      .reverse()
      .slice(0, room);
  }
  return { marbles, empty };
}

/** Interleaves members' remaining counts (a, b, a, b, a…) so unexplained marbles look mixed. */
function roundRobin(left: Map<string, number>): string[] {
  const queue = [...left.entries()].map(([uid, n]) => ({ uid, n: Math.max(0, n) }));
  const out: string[] = [];
  let more = true;
  while (more) {
    more = false;
    for (const q of queue) {
      if (q.n > 0) {
        out.push(q.uid);
        q.n--;
        more = true;
      }
    }
  }
  return out;
}

/** A marble position inside the jar (artwork units, 200 × 240 viewBox). */
export interface Slot {
  x: number;
  y: number;
  r: number;
}

// Interior of the jar body (artwork units).
const LEFT = 28;
const WIDTH = 144;
const BOTTOM = 222;
const HEIGHT = 150;

/**
 * `n` positions packed from the bottom of the jar up: rows alternate a half-step to one side with
 * a tiny deterministic wobble, so the pile looks settled, not gridded.
 */
export function jarSlots(n: number): Slot[] {
  const count = Math.max(1, Math.min(MAX_POSITIONS, Math.round(n)));
  let cols = 3;
  let r = 0;
  for (cols = 3; cols <= 16; cols++) {
    r = WIDTH / (2 * cols + 0.7);
    const rows = Math.ceil(count / cols);
    if (rows * 2 * r * 0.9 + r * 0.2 <= HEIGHT) break;
  }
  const out: Slot[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const wobble = (((i * 37) % 7) - 3) * 0.06 * r;
    const shift = row % 2 === 1 ? r * 0.7 : 0;
    out.push({
      x: LEFT + r + col * 2 * r + shift + wobble,
      y: BOTTOM - r - row * 2 * r * 0.9 + Math.abs(wobble) * 0.5,
      r: r * 0.94
    });
  }
  return out;
}
