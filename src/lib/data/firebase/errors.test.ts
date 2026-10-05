// SDK-free error mapping (errors.ts) and the Hebrew table it reads (he/errors.ts).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepoError } from '../repository';
import { errors as table, PAGES_HOST } from '../../i18n/he/errors';
import { he } from '../../i18n/he';
import { errorMessage } from '../../state/ui.svelte';
import { ERROR_DETAIL, isCancelled, isUnavailable, repoErrorMessage, toRepoError } from './errors';

const CODES: RepoError['code'][] = [
  'not-found',
  'expired',
  'revoked',
  'full',
  'already-member',
  'permission',
  'popup-blocked',
  'network',
  'conflict',
  'unknown'
];
const HEBREW = /[֐-׿]/;

describe('he.errors', () => {
  it('has a short Hebrew line for every RepoError code, read the way the UI reads it', () => {
    const flat: Partial<Record<string, string>> = he.errors;
    for (const code of CODES) {
      const line = flat[code];
      expect(line, code).toMatch(HEBREW);
      expect(line!.length, code).toBeLessThanOrEqual(80);
      expect(errorMessage(new RepoError(code))).toBe(line);
      expect(repoErrorMessage(new RepoError(code))).toBe(line);
    }
    // 'unknown' is the generic line (a non-RepoError shows the same text).
    expect(table.unknown).toBe(table.generic);
    expect(errorMessage(new Error('boom'))).toBe(table.generic);
  });

  it('every message is distinct apart from unknown ≡ generic', () => {
    const lines = CODES.filter((c) => c !== 'unknown').map((c) => table[c]);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('the unauthorized-domain hint tells Elad which domain to add, and where', () => {
    expect(table.unauthorizedDomain).toContain(PAGES_HOST);
    expect(PAGES_HOST).toBe('eladcdr-del.github.io');
    expect(table.unauthorizedDomain).toContain('Authorized domains');
    expect(table.unauthorizedDomain).toMatch(HEBREW);
  });
});

describe('repoErrorMessage', () => {
  it('picks the setup hint, the quiet cancel line and the validation line by detail', () => {
    const domain = toRepoError({ code: 'auth/unauthorized-domain' });
    expect(domain.code).toBe('permission');
    expect(repoErrorMessage(domain, PAGES_HOST)).toBe(table.unauthorizedDomain);
    expect(repoErrorMessage(domain, 'localhost')).toContain('localhost');

    const closed = toRepoError({ code: 'auth/popup-closed-by-user' });
    expect(isCancelled(closed)).toBe(true);
    expect(repoErrorMessage(closed)).toBe(table.cancelled);

    const invalid = new RepoError('permission', `${ERROR_DETAIL.invalidPrefix} title too long`);
    expect(repoErrorMessage(invalid)).toBe(table.invalid);
  });
});

describe('toRepoError', () => {
  it('maps Firestore and Auth codes', () => {
    expect(toRepoError({ code: 'permission-denied', message: 'x' }).code).toBe('permission');
    expect(toRepoError({ code: 'unavailable', message: 'x' }).code).toBe('network');
    expect(toRepoError({ code: 'aborted', message: 'x' }).code).toBe('conflict');
    expect(toRepoError({ code: 'auth/popup-blocked' }).code).toBe('popup-blocked');
    expect(toRepoError({ code: 'auth/network-request-failed' }).code).toBe('network');
    expect(toRepoError(new Error('?')).code).toBe('unknown');
    const same = new RepoError('full');
    expect(toRepoError(same)).toBe(same);
    expect(isUnavailable({ code: 'unavailable' })).toBe(true);
    expect(isUnavailable(new RepoError('network'))).toBe(true);
    expect(isUnavailable(new RepoError('permission'))).toBe(false);
  });
});

describe('toRepoError: Google sign-in without a usable connection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('auth/internal-error from a failed script load says "no connection", not "something broke"', () => {
    // The SDK attaches the <script> error event as customData.
    const scriptFailed = { code: 'auth/internal-error', customData: new Event('error') };
    expect(toRepoError(scriptFailed).code).toBe('network');
    expect(repoErrorMessage(toRepoError(scriptFailed))).toBe(table.network);
  });

  it('auth/internal-error while the device is offline is a network error too', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(toRepoError({ code: 'auth/internal-error' }).code).toBe('network');
  });

  it('any other auth/internal-error stays unknown', () => {
    vi.stubGlobal('navigator', { onLine: true });
    expect(toRepoError({ code: 'auth/internal-error' }).code).toBe('unknown');
  });

  it('a redirect that came back without a user explains itself (popup-blocked copy)', () => {
    const lost = new RepoError('popup-blocked', ERROR_DETAIL.redirectLost);
    expect(repoErrorMessage(lost)).toBe(table['popup-blocked']);
    expect(errorMessage(lost)).toBe(table['popup-blocked']);
    expect(table['popup-blocked']).toContain('נסו שוב');
  });
});
