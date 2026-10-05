import { describe, expect, it } from 'vitest';
import {
  applyCompletion,
  applyRedeem,
  applyReopen,
  backfillAllowed,
  backfillCounts,
  bonusOf,
  cleanJarSettings,
  completionMoment,
  completionStep,
  contributors,
  eachTarget,
  filled,
  isFull,
  modeOf,
  partsOf,
  progress,
  remaining,
  reopenStep,
  required,
  shareOf,
  tallyOf
} from './jar';
import type { TreatJar } from './types';

const M = 'michal';
const D = 'dani';
const N = 'noa';
const TWO = [M, D];

/** A classic jar as stored before goal modes: no mode, no counts. */
const jar = (over: Partial<TreatJar> = {}): TreatJar => ({
  treat: 'ארוחה במסעדה',
  target: 10,
  count: 7,
  round: 1,
  startedAt: 1_000,
  ...over
});

/** "Everyone does their part": 5 each, מיכל at 4, דני at 3. */
const each = (over: Partial<TreatJar> = {}): TreatJar =>
  jar({ mode: 'each', share: 5, target: 10, counts: { [M]: 4, [D]: 3 }, ...over });

describe('modes and fields', () => {
  it('a jar without mode is "together"; share and tallies have safe defaults', () => {
    expect(modeOf(jar())).toBe('together');
    expect(modeOf(each())).toBe('each');
    expect(shareOf(jar())).toBe(5);
    expect(shareOf(each({ share: 7 }))).toBe(7);
    expect(shareOf(each({ share: 0 }))).toBe(5);
    expect(shareOf(each({ share: 2.5 }))).toBe(5);
    expect(tallyOf(jar(), M)).toBe(0);
    expect(tallyOf(each(), M)).toBe(4);
    expect(tallyOf(each({ counts: { [M]: -3 } }), M)).toBe(0);
    expect(tallyOf(each(), null)).toBe(0);
  });

  it('eachTarget is share × members, within the 3..50 the previous version accepts', () => {
    expect(eachTarget(5, 2)).toBe(10);
    expect(eachTarget(1, 2)).toBe(3);
    expect(eachTarget(20, 6)).toBe(50);
    expect(eachTarget(4, 0)).toBe(4);
  });
});

describe('together (the classic jar)', () => {
  it('is full only when count reaches the target', () => {
    expect(isFull(jar({ count: 9 }), TWO)).toBe(false);
    expect(isFull(jar({ count: 10 }), TWO)).toBe(true);
    expect(isFull(jar({ count: 12 }), TWO)).toBe(true);
  });

  it('remaining is target minus count, never below zero', () => {
    expect(remaining(jar({ count: 7 }), TWO)).toBe(3);
    expect(remaining(jar({ count: 13 }), TWO)).toBe(0);
  });

  it('progress is the 0..1 fraction, clamped; required/filled follow the target', () => {
    expect(progress(jar({ count: 0 }), TWO)).toBe(0);
    expect(progress(jar({ count: 5 }), TWO)).toBe(0.5);
    expect(progress(jar({ count: 14 }), TWO)).toBe(1);
    expect(required(jar(), TWO)).toBe(10);
    expect(filled(jar({ count: 14 }), TWO)).toBe(10);
    expect(bonusOf(jar({ count: 14 }), TWO)).toBe(4);
  });

  it('ignores who is a member (any completion counts)', () => {
    expect(isFull(jar({ count: 10 }), [])).toBe(true);
  });

  it('a completion adds one marble and records who, without mutating the input', () => {
    const before = jar({ count: 7 });
    const after = applyCompletion(before, M);
    expect(after).toEqual({ ...before, count: 8, counts: { [M]: 1 } });
    expect(before.count).toBe(7);
    expect(before.counts).toBeUndefined();
    expect(applyCompletion(after, M)?.counts).toEqual({ [M]: 2 });
  });

  it('keeps counting past the target so the surplus carries to the next round', () => {
    expect(applyCompletion(jar({ count: 10 }), D)?.count).toBe(11);
    expect(completionStep(jar({ count: 10 }), D)).toEqual({ count: 1 });
  });

  it('a reopen takes one marble out, and the tally when one was recorded', () => {
    const j = jar({ count: 7, counts: { [M]: 2 } });
    expect(applyReopen(j, M, TWO)).toEqual({ ...j, count: 6, counts: { [M]: 1 } });
    // A completion the previous version made: no tally, the count still goes down.
    expect(applyReopen(jar({ count: 7 }), D, TWO)).toEqual(jar({ count: 6 }));
  });

  it('a reopen floors at zero', () => {
    expect(applyReopen(jar({ count: 0 }), M, TWO)?.count).toBe(0);
    expect(reopenStep(jar({ count: 0 }), M, TWO)).toEqual({ tally: 0, count: 0 });
  });

  it('redeem starts a new round, carrying the surplus and clearing the tallies', () => {
    const after = applyRedeem(jar({ count: 12, round: 3, counts: { [M]: 8, [D]: 4 } }), 9_999);
    expect(after).toEqual({
      treat: 'ארוחה במסעדה',
      target: 10,
      count: 2,
      counts: {},
      round: 4,
      startedAt: 9_999
    });
  });

  it('redeem lands on exactly 0 when exactly full, never negative, accepts a Date', () => {
    expect(applyRedeem(jar({ count: 10 }), 5)?.count).toBe(0);
    expect(applyRedeem(jar({ count: 4 }), 5)?.count).toBe(0);
    expect(applyRedeem(jar({ count: 10 }), new Date(9_999))?.startedAt).toBe(9_999);
  });

  it('redeem does not mutate the input', () => {
    const before = jar({ count: 10, counts: { [M]: 10 } });
    applyRedeem(before, 5);
    expect(before.round).toBe(1);
    expect(before.count).toBe(10);
    expect(before.counts).toEqual({ [M]: 10 });
  });

  it('has no per-member parts', () => {
    expect(partsOf(jar(), TWO)).toEqual([]);
  });
});

