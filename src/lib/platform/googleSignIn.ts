// Warms Google's sign-in helpers while the welcome screen is shown.
//
// Firebase opens the Google popup only after Google's script (gapi) and its iframes module have
// loaded, and Chrome blocks a popup that opens more than a few seconds after the tap. Auth starts
// without them (init.ts) so launches never wait for Google; instead the welcome screen loads them
// in the background here. Firebase reuses what is already on the page (it checks
// window.gapi.iframes before loading anything), so the first tap opens the popup at once. Nothing
// awaits this: if it fails, the first tap simply loads the helpers itself, as before.

const GAPI_URL = 'https://apis.google.com/js/api.js';

interface Gapi {
  load?: (module: string, options: Record<string, unknown>) => void;
  iframes?: { Iframe?: unknown };
}

let started = false;

/** Starts loading gapi + gapi.iframes once per page; a failed load may be retried. */
export function warmGoogleSignIn(): void {
  if (started || typeof document === 'undefined') return;
  const w = window as Window & { gapi?: Gapi };
  if (w.gapi?.iframes?.Iframe) return;
  started = true;
  const loadIframes = () => {
    try {
      w.gapi?.load?.('gapi.iframes', {
        callback: () => {},
        onerror: () => {},
        ontimeout: () => {},
        timeout: 30_000
      });
    } catch {
      // Firebase loads the module itself on the first tap.
    }
  };
  if (w.gapi?.load) {
    loadIframes();
    return;
  }
  const script = document.createElement('script');
  script.src = GAPI_URL;
  script.async = true;
  script.onload = loadIframes;
  script.onerror = () => {
    script.remove();
    started = false;
  };
  document.head.append(script);
}

/** Tests only. */
export function resetGoogleSignInWarmup(): void {
  started = false;
}
