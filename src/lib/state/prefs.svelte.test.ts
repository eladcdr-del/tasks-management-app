// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY } from '$lib/platform/theme';
import { HAPTICS_STORAGE_KEY, isHapticsEnabled } from '$lib/platform/haptics';
import { LAST_SEEN_VERSION_KEY, PrefsStore } from './prefs.svelte';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('PrefsStore', () => {
  it('starts from what is stored / applied', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    localStorage.setItem(HAPTICS_STORAGE_KEY, 'off');
    localStorage.setItem(LAST_SEEN_VERSION_KEY, '0.0.9');
    const prefs = new PrefsStore();
    expect(prefs.theme).toBe('dark');
    expect(prefs.haptics).toBe(false);
    expect(prefs.lastSeenVersion).toBe('0.0.9');
  });

  it('defaults: system theme, haptics on, no version seen', () => {
    const prefs = new PrefsStore();
    expect(prefs.theme).toBe('system');
    expect(prefs.haptics).toBe(true);
    expect(prefs.lastSeenVersion).toBeNull();
  });

  it('setTheme applies at once and persists', () => {
    const prefs = new PrefsStore();
    prefs.setTheme('light');
    expect(prefs.theme).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('setHaptics persists for platform/haptics', () => {
    const prefs = new PrefsStore();
    prefs.setHaptics(false);
    expect(prefs.haptics).toBe(false);
    expect(isHapticsEnabled()).toBe(false);
    prefs.setHaptics(true);
    expect(isHapticsEnabled()).toBe(true);
  });

  it('markVersionSeen defaults to the build version', () => {
    const prefs = new PrefsStore();
    prefs.markVersionSeen();
    expect(prefs.lastSeenVersion).toBe(__APP_VERSION__);
    expect(localStorage.getItem(LAST_SEEN_VERSION_KEY)).toBe(__APP_VERSION__);
    prefs.markVersionSeen('9.9.9');
    expect(new PrefsStore().lastSeenVersion).toBe('9.9.9');
  });
});
