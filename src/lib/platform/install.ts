// owner: step 3.1 — only that step edits this file.
//
// "Add to home screen". Android Chrome fires `beforeinstallprompt` once the PWA is installable; we
// keep the event so the onboarding install step and Settings can offer a real "התקנה" button.
// Elsewhere (iOS Safari, desktop Firefox, already installed) `canPrompt` stays false and the UI
// shows a short manual tip instead.
//
//   startInstallCapture()               once, as early as possible (App.svelte does it)
//   installState()                      { canPrompt, installed }
//   onInstallChange(cb)                 subscribe; returns an unsubscribe
//   promptInstall()                     'accepted' | 'dismissed' | 'unavailable'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallState {
  /** A deferred `beforeinstallprompt` is waiting: a button can open the browser's dialog. */
  canPrompt: boolean;
  /** Running as an installed app (standalone display mode), or installed during this visit. */
  installed: boolean;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
let started = false;
const listeners = new Set<(s: InstallState) => void>();

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true;
}

export function installState(): InstallState {
  const installed = installedNow || isStandalone();
  return { canPrompt: deferred !== null && !installed, installed };
}

function emit(): void {
  const s = installState();
  for (const cb of listeners) cb(s);
}

/** Starts listening for the install events. Idempotent; a no-op outside the browser. */
export function startInstallCapture(win: Window | undefined = globalThis.window): void {
  if (started || !win) return;
  started = true;
  win.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep the mini-infobar away; we offer our own button
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  win.addEventListener('appinstalled', () => {
    deferred = null;
    installedNow = true;
    emit();
  });
}

export function onInstallChange(cb: (s: InstallState) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Opens the browser's install dialog (needs a user gesture). Never throws. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const ev = deferred;
  if (!ev) return 'unavailable';
  deferred = null; // a prompt event can be used once
  try {
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    if (outcome === 'accepted') installedNow = true;
    return outcome;
  } catch {
    return 'unavailable';
  } finally {
    emit();
  }
}
