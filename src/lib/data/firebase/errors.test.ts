// SDK-free error mapping (errors.ts) and the Hebrew table it reads (he/errors.ts).
import { describe, expect, it } from 'vitest';
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
