// @vitest-environment jsdom
// Google sign-in (auth.ts) against a mocked Auth SDK: the popup/redirect resolver is passed
// explicitly (Auth starts with one only while nobody is signed in, see init.ts), a blocked popup
// never falls back to a redirect whose result would be lost (authDomain on another host), a
// redirect result is read only when this tab started one, and reported when it came back empty,
// and the signed-in hint that init.ts reads follows the auth state.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Auth } from 'firebase/auth';
import { RepoError } from '../repository';
import { ERROR_DETAIL } from './errors';

const sdk = vi.hoisted(() => ({
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  getRedirectResult: vi.fn(),
  onAuthStateChanged: vi.fn()
}));

vi.mock('firebase/auth', async (importOriginal) => {
  const real = await importOriginal<typeof import('firebase/auth')>();
  return { ...real, ...sdk };
});

const { browserPopupRedirectResolver } = await import('firebase/auth');
const {
  consumeRedirectResult,
  hasSignedInHint,
  REDIRECT_MARK_KEY,
  rememberSignedIn,
  redirectReturnsHere,
  SIGNED_IN_HINT_KEY,
  signInWithGoogle,
  watchAuth
} = await import('./auth');

/** The parts of Auth that auth.ts reads. */
function fakeAuth(authDomain: string, currentUser: unknown = null): Auth {
  return { config: { authDomain }, currentUser } as unknown as Auth;
}
const OTHER_HOST = 'homecare-49b3d.firebaseapp.com';
const authError = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => {
  sessionStorage.clear();
  for (const fn of Object.values(sdk)) fn.mockReset();
});

afterEach(() => {
  sessionStorage.clear();
});

describe('signInWithGoogle', () => {
  it('opens the popup with the resolver passed explicitly', async () => {
    sdk.signInWithPopup.mockResolvedValue({ user: { uid: 'u1' } });
    await signInWithGoogle(fakeAuth(OTHER_HOST));
    expect(sdk.signInWithPopup).toHaveBeenCalledTimes(1);
    expect(sdk.signInWithPopup.mock.calls[0]![2]).toBe(browserPopupRedirectResolver);
    expect(sdk.signInWithRedirect).not.toHaveBeenCalled();
  });

  it('a blocked popup with authDomain on another host: no redirect, a popup-blocked error', async () => {
    sdk.signInWithPopup.mockRejectedValue(authError('auth/popup-blocked'));
    const auth = fakeAuth(OTHER_HOST);
    expect(redirectReturnsHere(auth)).toBe(false);
    await expect(signInWithGoogle(auth)).rejects.toMatchObject({
      code: 'popup-blocked'
    } satisfies Partial<RepoError>);
    expect(sdk.signInWithRedirect).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(REDIRECT_MARK_KEY)).toBeNull();
  });

  it('a blocked popup on the auth domain itself redirects, after marking the tab', async () => {
    sdk.signInWithPopup.mockRejectedValue(authError('auth/popup-blocked'));
    sdk.signInWithRedirect.mockImplementation(() => {
      expect(sessionStorage.getItem(REDIRECT_MARK_KEY)).toBe('1');
      return new Promise(() => {}); // navigates away
    });
    const auth = fakeAuth(location.host);
    void signInWithGoogle(auth);
    await vi.waitFor(() => expect(sdk.signInWithRedirect).toHaveBeenCalledTimes(1));
    expect(sdk.signInWithRedirect.mock.calls[0]![2]).toBe(browserPopupRedirectResolver);
  });

  it('a redirect that cannot start clears the mark and says so', async () => {
    sdk.signInWithPopup.mockRejectedValue(authError('auth/popup-blocked'));
    sdk.signInWithRedirect.mockRejectedValue(authError('auth/something-odd'));
    await expect(signInWithGoogle(fakeAuth(location.host))).rejects.toMatchObject({
      code: 'popup-blocked'
    });
    expect(sessionStorage.getItem(REDIRECT_MARK_KEY)).toBeNull();
  });

  it('closing the popup stays quiet (cancelled), with no fallback', async () => {
    sdk.signInWithPopup.mockRejectedValue(authError('auth/popup-closed-by-user'));
    await expect(signInWithGoogle(fakeAuth(location.host))).rejects.toMatchObject({
      code: 'unknown',
      message: ERROR_DETAIL.cancelled
    });
    expect(sdk.signInWithRedirect).not.toHaveBeenCalled();
  });
});

describe('consumeRedirectResult', () => {
  it('does nothing (loads nothing) when this tab started no redirect', async () => {
    expect(await consumeRedirectResult(fakeAuth(location.host))).toBeNull();
    expect(sdk.getRedirectResult).not.toHaveBeenCalled();
  });

  it('finishes a marked redirect with the resolver, and forgets the mark', async () => {
    sessionStorage.setItem(REDIRECT_MARK_KEY, '1');
    sdk.getRedirectResult.mockResolvedValue({ user: { uid: 'u1' } });
    expect(await consumeRedirectResult(fakeAuth(location.host))).toBeNull();
    expect(sdk.getRedirectResult.mock.calls[0]![1]).toBe(browserPopupRedirectResolver);
    expect(sessionStorage.getItem(REDIRECT_MARK_KEY)).toBeNull();
  });

  it('reports a redirect that came back without a user instead of failing silently', async () => {
    sessionStorage.setItem(REDIRECT_MARK_KEY, '1');
    sdk.getRedirectResult.mockResolvedValue(null);
    const err = await consumeRedirectResult(fakeAuth(location.host));
    expect(err).toBeInstanceOf(RepoError);
    expect(err).toMatchObject({ code: 'popup-blocked', message: ERROR_DETAIL.redirectLost });
  });

  it('an empty result while someone is signed in is fine', async () => {
    sessionStorage.setItem(REDIRECT_MARK_KEY, '1');
    sdk.getRedirectResult.mockResolvedValue(null);
    expect(await consumeRedirectResult(fakeAuth(location.host, { uid: 'u1' }))).toBeNull();
  });

  it('maps a failed redirect', async () => {
    sessionStorage.setItem(REDIRECT_MARK_KEY, '1');
    sdk.getRedirectResult.mockRejectedValue(authError('auth/network-request-failed'));
    expect(await consumeRedirectResult(fakeAuth(location.host))).toMatchObject({
      code: 'network'
    });
  });
});

describe('signed-in hint (init.ts warms the sign-in script only without it)', () => {
  afterEach(() => localStorage.clear());

  it('is off on a fresh device and follows rememberSignedIn', () => {
    expect(hasSignedInHint()).toBe(false);
    rememberSignedIn(true);
    expect(localStorage.getItem(SIGNED_IN_HINT_KEY)).toBe('1');
    expect(hasSignedInHint()).toBe(true);
    rememberSignedIn(false);
    expect(hasSignedInHint()).toBe(false);
  });

  it('watchAuth sets it for a signed-in user and clears it on sign-out', () => {
    let emit: (u: unknown) => void = () => {};
    sdk.onAuthStateChanged.mockImplementation((_auth: unknown, cb: (u: unknown) => void) => {
      emit = cb;
      return () => {};
    });
    const seen: (string | null)[] = [];
    watchAuth(fakeAuth(OTHER_HOST), (u) => seen.push(u?.uid ?? null));
    emit({ uid: 'u1', displayName: 'מיכל', email: 'm@example.com', photoURL: null });
    expect(hasSignedInHint()).toBe(true);
    emit(null);
    expect(hasSignedInHint()).toBe(false);
    expect(seen).toEqual(['u1', null]);
  });

  it('reads as off when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(hasSignedInHint()).toBe(false);
    spy.mockRestore();
  });
});
