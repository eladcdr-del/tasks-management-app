// @vitest-environment jsdom
import '../../test/jsdom';
import { afterEach, describe, expect, it } from 'vitest';
import type { TreatJar } from '$lib/domain/types';
import { readSeen, statusLine, writeSeen } from './jarView';

const M = 'michal';
const D = 'dani';
const N = 'noa';
const NAMES: Record<string, string> = { [M]: 'מיכל', [D]: 'דני', [N]: 'נועה' };
const nameOf = (uid: string) => NAMES[uid] ?? '';
/** Playwright-style: compare with the no-break spaces as plain spaces. */
const plain = (s: string) => s.replace(/ /g, ' ');

const each = (counts: Record<string, number>, share = 5): TreatJar => ({
  treat: 'ארוחה במסעדה',
  mode: 'each',
  share,
  target: 10,
  count: 0,
  counts,
  round: 3,
  startedAt: 0
});

describe('statusLine', () => {
  it('together: the total still needed', () => {
    const j: TreatJar = { ...each({}), mode: 'together', count: 7 };
    expect(plain(statusLine(j, [M, D], M, nameOf))).toBe('עוד 3 משימות ואנחנו בצ׳ופר');
    expect(plain(statusLine({ ...j, count: 9 }, [M, D], M, nameOf))).toBe(
      'עוד משימה אחת ואנחנו בצ׳ופר'
    );
  });

  it('each, two parts left: mine first, then theirs, with how much', () => {
    expect(plain(statusLine(each({ [M]: 4, [D]: 3 }), [M, D], M, nameOf))).toBe(
      'עוד משימה אחת שלך ו־2 משימות של דני, ואנחנו בצ׳ופר'
    );
    // From דני's phone the same jar reads from his side.
    expect(plain(statusLine(each({ [M]: 4, [D]: 3 }), [M, D], D, nameOf))).toBe(
      'עוד 2 משימות שלך ומשימה אחת של מיכל, ואנחנו בצ׳ופר'
    );
  });

  it('each, one part left: just that one, never blaming', () => {
    expect(plain(statusLine(each({ [M]: 5, [D]: 3 }), [M, D], M, nameOf))).toBe(
      'עוד 2 משימות של דני ואנחנו בצ׳ופר'
    );
    expect(plain(statusLine(each({ [M]: 2, [D]: 6 }), [M, D], M, nameOf))).toBe(
      'עוד 3 משימות שלך ואנחנו בצ׳ופר'
    );
  });

  it('each, three or more parts left: the total, like together', () => {
    expect(plain(statusLine(each({ [M]: 1 }), [M, D, N], M, nameOf))).toBe(
      'עוד 14 משימות ואנחנו בצ׳ופר'
    );
  });

  it('a full jar or no jar: nothing to say here', () => {
    expect(statusLine(each({ [M]: 5, [D]: 5 }), [M, D], M, nameOf)).toBe('');
    expect(statusLine(null, [M, D], M, nameOf)).toBe('');
  });
});

describe('readSeen / writeSeen', () => {
  afterEach(() => localStorage.clear());

  it('unknown device: Infinity (nothing drops in on a first visit)', () => {
    expect(readSeen('h1', 3)).toBe(Number.POSITIVE_INFINITY);
  });

  it('remembers per household and round; a new round starts from 0', () => {
    writeSeen('h1', 3, 7);
    expect(readSeen('h1', 3)).toBe(7);
    expect(readSeen('h1', 4)).toBe(0);
    expect(readSeen('h2', 3)).toBe(Number.POSITIVE_INFINITY);
  });
});
