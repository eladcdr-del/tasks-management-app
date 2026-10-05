// Google sign-in for an installed PWA (owner step 2.2).
//
// Flow (Android Chrome, installed, display-mode standalone):
//   1. signInWithPopup, called synchronously from the user's tap (no await before it), so Chrome
//      opens the Google account chooser (a Custom Tab in standalone mode) instead of blocking it.
//      The SDK opens the popup only once Google's script and iframe are loaded, and Chrome blocks
//      a popup opened more than ~5 s after the tap. So a device nobody is signed in on starts Auth
//      WITH the resolver (init.ts), which loads them while the welcome screen is shown; a signed-in
//      device starts without it, so its launches never wait for Google (the resolver is passed
//      here, and loads on the first tap if needed).
//   2. If the popup cannot work here (auth/popup-blocked, auth/operation-not-supported-in-this-
//      environment, or auth/cancelled-popup-request while standalone):
//      - authDomain is another host than the page (the GitHub Pages deploy: *.firebaseapp.com vs
//        *.github.io) → no redirect: with third-party storage partitioning (Chrome 115+) its
//        result is lost and the user would come back signed out, silently. RepoError
//        ('popup-blocked') instead, which tells them to try again (the resolver is warm by then,
//        so the popup opens at once) or to open the app in Chrome.
//      - same host → signInWithRedirect, after marking the tab (sessionStorage). The next boot
//        finishes it in `consumeRedirectResult`, which reads the redirect only when the mark is
//        there, and reports a redirect that came back without a user instead of ignoring it.
//   3. Errors: closed by the user → RepoError('unknown', 'cancelled') (the UI stays quiet);
//      network → 'network'; auth/unauthorized-domain → RepoError('permission',
//      'unauthorized-domain') with a Hebrew setup hint (he.errors.unauthorizedDomain).
// The test credential path (emulator only) never touches popups, so it runs in Node too.

import {
  GoogleAuthProvider,
  browserPopupRedirectResolver,
  getRedirectResult,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  type Auth,
  type User
} from 'firebase/auth';
import { RepoError } from '../repository';
import type { AuthUser, Unsubscribe } from '../../domain/types';
import { ERROR_DETAIL, toRepoError } from './errors';

/** sessionStorage mark: this tab left for Google through signInWithRedirect. */
export const REDIRECT_MARK_KEY = 'homecare.authRedirect';

function tabStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function markRedirect(on: boolean): void {
  try {
    if (on) tabStorage()?.setItem(REDIRECT_MARK_KEY, '1');
    else tabStorage()?.removeItem(REDIRECT_MARK_KEY);
  } catch {
    // Storage blocked: the redirect result is then simply not read.
  }
}

/** Returns and clears the redirect mark. */
function takeRedirectMark(): boolean {
  try {
    const marked = tabStorage()?.getItem(REDIRECT_MARK_KEY) === '1';
    if (marked) markRedirect(false);
    return marked;
  } catch {
    return false;
  }
}

/** Whether a redirect sign-in can come back to this page: authDomain is the page's own host. */
export function redirectReturnsHere(auth: Pick<Auth, 'config'>): boolean {
  if (typeof location === 'undefined') return false;
  return auth.config.authDomain === location.host;
}

export function toAuthUser(u: User): AuthUser {
  return {
    uid: u.uid,
    displayName: u.displayName ?? '',
    email: u.email ?? '',
    photoURL: u.photoURL ?? null
  };
}

/** localStorage: someone is signed in on this device (init.ts then starts Auth without warming
 *  Google's sign-in script, so the launch does not wait for it). */
export const SIGNED_IN_HINT_KEY = 'homecare.signedIn';

