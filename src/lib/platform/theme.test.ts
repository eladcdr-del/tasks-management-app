// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import indexHtml from '../../../index.html?raw';
import { THEME_COLORS, THEME_STORAGE_KEY, applyTheme, currentTheme } from './theme';
const headHtml = /<head>([\s\S]*)<\/head>/.exec(indexHtml)?.[1] ?? '';
const prePaintScript = /<script>([\s\S]*?)<\/script>/.exec(headHtml)?.[1] ?? '';

/** Resets <head> to index.html's and clears the theme. */
function loadIndexHead(): void {
  document.head.innerHTML = headHtml;
  delete document.documentElement.dataset.theme;
  localStorage.clear();
}

function themeColors(): { content: string | null; media: string | null }[] {
  return [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => ({
    content: m.getAttribute('content'),
    media: m.getAttribute('media')
  }));
}

const SYSTEM_METAS = [
  { content: THEME_COLORS.light, media: '(prefers-color-scheme: light)' },
  { content: THEME_COLORS.dark, media: '(prefers-color-scheme: dark)' }
];

beforeEach(loadIndexHead);

describe('index.html', () => {
  it('ships light + dark theme-color metas and a keyboard-aware viewport', () => {
    expect(themeColors()).toEqual(SYSTEM_METAS);
    expect(document.querySelector('meta[name="viewport"]')?.getAttribute('content')).toBe(
      'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content'
    );
  });

  it.each([
    ['dark', [{ content: THEME_COLORS.dark, media: null }]],
    ['light', [{ content: THEME_COLORS.light, media: null }]],
    ['system', SYSTEM_METAS]
  ] as const)('pre-paint script applies a saved %s theme', (theme, metas) => {
    expect(prePaintScript).toContain('homecare.theme');
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    new Function(prePaintScript)();
    expect(document.documentElement.dataset.theme).toBe(theme);
    expect(themeColors()).toEqual(metas);
  });
});

describe('applyTheme / currentTheme', () => {
  it('defaults to system', () => {
    expect(currentTheme()).toBe('system');
  });

  it('forces dark: storage, data-theme and a single dark theme-color', () => {
    applyTheme('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(themeColors()).toEqual([{ content: THEME_COLORS.dark, media: null }]);
    expect(currentTheme()).toBe('dark');
  });

  it('switches light → system, restoring both media-scoped metas', () => {
    applyTheme('light');
    expect(themeColors()).toEqual([{ content: THEME_COLORS.light, media: null }]);
    applyTheme('system');
    expect(themeColors()).toEqual(SYSTEM_METAS);
    expect(currentTheme()).toBe('system');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });

  it('reads a saved theme when <html data-theme> is not set yet', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(currentTheme()).toBe('light');
  });

  it('keeps the metas in <head>, before the rest of the head content', () => {
    applyTheme('dark');
    applyTheme('system');
    const names = [...document.head.querySelectorAll('meta')].map((m) => m.getAttribute('name'));
    expect(names.slice(0, 4)).toEqual([null, 'viewport', 'theme-color', 'theme-color']);
  });
});
