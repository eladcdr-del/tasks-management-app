// Treat jar math (Blueprint §3 "Domain rules", goal modes). All functions are pure, never mutate
// their input and accept `null` (a household with no jar yet) by passing it through.
//
// Two goals:
//  - 'together' (the classic jar; a jar without `mode`): `target` completions in total, by anyone.
//    `count` is that total. It may run past `target`: the surplus carries into the next round.
//  - 'each' ("כל אחד תורם"): every CURRENT member closes their `share`; the treat unlocks only when
//    everyone has done their part. The source of truth is `counts` (completions per member this
//    round). `count` = Σ min(counts[u], share) is kept for the previous app version, which shows
//    "count of target" (`target` = share × members, see eachTarget). Completions past one's share
//    are recorded in `counts` and shown as a shared bonus; they never carry over.
//
// `counts` is kept in both modes (who took part, marble colours). It may be missing (a jar set up
// before goal modes, or completions made by the previous app version): a missing entry is 0.
// Members are always the household's CURRENT memberIds: someone who joins mid-round has a part
// too; someone who leaves no longer has one (and their marbles leave the jar's progress).
// Firestore rules mirror isFull exactly (firestore.rules jarFull), so the client never offers a
// redeem the server would refuse.

import type { Household, JarMode, Millis, Task, TreatJar } from './types';

export const SHARE_MIN = 1;
export const SHARE_MAX = 20;
export const DEFAULT_SHARE = 5;
export const TARGET_MIN = 3;
export const TARGET_MAX = 50;
export const DEFAULT_TARGET = 10;
/** New jars and new rounds start in this mode (the setup sheet's default). */
export const DEFAULT_MODE: JarMode = 'each';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const whole = (n: unknown): number =>
  typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;

export function modeOf(jar: TreatJar): JarMode {
  return jar.mode === 'each' ? 'each' : 'together';
}

/** Each member's part in 'each' mode (a missing or broken share reads as the default). */
export function shareOf(jar: TreatJar): number {
  const s = jar.share;
  return typeof s === 'number' && Number.isInteger(s) && s >= SHARE_MIN
    ? Math.min(s, SHARE_MAX)
    : DEFAULT_SHARE;
}

/** Completions recorded for `uid` this round (0 when none were recorded). */
export function tallyOf(jar: TreatJar, uid: string | null | undefined): number {
  return uid ? whole(jar.counts?.[uid]) : 0;
}

/** The `target` an 'each' jar stores for the previous app version: share × members, in 3..50. */
export function eachTarget(share: number, memberCount: number): number {
  return clamp(Math.round(share) * Math.max(1, Math.round(memberCount)), TARGET_MIN, TARGET_MAX);
}

/** Completions that fill the jar: `target` together, share × members each. */
export function required(jar: TreatJar | null, memberIds: readonly string[]): number {
  if (jar === null) return 0;
  return modeOf(jar) === 'each' ? shareOf(jar) * memberIds.length : jar.target;
}

/** Completions that count toward filling it, capped at `required`. */
export function filled(jar: TreatJar | null, memberIds: readonly string[]): number {
  if (jar === null) return 0;
  if (modeOf(jar) === 'together') return clamp(whole(jar.count), 0, jar.target);
  const share = shareOf(jar);
  return memberIds.reduce((sum, uid) => sum + Math.min(tallyOf(jar, uid), share), 0);
}

export function isFull(jar: TreatJar | null, memberIds: readonly string[]): boolean {
  if (jar === null) return false;
  if (modeOf(jar) === 'together') return jar.count >= jar.target;
  const share = shareOf(jar);
  return memberIds.length > 0 && memberIds.every((uid) => tallyOf(jar, uid) >= share);
}

/** Completions still needed to fill the jar (0 once full). */
export function remaining(jar: TreatJar | null, memberIds: readonly string[]): number {
  return Math.max(0, required(jar, memberIds) - filled(jar, memberIds));
}

/** Fraction filled, 0..1. */
export function progress(jar: TreatJar | null, memberIds: readonly string[]): number {
  const need = required(jar, memberIds);
  return need <= 0 ? 0 : clamp(filled(jar, memberIds) / need, 0, 1);
}

/** Completions past the goal: past the target together; past each member's share each. */
export function bonusOf(jar: TreatJar | null, memberIds: readonly string[]): number {
  if (jar === null) return 0;
  if (modeOf(jar) === 'together') return Math.max(0, whole(jar.count) - jar.target);
  const share = shareOf(jar);
  return memberIds.reduce((sum, uid) => sum + Math.max(0, tallyOf(jar, uid) - share), 0);
}

/** One member's part of an 'each' jar. */
export interface JarPart {
  uid: string;
  /** Completions toward the share (capped at it). */
  done: number;
  share: number;
  complete: boolean;
  /** Completions past the share this round. */
  extra: number;
}

