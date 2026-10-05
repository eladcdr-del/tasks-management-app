import { describe, expect, it } from 'vitest';
import type { MemberColor, TreatJar } from '$lib/domain/types';
import { jarPicture, jarSlots, MAX_POSITIONS } from './marbles';

const M = 'michal';
const D = 'dani';
const TWO = [M, D];
const COLORS: Record<string, MemberColor> = { [M]: 'terracotta', [D]: 'slate' };
const colorOf = (uid: string | null) => (uid ? (COLORS[uid] ?? null) : null);

const jar = (over: Partial<TreatJar> = {}): TreatJar => ({
  treat: 'ארוחה במסעדה',
  target: 10,
  count: 0,
  round: 1,
  startedAt: 1_000,
  ...over
});
const each = (counts: Record<string, number>, share = 3) =>
  jar({ mode: 'each', share, target: share * 2, counts });
const done = (by: string, at: number, requestedBy: string | null = null) => ({
  completedBy: by,
  completedAt: at,
  requestedBy
});

describe('jarPicture: each', () => {
  it('one marble per completion in time order, outlines for what each part still needs', () => {
    const p = jarPicture(each({ [M]: 2, [D]: 1 }), TWO, colorOf, [
      done(D, 1_300),
      done(M, 1_100),
      done(M, 1_200)
    ]);
    expect(p.marbles.map((m) => m.uid)).toEqual([M, M, D]);
    expect(p.marbles.map((m) => m.color)).toEqual(['terracotta', 'terracotta', 'slate']);
    expect(p.empty).toBe(3);
  });

  it('a task done for whoever asked is a help marble', () => {
    const p = jarPicture(each({ [D]: 2 }), TWO, colorOf, [done(D, 1_100, M), done(D, 1_200, D)]);
    expect(p.marbles.map((m) => m.help)).toEqual([true, false]);
  });

  it('completions past one’s share are bonus marbles and leave no outline', () => {
    const p = jarPicture(each({ [M]: 5, [D]: 1 }), TWO, colorOf, []);
    expect(p.marbles.filter((m) => m.uid === M).map((m) => m.bonus)).toEqual([
      false,
      false,
      false,
      true,
      true
    ]);
    expect(p.empty).toBe(2); // only דני's part is missing
  });

  it('tallies with no loaded task go first, interleaved; ignores earlier rounds and strangers', () => {
    const p = jarPicture(each({ [M]: 3, [D]: 2, eve: 4 }), TWO, colorOf, [
      done(M, 500), // an earlier round
      done(D, 1_400)
    ]);
    expect(p.marbles.map((m) => m.uid)).toEqual([M, D, M, M, D]);
    expect(p.marbles.at(-1)).toMatchObject({ uid: D });
  });

  it('a member who joined has outlines; a former member’s marbles are not drawn', () => {
    expect(jarPicture(each({ [M]: 3 }), [M, D, 'noa'], colorOf, []).empty).toBe(6);
    expect(jarPicture(each({ [M]: 3, [D]: 3 }), [M], colorOf, []).marbles).toHaveLength(3);
  });
});

describe('jarPicture: together', () => {
  it('colours the loaded completions, and older ones by the tallies', () => {
    const j = jar({ count: 4, counts: { [M]: 2, [D]: 2 } });
    const p = jarPicture(j, TWO, colorOf, [done(M, 1_500), done(D, 1_600)]);
    expect(p.marbles.map((m) => m.uid)).toEqual([M, D, M, D]);
    expect(p.empty).toBe(6);
  });

  it('a jar from before tallies: unknown marbles cycle the household’s colours', () => {
    const p = jarPicture(jar({ count: 3 }), TWO, colorOf, []);
    expect(p.marbles.map((m) => m.color)).toEqual(['terracotta', 'slate', 'terracotta']);
  });

  it('keeps only as many loaded completions as the jar counts (the newest)', () => {
    const p = jarPicture(jar({ count: 1 }), TWO, colorOf, [done(M, 1_100), done(D, 1_200)]);
    expect(p.marbles.map((m) => m.uid)).toEqual([D]);
  });

  it('the surplus past the target is bonus', () => {
    const p = jarPicture(jar({ count: 12, target: 10 }), TWO, colorOf, []);
    expect(p.marbles.filter((m) => m.bonus)).toHaveLength(2);
    expect(p.empty).toBe(0);
  });

  it('no jar: nothing', () => {
    expect(jarPicture(null, TWO, colorOf, [])).toEqual({ marbles: [], empty: 0 });
  });
});

describe('jarPicture: capacity', () => {
  it('never draws more than MAX_POSITIONS, dropping the newest bonus first', () => {
    const p = jarPicture(
      jar({ mode: 'each', share: 20, target: 50, counts: { [M]: 200, [D]: 20 } }),
      TWO,
      colorOf,
      []
    );
    expect(p.marbles.length + p.empty).toBe(MAX_POSITIONS);
    expect(p.marbles.filter((m) => !m.bonus)).toHaveLength(40);
  });
});

describe('jarSlots', () => {
  it('packs every position inside the jar body, bottom up', () => {
    for (const n of [1, 3, 10, 30, 60, 120, MAX_POSITIONS]) {
      const slots = jarSlots(n);
      expect(slots).toHaveLength(n);
      for (const s of slots) {
        expect(s.x - s.r).toBeGreaterThanOrEqual(25);
        expect(s.x + s.r).toBeLessThanOrEqual(177);
        expect(s.y + s.r).toBeLessThanOrEqual(224);
        expect(s.y - s.r).toBeGreaterThanOrEqual(64);
      }
      expect(slots[0]!.y).toBeGreaterThanOrEqual(slots.at(-1)!.y);
    }
  });
});
