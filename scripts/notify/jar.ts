// The jar's fullness, exactly as the app decides it (src/lib/domain/jar.ts isFull) and the rules
// enforce it (firestore.rules jarFull). The notifier never imports from src/, so this mirrors it:
//   together (or no mode): count ≥ target
//   each:                  every CURRENT member closed their share (counts[uid] ≥ share)

import type { TreatJar } from './types.ts';

const DEFAULT_SHARE = 5;

export function jarIsFull(jar: TreatJar, memberIds: readonly string[]): boolean {
  if (jar.mode !== 'each') return jar.count >= jar.target;
  const share =
    typeof jar.share === 'number' && Number.isInteger(jar.share) && jar.share >= 1
      ? jar.share
      : DEFAULT_SHARE;
  return memberIds.length > 0 && memberIds.every((uid) => (jar.counts?.[uid] ?? 0) >= share);
}