/** Every current member's part, in `memberIds` order ('each' mode; [] for together). */
export function partsOf(jar: TreatJar | null, memberIds: readonly string[]): JarPart[] {
  if (jar === null || modeOf(jar) !== 'each') return [];
  const share = shareOf(jar);
  return memberIds.map((uid) => {
    const n = tallyOf(jar, uid);
    return {
      uid,
      done: Math.min(n, share),
      share,
      complete: n >= share,
      extra: Math.max(0, n - share)
    };
  });
}

/** The members who closed at least one task this round (counts > 0), in `memberIds` order. */
export function contributors(
  jar: Pick<TreatJar, 'counts'> | null,
  memberIds: readonly string[]
): string[] {
  return jar === null ? [] : memberIds.filter((uid) => whole(jar.counts?.[uid]) > 0);
}

/**
 * What `uid` completing a task adds: their tally always +1; `count` +1 together, and in 'each'
 * mode only while they are below their share (= the completion fills the jar).
 */
export function completionStep(jar: TreatJar, uid: string): { count: 0 | 1 } {
  return { count: modeOf(jar) === 'together' || tallyOf(jar, uid) < shareOf(jar) ? 1 : 0 };
}

/** A task was completed by `uid`. */
export function applyCompletion(jar: TreatJar | null, uid: string): TreatJar | null {
  if (jar === null) return null;
  return {
    ...jar,
    count: whole(jar.count) + completionStep(jar, uid).count,
    counts: { ...jar.counts, [uid]: tallyOf(jar, uid) + 1 }
  };
}

/**
 * What undoing a completion by `completer` takes back, exactly what it added in aggregate:
 *  - tally −1 when the completer is a current member with a recorded tally (the rules let a reopen
 *    lower only a current member's entry);
 *  - count −1 when that completion counted (always together; in 'each' mode unless it was past
 *    the completer's share, i.e. a bonus) and the count is above 0. A completion the previous app
 *    version made has no tally: it only counted.
 */
export function reopenStep(
  jar: TreatJar,
  completer: string | null,
  memberIds: readonly string[]
): { tally: 0 | -1; count: 0 | -1 } {
  const n = tallyOf(jar, completer);
  const tally = completer !== null && memberIds.includes(completer) && n > 0 ? -1 : 0;
  const counted = modeOf(jar) === 'together' || n <= shareOf(jar);
  return { tally, count: counted && whole(jar.count) > 0 ? -1 : 0 };
}

/** A completed task (closed by `completer`) was reopened. */
export function applyReopen(
  jar: TreatJar | null,
  completer: string | null,
  memberIds: readonly string[]
): TreatJar | null {
  if (jar === null) return null;
  const step = reopenStep(jar, completer, memberIds);
  if (step.tally === 0 && step.count === 0) return { ...jar };
  const out: TreatJar = { ...jar, count: whole(jar.count) + step.count };
  if (step.tally !== 0 && completer !== null) {
    out.counts = { ...jar.counts, [completer]: tallyOf(jar, completer) - 1 };
  }
  return out;
}

/**
 * The treat was redeemed: the round advances, the clock restarts and the tallies start over.
 * Together, the surplus carries over (as before goal modes); each, everyone starts from 0.
 */
export function applyRedeem(jar: TreatJar | null, now: Date | Millis): TreatJar | null {
  if (jar === null) return null;
  return {
    ...jar,
    count: modeOf(jar) === 'each' ? 0 : Math.max(0, whole(jar.count) - jar.target),
    counts: {},
    round: jar.round + 1,
    startedAt: typeof now === 'number' ? now : now.getTime()
  };
}

/**
 * Deleting the jar (deleteJar): the jar goes, and the household remembers the round a new jar
 * starts at, `nextJarRound` = the deleted round + 1. Round numbers only go up and none is ever
 * used twice: every earlier round may have a treat in the history (treats/{round}), and each round
 * names one jar for good (what a device remembers per round, like a celebration, stays right).
 * The earned treats stay.
 */
export function jarDeletion(jar: TreatJar): { jar: null; nextJarRound: number } {
  return { jar: null, nextJarRound: Math.max(1, Math.floor(whole(jar.round))) + 1 };
}

/**
 * The round a new jar starts at (setJar on a household without one): `nextJarRound` when a jar
 * was deleted (the round after it), else 1. The rules require exactly this (firestore.rules jarTransitionOk), so a
 * new jar's treats/{round} can never collide with an earned treat.
 */
export function freshJarRound(h: Pick<Household, 'nextJarRound'> | null | undefined): number {
  const r = h?.nextJarRound;
  return typeof r === 'number' && Number.isInteger(r) && r >= 1 ? r : 1;
}

/** The settings a member chooses in the setup sheet. A legacy `{treat, target}` is 'together'. */
export type JarSettings =
  | { treat: string; target: number; mode?: 'together' }
  | { treat: string; mode: 'each'; share: number };