describe('each ("כל אחד תורם")', () => {
  it('fills from every current member’s part, capped at the share', () => {
    expect(required(each(), TWO)).toBe(10);
    expect(filled(each(), TWO)).toBe(7);
    expect(remaining(each(), TWO)).toBe(3);
    expect(progress(each(), TWO)).toBe(0.7);
    // מיכל did 9: only 5 fill the jar, 4 are a bonus.
    const busy = each({ counts: { [M]: 9, [D]: 3 } });
    expect(filled(busy, TWO)).toBe(8);
    expect(bonusOf(busy, TWO)).toBe(4);
    expect(isFull(busy, TWO)).toBe(false);
  });

  it('is full only when EVERY current member has done their part', () => {
    expect(isFull(each({ counts: { [M]: 5, [D]: 4 } }), TWO)).toBe(false);
    expect(isFull(each({ counts: { [M]: 5, [D]: 5 } }), TWO)).toBe(true);
    expect(isFull(each({ counts: { [M]: 7, [D]: 6 } }), TWO)).toBe(true);
    // The stored count does not matter in this mode (the previous version may have moved it).
    expect(isFull(each({ count: 0, counts: { [M]: 5, [D]: 5 } }), TWO)).toBe(true);
    expect(isFull(each({ count: 40, counts: { [M]: 5 } }), TWO)).toBe(false);
  });

  it('a member who joins mid-round has a part too; one who leaves no longer counts', () => {
    const j = each({ counts: { [M]: 5, [D]: 5 } });
    expect(isFull(j, [M, D, N])).toBe(false);
    expect(required(j, [M, D, N])).toBe(15);
    expect(remaining(j, [M, D, N])).toBe(5);
    // דני left: מיכל's part alone fills it; דני's marbles leave the progress.
    expect(isFull(each({ counts: { [M]: 5, [D]: 1 } }), [M])).toBe(true);
    expect(filled(each({ counts: { [M]: 3, [D]: 5 } }), [M])).toBe(3);
  });

  it('a household with no members is never full', () => {
    expect(isFull(each({ counts: {} }), [])).toBe(false);
  });

  it('parts: done (capped), complete and extra, in member order', () => {
    expect(partsOf(each({ counts: { [M]: 7, [D]: 3 } }), [D, M])).toEqual([
      { uid: D, done: 3, share: 5, complete: false, extra: 0 },
      { uid: M, done: 5, share: 5, complete: true, extra: 2 }
    ]);
    expect(partsOf(each({ counts: undefined }), [M])).toEqual([
      { uid: M, done: 0, share: 5, complete: false, extra: 0 }
    ]);
  });

  it('a completion fills the jar only while the completer is below their share', () => {
    expect(completionStep(each(), M)).toEqual({ count: 1 }); // 4 → 5
    const done = each({ counts: { [M]: 5, [D]: 3 }, count: 8 });
    expect(completionStep(done, M)).toEqual({ count: 0 }); // a bonus
    expect(applyCompletion(done, M)).toEqual({ ...done, counts: { [M]: 6, [D]: 3 } });
    expect(applyCompletion(each(), D)).toEqual(each({ count: 8, counts: { [M]: 4, [D]: 4 } }));
  });

  it('count stays Σ min(counts, share) through completions and reopens', () => {
    let j: TreatJar = each({ count: 0, counts: {} });
    const steps: [string, 'c' | 'r'][] = [
      [M, 'c'],
      [M, 'c'],
      [D, 'c'],
      [M, 'c'],
      [M, 'c'],
      [M, 'c'],
      [M, 'c'], // 6th: bonus
      [M, 'r'], // undo the bonus
      [D, 'r'],
      [M, 'r']
    ];
    for (const [uid, op] of steps) {
      j = (op === 'c' ? applyCompletion(j, uid) : applyReopen(j, uid, TWO))!;
      const sum = TWO.reduce((s, u) => s + Math.min(tallyOf(j, u), 5), 0);
      expect(j.count).toBe(sum);
    }
    expect(j.counts).toEqual({ [M]: 4, [D]: 0 });
  });

  it('a reopen reverses exactly what the completion added', () => {
    const below = each(); // מיכל 4 of 5: her completions counted
    expect(reopenStep(below, M, TWO)).toEqual({ tally: -1, count: -1 });
    const past = each({ counts: { [M]: 6, [D]: 3 }, count: 8 }); // her 6th was a bonus
    expect(reopenStep(past, M, TWO)).toEqual({ tally: -1, count: 0 });
    expect(applyReopen(past, M, TWO)).toEqual({ ...past, counts: { [M]: 5, [D]: 3 } });
  });

  it('reopening someone else’s completion lowers THEIR tally', () => {
    expect(applyReopen(each(), D, TWO)?.counts).toEqual({ [M]: 4, [D]: 2 });
  });

  it('a former member’s tally is left alone (only the count moves back)', () => {
    expect(reopenStep(each(), D, [M])).toEqual({ tally: 0, count: -1 });
    expect(applyReopen(each(), D, [M])).toEqual(each({ count: 6 }));
  });

  it('a completion by the previous version (no tally) only takes the count back', () => {
    expect(reopenStep(each({ counts: { [M]: 4 } }), D, TWO)).toEqual({ tally: 0, count: -1 });
    expect(applyReopen(each({ count: 0, counts: {} }), D, TWO)).toEqual(
      each({ count: 0, counts: {} })
    );
  });

  it('redeem: everyone starts from zero (no carry-over), the round advances', () => {
    expect(applyRedeem(each({ counts: { [M]: 9, [D]: 5 }, count: 10, round: 3 }), 77)).toEqual(
      each({ count: 0, counts: {}, round: 4, startedAt: 77 })
    );
  });
});

