// Random identifiers. Everything here is backed by the Web Crypto API (browsers, Node >= 19, and the
// notifier); there is deliberately no Math.random fallback because invite codes are bearer secrets.

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
/** Largest multiple of 62 that fits in a byte (62 * 4). Bytes >= this are rejected to avoid modulo bias. */
const ACCEPT_BELOW = 248;
const INVITE_LENGTH = 24;
const INVITE_RE = new RegExp(`^[0-9A-Za-z]{${INVITE_LENGTH}}$`);

function getCrypto(): Crypto {
  const c = globalThis.crypto as Crypto | undefined;
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new Error('Web Crypto (crypto.getRandomValues) is not available in this environment');
  }
  return c;
}

/**
 * A random base62 string. Uses rejection sampling: random bytes >= 248 are discarded so that all 62
 * characters are exactly equally likely.
 */
export function randomId(len = 20): string {
  if (!Number.isInteger(len) || len < 0) throw new RangeError(`randomId: invalid length ${len}`);
  const crypto = getCrypto();
  // ~3% of bytes are rejected, so one chunk of len + a margin nearly always suffices; loop if not.
  const chunk = new Uint8Array(Math.min(65_536, len + 16));
  let out = '';
  while (out.length < len) {
    crypto.getRandomValues(chunk);
    for (const byte of chunk) {
      if (out.length === len) break;
      if (byte < ACCEPT_BELOW) out += ALPHABET.charAt(byte % 62);
    }
  }
  return out;
}

/** A new invite code: 24 base62 characters (about 143 bits). */
export function inviteCode(): string {
  return randomId(INVITE_LENGTH);
}

export function isInviteCode(s: unknown): s is string {
  return typeof s === 'string' && INVITE_RE.test(s);
}

/** A per-install device id (UUID v4). `crypto.randomUUID` only exists in secure contexts, so fall back. */
export function deviceId(): string {
  const crypto = getCrypto();
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  const hex = Array.from(random, (x, i) => {
    if (i === 6) x = (x & 0x0f) | 0x40; // version 4
    if (i === 8) x = (x & 0x3f) | 0x80; // RFC 4122 variant
    return x.toString(16).padStart(2, '0');
  });
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join('')
  ].join('-');
}