/** Settings as stored: treat trimmed, mode explicit, target always set (eachTarget for 'each'). */
export interface CleanJarSettings {
  treat: string;
  mode: JarMode;
  target: number;
  share?: number;
}

/**
 * Validates and normalises jar settings for a household of `memberCount` members. Returns the
 * reason in plain English on failure (the adapters wrap it in their own error).
 */
export function cleanJarSettings(
  s: JarSettings,
  memberCount: number
): { ok: true; value: CleanJarSettings } | { ok: false; reason: string } {
  const treat = typeof s?.treat === 'string' ? s.treat.trim() : '';
  if (treat.length < 1 || treat.length > 60)
    return { ok: false, reason: 'treat must be 1-60 characters' };
  if (s.mode === 'each') {
    const share = s.share;
    if (!Number.isInteger(share) || share < SHARE_MIN || share > SHARE_MAX) {
      return {
        ok: false,
        reason: `share must be a whole number from ${SHARE_MIN} to ${SHARE_MAX}`
      };
    }
    return {
      ok: true,
      value: { treat, mode: 'each', share, target: eachTarget(share, memberCount) }
    };
  }
  const mode: string | undefined = s.mode;
  if (mode !== undefined && mode !== 'together') return { ok: false, reason: 'unknown jar mode' };
  const target = s.target;
  if (!Number.isInteger(target) || target < TARGET_MIN || target > TARGET_MAX) {
    return {
      ok: false,
      reason: `target must be a whole number from ${TARGET_MIN} to ${TARGET_MAX}`
    };
  }
  return { ok: true, value: { treat, mode: 'together', target } };
}

/**
 * Switching a jar to 'each' mid-round: completions the jar counted but nobody's tally recorded
 * (closed before goal modes, or by the previous app version) are attributed to whoever closed
 * them, from this round's done tasks, so nobody's part starts from zero. Never lowers a tally,
 * and adds at most `count − Σ tallies` (the rules allow exactly that). Returns the new counts,
 * or null when there is nothing to attribute.
 */
export function backfillCounts(
  jar: TreatJar,
  memberIds: readonly string[],
  doneTasks: readonly Pick<Task, 'completedAt' | 'completedBy'>[]
): Record<string, number> | null {
  const tracked = memberIds.reduce((sum, uid) => sum + tallyOf(jar, uid), 0);
  let budget = whole(jar.count) - tracked;
  if (budget <= 0) return null;
  const seen = new Map<string, number>();
  for (const t of doneTasks) {
    if (t.completedAt === null || t.completedAt < jar.startedAt || !t.completedBy) continue;
    if (!memberIds.includes(t.completedBy)) continue;
    seen.set(t.completedBy, (seen.get(t.completedBy) ?? 0) + 1);
  }
  const out: Record<string, number> = { ...jar.counts };
  let changed = false;
  for (const uid of memberIds) {
    const add = Math.min(budget, Math.max(0, (seen.get(uid) ?? 0) - tallyOf(jar, uid)));
    if (add <= 0) continue;
    out[uid] = tallyOf(jar, uid) + add;
    budget -= add;
    changed = true;
  }
  return changed ? out : null;
}

/**
 * Whether `next` is an acceptable backfill of `jar`'s tallies (firestore.rules retallyOk): only
 * current members' entries change, none goes down, all are whole numbers, and the members' tallies
 * add up to no more than the jar's count.
 */
export function backfillAllowed(
  jar: TreatJar,
  memberIds: readonly string[],
  next: Record<string, number>
): boolean {
  const keys = new Set([...Object.keys(jar.counts ?? {}), ...Object.keys(next)]);
  for (const k of keys) {
    const before = jar.counts?.[k];
    const after = next[k];
    if (before === after) continue;
    if (!memberIds.includes(k)) return false;
    if (typeof after !== 'number' || !Number.isInteger(after) || after < tallyOf(jar, k)) {
      return false;
    }
  }
  const sum = memberIds.reduce((s, uid) => s + whole(next[uid]), 0);
  return sum <= whole(jar.count);
}

/** What the people who completed tasks see right after a completion (CompleteSheet). */
export type CompletionMoment = 'filled' | 'shareDone' | null;

/**
 * The jar moment of `uid`'s completion: the jar filled, or (each mode) `uid` just closed their
 * part. `before` is the jar as it was before the completion.
 */
export function completionMoment(
  before: TreatJar | null,
  uid: string | null,
  memberIds: readonly string[],
  jarFilled: boolean
): CompletionMoment {
  if (jarFilled) return 'filled';
  if (before === null || uid === null || modeOf(before) !== 'each') return null;
  if (!memberIds.includes(uid)) return null;
  return tallyOf(before, uid) + 1 === shareOf(before) ? 'shareDone' : null;
}
