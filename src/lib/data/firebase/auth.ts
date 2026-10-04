// Google sign-in for an installed PWA (owner step 2.2).
//
// Flow (Android Chrome, installed, display-mode standalone):
//   1. signInWithPopup, called synchronously from the user's tap (no await before it), so Chrome
//      opens the Google account chooser (a Custom Tab in standalone mode) instead of blocking it.
//   2. If the popup cannot work here (auth/popup-blocked, auth/operation-not-supported-in-this-
//      environment, or auth/cancelled-popup-request while standalone) → signInWithRedirect. The page
//      navigates to Google and back; `consumeRedirectResult` on the next boot finishes it, and
//      onAuthStateChanged reports the user.
//   3. Errors: closed by the user → RepoError('unknown', 'cancelled') (the UI stays quiet);
//      network → 'network'; auth/unauthorized-domain → RepoError('permission',
//      'unauthorized-domain') with a Hebrew setup hint (he.errors.unauthorizedDomain).
// The test credential path (emulator only) never touches popups, so it runs in Node too.

import {
  GoogleAuthProvider,
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
import { toRepoError } from './errors';

export function toAuthUser(u: User): AuthUser {
  return {
    uid: u.uid,
    displayName: u.displayName ?? '',
    email: u.email ?? '',
    photoURL: u.photoURL ?? null
  };
}

export function watchAuth(auth: Auth, cb: (u: AuthUser | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, (u) => cb(u ? toAuthUser(u) : null));
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
    await signInWithPopup(auth, provider);
    return;
  } catch (e) {
    const code = authCode(e);
    const useRedirect =
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment' ||
      (code === 'auth/cancelled-popup-request' && isStandalone());
    if (!useRedirect) throw toRepoError(e);
  }
  try {
    // Navigates away; the result is read by consumeRedirectResult on the next boot.
    await signInWithRedirect(auth, provider);
  } catch (e) {
    const err = toRepoError(e);
    throw err.code === 'unknown' ? new RepoError('popup-blocked', err.message) : err;
  }
}

/**
 * Completes a sign-in that went through signInWithRedirect (no-op otherwise). Returns the mapped
 * error of a failed redirect, or null. Browser only.
 */
export async function consumeRedirectResult(auth: Auth): Promise<RepoError | null> {
  if (typeof window === 'undefined') return null;
  try {
    await getRedirectResult(auth);
    return null;
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
  const fakeIdToken = JSON.stringify({ sub: uid, email: mail, email_verified: true, name: displayName });
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