export function hasSignedInHint(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(SIGNED_IN_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberSignedIn(on: boolean): void {
  try {
    if (on) localStorage.setItem(SIGNED_IN_HINT_KEY, '1');
    else localStorage.removeItem(SIGNED_IN_HINT_KEY);
  } catch {
    // Storage blocked: every launch then warms the sign-in script, as getAuth() would.
  }
}

export function watchAuth(auth: Auth, cb: (u: AuthUser | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, (u) => {
    rememberSignedIn(u !== null);
    cb(u ? toAuthUser(u) : null);
  });
}

/** Installed PWA (Android/desktop `display-mode: standalone`, or iOS home-screen web app). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches)
  );
}

function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

function authCode(e: unknown): string | undefined {
  const c = (e as { code?: unknown } | null)?.code;
  return typeof c === 'string' ? c : undefined;
}

/** Popup first, redirect as the fallback (see the header). Rejects with a mapped RepoError. */
export async function signInWithGoogle(auth: Auth): Promise<void> {
  const provider = googleProvider();
  try {
    // Must be the first await: popups are only allowed inside the user's gesture.
    await signInWithPopup(auth, provider, browserPopupRedirectResolver);
    return;
  } catch (e) {
    const code = authCode(e);
    const popupFailed =
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment' ||
      (code === 'auth/cancelled-popup-request' && isStandalone());
    if (!popupFailed) throw toRepoError(e);
    if (!redirectReturnsHere(auth)) throw new RepoError('popup-blocked', code);
  }
  markRedirect(true);
  try {
    // Navigates away; the result is read by consumeRedirectResult on the next boot.
    await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
  } catch (e) {
    markRedirect(false);
    const err = toRepoError(e);
    throw err.code === 'unknown' ? new RepoError('popup-blocked', err.message) : err;
  }
}

/**
 * Completes a sign-in that this tab started with signInWithRedirect (otherwise a no-op that loads
 * nothing). Returns the mapped error of a failed redirect, a RepoError('popup-blocked',
 * 'redirect-lost') when Google sent the user back without a sign-in, or null. Browser only.
 */
export async function consumeRedirectResult(auth: Auth): Promise<RepoError | null> {
  if (typeof window === 'undefined' || !takeRedirectMark()) return null;
  try {
    const result = await getRedirectResult(auth, browserPopupRedirectResolver);
    if (result || auth.currentUser) return null;
    return new RepoError('popup-blocked', ERROR_DETAIL.redirectLost);
  } catch (e) {
    return toRepoError(e);
  }
}

/** Emulator only: makes sure an account with localId `uid` exists, linked to google.com/`uid`. */
async function provisionEmulatorUser(
  authOrigin: string,
  projectId: string,
  uid: string,
  displayName: string,
  email: string
): Promise<void> {
  // A fresh federated sign-in would get a random uid; importing the account first pins it, and the
  // credential below then signs in to it (matched by provider + raw id).
  const url = `${authOrigin}/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchCreate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({
      users: [
        {
          localId: uid,
          displayName,
          email,
          emailVerified: true,
          providerUserInfo: [{ providerId: 'google.com', rawId: uid, email, displayName }]
        }
      ]
    })
  });
  if (!res.ok) throw new RepoError('unknown', `auth emulator: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { error?: { message?: string }[] };
  const failure = body.error?.find((e) => !/existing account/.test(e.message ?? ''));
  if (failure) throw new RepoError('unknown', `auth emulator: ${failure.message ?? 'error'}`);
}

/**
 * Emulator only: signs in as `uid` with a fake (unsigned JSON) Google id token, which the Auth
 * emulator accepts. Resolves once Auth reports `uid` as the current user.
 */
export async function signInWithTestCredentialImpl(
  auth: Auth,
  emulator: { host: string; authPort: number },
  projectId: string,
  uid: string,
  displayName: string,
  email?: string
): Promise<void> {
  const mail = email ?? `${uid.replace(/[^A-Za-z0-9._-]/g, '_')}@example.com`;
  await provisionEmulatorUser(
    `http://${emulator.host}:${emulator.authPort}`,
    projectId,
    uid,
    displayName,
    mail
  );
  const fakeIdToken = JSON.stringify({
    sub: uid,
    email: mail,
    email_verified: true,
    name: displayName
  });
  await signInWithCredential(auth, GoogleAuthProvider.credential(fakeIdToken));
  if (auth.currentUser?.uid !== uid) {
    throw new RepoError('unknown', `signed in as ${auth.currentUser?.uid ?? 'nobody'}, not ${uid}`);
  }
  // Let every auth listener (including Firestore's credentials provider) observe the change.
  await new Promise<void>((resolve) => {
    const stop = onAuthStateChanged(auth, (u) => {
      if (u?.uid === uid) {
        queueMicrotask(() => stop());
        resolve();
      }
    });
  });
}
