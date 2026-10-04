// Firestore / Auth error → RepoError (owner step 2.2), and RepoError → Hebrew message.
//
// SDK-free on purpose (errors are matched by their string `code`), so the UI may import
// `repoErrorMessage` statically without pulling Firebase into the main bundle.

import { RepoError } from '../repository';
import { errors as he, PAGES_HOST } from '../../i18n/he/errors';

type Code = RepoError['code'];

/** Messages carried by RepoErrors whose code alone is ambiguous. */
export const ERROR_DETAIL = {
  /** The user closed the Google popup: the UI stays quiet. */
  cancelled: 'cancelled',
  /** Firebase Auth rejected the page's domain (it is not in "Authorized domains"). */
  unauthorizedDomain: 'unauthorized-domain',
  /** Client-side validation (mirrors firestore.rules) rejected the data before any write. */
  invalidPrefix: 'invalid:'
} as const;

const FIRESTORE_CODES: Record<string, Code> = {
  'permission-denied': 'permission',
  unauthenticated: 'permission',
  'not-found': 'not-found',
  unavailable: 'network',
  'deadline-exceeded': 'network',
  aborted: 'conflict',
  'already-exists': 'conflict',
  'failed-precondition': 'unknown',
  'resource-exhausted': 'unknown',
  cancelled: 'unknown',
  internal: 'unknown',
  unknown: 'unknown'
};

const AUTH_CODES: Record<string, [Code, string?]> = {
  'auth/network-request-failed': ['network'],
  'auth/timeout': ['network'],
  'auth/popup-blocked': ['popup-blocked'],
  'auth/popup-closed-by-user': ['unknown', ERROR_DETAIL.cancelled],
  'auth/cancelled-popup-request': ['unknown', ERROR_DETAIL.cancelled],
  'auth/user-cancelled': ['unknown', ERROR_DETAIL.cancelled],
  'auth/redirect-cancelled-by-user': ['unknown', ERROR_DETAIL.cancelled],
  'auth/unauthorized-domain': ['permission', ERROR_DETAIL.unauthorizedDomain],
  'auth/operation-not-allowed': ['permission', 'operation-not-allowed'],
  'auth/user-disabled': ['permission', 'user-disabled'],
  'auth/operation-not-supported-in-this-environment': ['popup-blocked']
};

function codeOf(e: unknown): string | undefined {
  const c = (e as { code?: unknown } | null)?.code;
  return typeof c === 'string' ? c : undefined;
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === 'string' ? e : 'unknown error';
}

/** Maps any thrown value (FirestoreError, AuthError, RepoError, ...) to a RepoError. */
export function toRepoError(e: unknown): RepoError {
  if (e instanceof RepoError) return e;
  const code = codeOf(e);
  if (code) {
    const auth = AUTH_CODES[code];
    if (auth) return new RepoError(auth[0], auth[1] ?? code);
    // Firestore codes are bare ('permission-denied'); the compat layer may prefix 'firestore/'.
    const fs = FIRESTORE_CODES[code.replace(/^firestore\//, '')];
    if (fs) return new RepoError(fs, `${code}: ${messageOf(e)}`);
    if (code.startsWith('auth/')) return new RepoError('unknown', code);
  }
  if (e instanceof TypeError && /fetch|network/i.test(e.message)) {
    return new RepoError('network', e.message);
  }
  return new RepoError('unknown', messageOf(e));
}

/** True for errors that mean "the server could not be reached" (safe to retry offline). */
export function isUnavailable(e: unknown): boolean {
  const code = codeOf(e);
  if (code === 'unavailable' || code === 'deadline-exceeded') return true;
  return e instanceof RepoError && e.code === 'network';
}

/** True when the user simply closed the sign-in popup (the UI should stay quiet). */
export function isCancelled(e: unknown): boolean {
  return e instanceof RepoError && e.code === 'unknown' && e.message === ERROR_DETAIL.cancelled;
}

/**
 * The Hebrew message for a RepoError (he.errors). `host` is the page's hostname, named in the
 * unauthorized-domain hint (default: `location.hostname` in a browser, else the GitHub Pages host).
 */
export function repoErrorMessage(e: RepoError, host?: string): string {
  if (e.message === ERROR_DETAIL.unauthorizedDomain) {
    const h = host ?? (typeof location !== 'undefined' ? location.hostname : '');
    return h ? he.unauthorizedDomain.replace(PAGES_HOST, h) : he.unauthorizedDomain;
  }
  if (e.message === ERROR_DETAIL.cancelled) return he.cancelled;
  if (e.code === 'permission' && e.message.startsWith(ERROR_DETAIL.invalidPrefix)) {
    return he.invalid;
  }
  return he[e.code] ?? he.generic;
}
