// @vitest-environment jsdom
// The welcome screen's background warm-up of Google's sign-in helpers (gapi + gapi.iframes).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetGoogleSignInWarmup, warmGoogleSignIn } from './googleSignIn';

type W = Window & { gapi?: unknown };
const gapiScripts = () =>
  [...document.head.querySelectorAll('script')].filter((s) => s.src.includes('apis.google.com'));

afterEach(() => {
  resetGoogleSignInWarmup();
  delete (window as W).gapi;
  for (const s of gapiScripts()) s.remove();
});

describe('warmGoogleSignIn', () => {
  it('adds Google’s script once and loads gapi.iframes when it arrives', () => {
    warmGoogleSignIn();
    warmGoogleSignIn();
    const scripts = gapiScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.src).toBe('https://apis.google.com/js/api.js');
    expect(scripts[0]!.async).toBe(true);

    const load = vi.fn();
    (window as W).gapi = { load };
    scripts[0]!.onload?.(new Event('load'));
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0]![0]).toBe('gapi.iframes');
  });

  it('uses a gapi loader already on the page instead of adding the script', () => {
    const load = vi.fn();
    (window as W).gapi = { load };
    warmGoogleSignIn();
    expect(gapiScripts()).toHaveLength(0);
    expect(load).toHaveBeenCalledWith('gapi.iframes', expect.any(Object));
  });

  it('does nothing when gapi.iframes is already loaded', () => {
    const load = vi.fn();
    (window as W).gapi = { load, iframes: { Iframe: function Iframe() {} } };
    warmGoogleSignIn();
    expect(gapiScripts()).toHaveLength(0);
    expect(load).not.toHaveBeenCalled();
  });

  it('a failed script load is removed and may be retried', () => {
    warmGoogleSignIn();
    const [script] = gapiScripts();
    script!.onerror?.(new Event('error'));
    expect(gapiScripts()).toHaveLength(0);
    warmGoogleSignIn();
    expect(gapiScripts()).toHaveLength(1);
  });
});
