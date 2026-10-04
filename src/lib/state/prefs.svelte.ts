// Device preferences (step 2.4): theme, haptics, last version seen. All per device (localStorage),
// none synced. Settings (4.3) reads and sets these; 5.1 may use lastSeenVersion for "what's new".
//
//   prefs.theme / prefs.setTheme('dark')     applies at once (platform/theme.ts applyTheme)
//   prefs.haptics / prefs.setHaptics(false)  platform/haptics.ts reads the same key
//   prefs.lastSeenVersion / prefs.markVersionSeen()

import { applyTheme, currentTheme, type Theme } from '$lib/platform/theme';
import { isHapticsEnabled, setHapticsEnabled } from '$lib/platform/haptics';

export const LAST_SEEN_VERSION_KEY = 'homecare.lastSeenVersion';

function readStorage(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Storage blocked: the preference lasts for this session only.
  }
}

export class PrefsStore {
  /** 'system' | 'light' | 'dark' (the pre-paint script in index.html applied it already). */
  theme = $state<Theme>(typeof document === 'undefined' ? 'system' : currentTheme());
  haptics = $state(isHapticsEnabled());
  /** The app version the user last acknowledged, or null on a first run. */
  lastSeenVersion = $state<string | null>(readStorage(LAST_SEEN_VERSION_KEY));

  setTheme(theme: Theme): void {
    applyTheme(theme);
    this.theme = theme;
  }

  setHaptics(on: boolean): void {
    setHapticsEnabled(on);
    this.haptics = on;
  }

  markVersionSeen(version: string = __APP_VERSION__): void {
    writeStorage(LAST_SEEN_VERSION_KEY, version);
    this.lastSeenVersion = version;
  }
}

export const prefs = new PrefsStore();