describe('contributors', () => {
  it('lists the current members with at least one completion this round', () => {
    expect(contributors(each({ counts: { [M]: 0, [D]: 2, [N]: 1 } }), [M, D])).toEqual([D]);
    expect(contributors(jar(), TWO)).toEqual([]);
    expect(contributors(null, TWO)).toEqual([]);
  });
});

describe('null passes through', () => {
  it('every function handles a household without a jar', () => {
    expect(isFull(null, TWO)).toBe(false);
    expect(remaining(null, TWO)).toBe(0);
    expect(progress(null, TWO)).toBe(0);
    expect(required(null, TWO)).toBe(0);
    expect(filled(null, TWO)).toBe(0);
    expect(bonusOf(null, TWO)).toBe(0);
    expect(partsOf(null, TWO)).toEqual([]);
    expect(applyCompletion(null, M)).toBeNull();
    expect(applyReopen(null, M, TWO)).toBeNull();
    expect(applyRedeem(null, 5)).toBeNull();
  });

  it('a degenerate target reads as no progress', () => {
    expect(progress(jar({ target: 0, count: 3 }), TWO)).toBe(0);
  });
});

describe('cleanJarSettings', () => {
  it('a legacy {treat, target} is together; the treat is trimmed', () => {
    expect(cleanJarSettings({ treat: '  סרט  ', target: 12 }, 2)).toEqual({
      ok: true,
      value: { treat: 'סרט', mode: 'together', target: 12 }
    });
  });

  it('each: share 1..20, target = share × members for the previous version', () => {
    expect(cleanJarSettings({ treat: 'גלידה', mode: 'each', share: 5 }, 3)).toEqual({
      ok: true,
      value: { treat: 'גלידה', mode: 'each', share: 5, target: 15 }
    });
  });

  it.each([
    [{ treat: '', target: 10 }],
    [{ treat: 'ת'.repeat(61), target: 10 }],
    [{ treat: 'סרט', target: 2 }],
    [{ treat: 'סרט', target: 51 }],
    [{ treat: 'סרט', target: 7.5 }],
    [{ treat: 'סרט', mode: 'each', share: 0 }],
    [{ treat: 'סרט', mode: 'each', share: 21 }],
    [{ treat: 'סרט', mode: 'each', share: 2.5 }],
    [{ treat: 'סרט', mode: 'sometimes', target: 10 }]
  ])('rejects %j', (s) => {
    expect(cleanJarSettings(s as never, 2).ok).toBe(false);
  });
});

