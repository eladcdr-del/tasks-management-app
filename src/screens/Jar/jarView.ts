// The Jar screen's words, decided apart from the markup (unit-tested).
//
// statusLine: the warm team line while the jar fills.
//   together                 "עוד 3 משימות ואנחנו בצ׳ופר"
//   each, one or two parts   "עוד משימה אחת שלך ו־2 משימות של דני, ואנחנו בצ׳ופר" (me first: owning
//                            my part comes before anyone else's; nobody is ranked)
//   each, three or more      the total, like together
// seen: how many marbles this device has already shown for the round (the rest drop in).

import type { TreatJar } from '$lib/domain/types';
import { isFull, modeOf, partsOf, remaining } from '$lib/domain/jar';
import { he } from '$lib/i18n/he';
import type { JarLeft } from '$lib/i18n/he/jar';

export function statusLine(
  jar: TreatJar | null,
  memberIds: readonly string[],
  me: string | null,
  nameOf: (uid: string) => string
): string {
  if (jar === null || isFull(jar, memberIds)) return '';
  const t = he.jar.status;
  if (modeOf(jar) === 'together') return t.total(remaining(jar, memberIds));
  const open = partsOf(jar, memberIds)
    .filter((p) => !p.complete)
    .sort((a, b) => (a.uid === me ? -1 : b.uid === me ? 1 : 0));
  if (open.length === 0 || open.length > 2) return t.total(remaining(jar, memberIds));
  const left: JarLeft[] = open.map((p) => ({
    name: p.uid === me ? null : nameOf(p.uid),
    left: p.share - p.done
  }));
  return t.parts(left);
}

const SEEN_KEY = 'homecare.jar.seen';

/** Marbles this device already showed in `round` (Infinity when unknown: nothing drops in). */
export function readSeen(hid: string, round: number): number {
  try {
    const v = localStorage.getItem(`${SEEN_KEY}.${hid}`);
    if (v === null) return Number.POSITIVE_INFINITY;
    const [r, n] = v.split(':').map(Number);
    if (r !== round) return 0; // a new round: whatever is in it is new to me
    return Number.isFinite(n) ? n! : Number.POSITIVE_INFINITY;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function writeSeen(hid: string, round: number, marbles: number): void {
  try {
    localStorage.setItem(`${SEEN_KEY}.${hid}`, `${round}:${marbles}`);
  } catch {
    // storage blocked: the next visit simply shows the jar without the drop-in
  }
}
