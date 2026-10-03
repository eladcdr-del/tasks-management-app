import { afterEach, describe, expect, it, vi } from 'vitest';
import { deviceId, inviteCode, isInviteCode, randomId } from './ids';

const BASE62 = /^[0-9A-Za-z]+$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Makes crypto.getRandomValues hand out the given bytes (cycling), for deterministic tests. */
function feedBytes(bytes: number[]) {
  let i = 0;
  vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(((arr: Uint8Array) => {
    for (let k = 0; k < arr.length; k++) arr[k] = bytes[i++ % bytes.length] ?? 0;
    return arr;
  }) as typeof crypto.getRandomValues);
}

describe('randomId', () => {
  it('defaults to 20 base62 characters', () => {
    const id = randomId();
    expect(id).toHaveLength(20);
    expect(id).toMatch(BASE62);
  });

  it('honours the requested length (including 0)', () => {
    expect(randomId(1)).toHaveLength(1);
    expect(randomId(64)).toHaveLength(64);
    expect(randomId(300)).toHaveLength(300);
    expect(randomId(0)).toBe('');
  });

  it('can exceed one getRandomValues call (64 KiB limit) by drawing several chunks', () => {
    const id = randomId(70_000);
    expect(id).toHaveLength(70_000);
    expect(id).toMatch(BASE62);
  });

  it('rejects a nonsensical length', () => {
    expect(() => randomId(-1)).toThrow(RangeError);
    expect(() => randomId(2.5)).toThrow(RangeError);
  });

  it('does not repeat (collision smoke test)', () => {
    const seen = new Set(Array.from({ length: 2000 }, () => randomId()));
    expect(seen.size).toBe(2000);
  });

  it('maps bytes onto the alphabet 0-9A-Za-z in order', () => {
    feedBytes([0, 9, 10, 35, 36, 61]);
    expect(randomId(6)).toBe('09AZaz');
  });

  it('wraps by modulo only inside the unbiased range (bytes 0..247)', () => {
    feedBytes([62, 63, 247]); // 62%62=0, 63%62=1, 247%62=61
    expect(randomId(3)).toBe('01z');
  });

  it('rejects bytes >= 248 instead of folding them (no modulo bias)', () => {
    // 248..255 would map to the first 8 characters twice as often; they must be skipped.
    feedBytes([248, 255, 250, 3, 252, 4, 253, 5]);
    expect(randomId(3)).toBe('345');
  });

  it('keeps drawing until it has enough accepted bytes', () => {
    feedBytes([255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 7]);
    expect(randomId(1)).toBe('7');
  });

  it('is evenly distributed over the alphabet (chi-square sanity)', () => {
    const n = 62 * 400;
    const counts = new Map<string, number>();
    const ids = randomId(n);
    for (const ch of ids) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    expect(counts.size).toBe(62);
    const expected = n / 62;
    let chi = 0;
    for (const c of counts.values()) chi += (c - expected) ** 2 / expected;
    // 61 degrees of freedom: p = 0.0001 critical value is ~ 105.
    expect(chi).toBeLessThan(105);
  });
});

describe('inviteCode / isInviteCode', () => {
  it('is exactly 24 base62 characters', () => {
    const code = inviteCode();
    expect(code).toHaveLength(24);
    expect(code).toMatch(BASE62);
    expect(isInviteCode(code)).toBe(true);
  });

  it('is unique per call', () => {
    expect(inviteCode()).not.toBe(inviteCode());
  });

  it('rejects wrong length, wrong characters and non-strings', () => {
    expect(isInviteCode('a'.repeat(23))).toBe(false);
    expect(isInviteCode('a'.repeat(25))).toBe(false);
    expect(isInviteCode('a'.repeat(23) + '-')).toBe(false);
    expect(isInviteCode('a'.repeat(23) + 'א')).toBe(false);
    expect(isInviteCode('a'.repeat(23) + ' ')).toBe(false);
    expect(isInviteCode('')).toBe(false);
    expect(isInviteCode(undefined)).toBe(false);
    expect(isInviteCode(123)).toBe(false);
  });

  it('accepts any mix of upper, lower and digits', () => {
    expect(isInviteCode('0123456789abcdefghijKLMN')).toBe(true);
  });
});

describe('deviceId', () => {
  it('returns a UUID v4', () => {
    expect(deviceId()).toMatch(UUID_V4);
  });

  it('uses crypto.randomUUID when it exists', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '11111111-1111-4111-8111-111111111111'
    );
    expect(deviceId()).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('falls back to a getRandomValues-built v4 UUID where randomUUID is missing (insecure context)', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto)
    });
    const a = deviceId();
    const b = deviceId();
    expect(a).toMatch(UUID_V4);
    expect(b).toMatch(UUID_V4);
    expect(a).not.toBe(b);
  });

  it('sets the version and variant bits in the fallback (all-0xff bytes -> 4fff-bfff)', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (arr: Uint8Array) => {
        arr.fill(0xff);
        return arr;
      }
    });
    expect(deviceId()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
});

describe('without any crypto', () => {
  it('throws a clear error rather than falling back to Math.random', () => {
    vi.stubGlobal('crypto', undefined);
    expect(() => randomId()).toThrow(/crypto/i);
    expect(() => deviceId()).toThrow(/crypto/i);
  });
});