describe('backfillCounts (switching to each mid-round)', () => {
  const done = (by: string, at: number) => ({ completedBy: by, completedAt: at });

  it('attributes this round’s untracked completions to whoever closed them', () => {
    const j = jar({ count: 5, startedAt: 100 });
    const tasks = [
      done(M, 150),
      done(D, 160),
      done(M, 170),
      done(M, 50 /* last round */),
      done(D, 180)
    ];
    expect(backfillCounts(j, TWO, tasks)).toEqual({ [M]: 2, [D]: 2 });
  });

  it('never lowers a tally, and adds no more than the jar counted', () => {
    const j = jar({ count: 3, startedAt: 100, counts: { [M]: 2 } });
    const tasks = [done(M, 150), done(M, 151), done(M, 152), done(D, 153), done(D, 154)];
    // budget 3 − 2 = 1: מיכל (2 recorded, 3 seen) gets it; nothing is left for דני.
    expect(backfillCounts(j, TWO, tasks)).toEqual({ [M]: 3 });
  });

  it('returns null when everything is already attributed or nothing is known', () => {
    expect(backfillCounts(jar({ count: 2, counts: { [M]: 2 } }), TWO, [done(D, 5_000)])).toBeNull();
    expect(backfillCounts(jar({ count: 4 }), TWO, [])).toBeNull();
    // Former members' completions are not attributed.
    expect(backfillCounts(jar({ count: 4 }), [M], [done(D, 5_000)])).toBeNull();
  });
});

describe("backfillAllowed (the rules' retally check)", () => {
  const j = jar({ count: 5, counts: { [M]: 1 } });

  it("accepts raising current members up to the jar's count", () => {
    expect(backfillAllowed(j, TWO, { [M]: 3, [D]: 2 })).toBe(true);
    expect(backfillAllowed(j, TWO, { [M]: 1, [D]: 4 })).toBe(true);
    expect(backfillAllowed(j, TWO, { [M]: 1 })).toBe(true); // unchanged
  });

  it('accepts what backfillCounts produces', () => {
    const legacy = jar({ count: 5, startedAt: 0 });
    const tasks = [M, M, D, M, D, D].map((by, i) => ({ completedBy: by, completedAt: 10 + i }));
    const next = backfillCounts(legacy, TWO, tasks)!;
    expect(next).toEqual({ [M]: 3, [D]: 2 });
    expect(backfillAllowed(legacy, TWO, next)).toBe(true);
  });

  it('rejects lowering, fractions, strangers and more than the count', () => {
    expect(backfillAllowed(j, TWO, { [M]: 0, [D]: 2 })).toBe(false);
    expect(backfillAllowed(j, TWO, { [M]: 1.5 })).toBe(false);
    expect(backfillAllowed(j, TWO, { [M]: 1, [N]: 1 })).toBe(false);
    expect(backfillAllowed(j, TWO, { [M]: 3, [D]: 3 })).toBe(false);
  });
});

describe('completionMoment', () => {
  it('the jar filling wins; otherwise each mode celebrates closing one’s part', () => {
    expect(completionMoment(each(), M, TWO, true)).toBe('filled');
    expect(completionMoment(each(), M, TWO, false)).toBe('shareDone'); // 4 → 5
    expect(completionMoment(each(), D, TWO, false)).toBeNull(); // 3 → 4
    expect(completionMoment(each({ counts: { [M]: 5 } }), M, TWO, false)).toBeNull(); // a bonus
    expect(completionMoment(jar(), M, TWO, false)).toBeNull();
    expect(completionMoment(null, M, TWO, false)).toBeNull();
    expect(completionMoment(each(), N, TWO, false)).toBeNull();
  });
});
