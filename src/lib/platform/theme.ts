// owner: step 1.1 — only that step edits this file (step 4.3's theme picker calls it).
//
// Runtime theme switching. Mirrors the pre-paint script in index.html:
//   localStorage['homecare.theme'] ∈ 'system' | 'light' | 'dark'  →  <html data-theme="…">
//   theme-color: 'system' = two media-scoped metas (light #FBF6EF / dark #1C1714);
//                'light' | 'dark' = one meta of that colour (so the Android status bar matches).
// Keep the colours in sync with --bg in src/styles/tokens.css and the metas in index.html.

export type Theme = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'homecare.theme';

export const THEME_COLORS = { light: '#FBF6EF', dark: '#1C1714' } as const;

export function isTheme(value: unknown): value is Theme {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** The applied theme (`<html data-theme>`), else the saved one, else `'system'`. */
export function currentTheme(): Theme {
  const applied = document.documentElement.dataset.theme;
  if (isTheme(applied)) return applied;
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(saved)) return saved;
  } catch {
    // Storage blocked (private mode): fall through.
  }
  return 'system';
}

/** Saves and applies a theme immediately: storage, `<html data-theme>`, theme-color metas. */
export function applyTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked: still apply for this session.
  }
  document.documentElement.dataset.theme = theme;
  syncThemeColor(theme);
}

function syncThemeColor(theme: Theme): void {
  const head = document.head;
  const old = head.querySelectorAll('meta[name="theme-color"]');
  const anchor = old[0] ?? null;
  const metas =
    theme === 'system'
      ? [
          themeColorMeta(THEME_COLORS.light, '(prefers-color-scheme: light)'),
          themeColorMeta(THEME_COLORS.dark, '(prefers-color-scheme: dark)')
        ]
      : [themeColorMeta(THEME_COLORS[theme])];
  for (const meta of metas) head.insertBefore(meta, anchor);
  old.forEach((meta) => meta.remove());
}

function themeColorMeta(content: string, media?: string): HTMLMetaElement {
  const meta = document.createElement('meta');
  meta.setAttribute('name', 'theme-color');
  meta.setAttribute('content', content);
  if (media) meta.setAttribute('media', media); // attribute, not the `.media` IDL (not everywhere)
  return meta;
}
